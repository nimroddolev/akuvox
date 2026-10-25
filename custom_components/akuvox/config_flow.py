"""Adds config flow for Akuvox."""
from __future__ import annotations

from datetime import datetime, timezone

from homeassistant import config_entries
from homeassistant.helpers import selector
from homeassistant.helpers.aiohttp_client import async_get_clientsession

import voluptuous as vol
from .api import AkuvoxApiClient
from .coordinator import AkuvoxDataUpdateCoordinator
from .credentials import async_store_credentials
from .repairs import async_clear_authentication_failure

from .const import (
    DOMAIN,
    LOGGER,
    LOCATIONS_DICT,
    COUNTRY_PHONE,
    SUBDOMAINS_LIST,
    TOKEN_REFRESHED_AT,
    TOKEN_UPDATE_REFRESHED,
    TOKEN_UPDATE_TYPE,
)
from .helpers import AkuvoxHelpers
from .sharing import (
    SHARED_MODE,
    SHARED_MODE_REMOTE,
    SHARED_SECRET,
    async_fetch_shared_snapshot,
    async_create_share,
    async_revoke_share,
    get_external_url,
    parse_pairing_uri,
)

helpers = AkuvoxHelpers()


def _normalise_subscriber_number(value: object) -> str:
    """Return a local subscriber number without its trunk-prefix zero."""
    number = str(value or "").replace("-", "").replace(" ", "")
    return number[1:] if number.startswith("0") else number


def _country_select_options() -> list[dict[str, str]]:
    """Return explicit, visible labels for the country selector."""
    return sorted(
        [
            {
                "value": str(location["country"]),
                "label": f"{location['country']} (+{location['phone_number']})",
            }
            for location in LOCATIONS_DICT.values()
        ],
        key=lambda option: option["label"],
    )


def _subdomain_select_options(*, include_default: bool) -> list[dict[str, str]]:
    """Return explicit labels for the optional regional API selector."""
    options = [
        {"value": subdomain, "label": subdomain}
        for subdomain in SUBDOMAINS_LIST
        if include_default or subdomain != "Default"
    ]
    if include_default:
        options[0]["label"] = "Automatic (recommended)"
    return options


def _email_login_schema(data: dict) -> vol.Schema:
    """Use the same account and regional override fields for setup and reauth."""
    return vol.Schema({
        vol.Required("login_account", default=data.get("login_account", "")): str,
        vol.Required("password"): str,
        vol.Optional("subdomain", default=data.get("subdomain", "Default")): selector.SelectSelector(
            selector.SelectSelectorConfig(options=_subdomain_select_options(include_default=True))
        ),
    })


class AkuvoxFlowHandler(config_entries.ConfigFlow, domain=DOMAIN):
    """Config flow for Akuvox."""

    VERSION = 1
    MINOR_VERSION = 2

    def __init__(self) -> None:
        """Initialise per-flow state without sharing it between flows."""
        super().__init__()
        self.data: dict[str, object] = {}
        self.rest_server_data: dict[str, object] = {}
        self.akuvox_api_client: AkuvoxApiClient | None = None

    @staticmethod
    def async_get_options_flow(config_entry: config_entries.ConfigEntry) -> config_entries.OptionsFlow:
        """Create the options flow."""
        return AkuvoxOptionsFlowHandler()

    async def async_step_user(self, user_input=None):
        """Choose a sign-in method or credentials shared by another HA."""
        return self.async_show_menu(
            step_id="user",
            menu_options=["sms_sign_in", "email_password_sign_in", "shared_credentials"],
        )

    async def async_step_email_password_sign_in(self, user_input=None):
        """Validate an email address (or username) and send an email OTP."""
        return await self._async_step_email_password_sign_in(user_input)

    async def async_step_shared_credentials(self, user_input=None):
        """Pair this entry with an existing Akuvox integration on another HA."""
        schema = vol.Schema({vol.Required("pairing_link"): str})
        if user_input is None:
            return self.async_show_form(step_id="shared_credentials", data_schema=schema)
        try:
            source_url, share_id, secret = parse_pairing_uri(user_input["pairing_link"])
            snapshot, _etag = await async_fetch_shared_snapshot(
                self.hass, source_url, share_id, secret
            )
            if snapshot is None:
                raise ValueError("The new pairing unexpectedly had no credential snapshot")
            credentials = snapshot["credentials"]
            receiver_secret = snapshot.get("receiver_secret")
            if receiver_secret is not None and (
                not isinstance(receiver_secret, str) or not receiver_secret
            ):
                raise ValueError("The credential source returned an invalid receiver secret")
            connection = snapshot.get("connection", {})
            device_data = snapshot.get("device_data", {})
            if not credentials.get("auth_token") or not credentials.get("token"):
                raise ValueError("The credential source returned no usable tokens")
        except (ValueError, PermissionError):
            return self.async_show_form(
                step_id="shared_credentials", data_schema=schema, errors={"base": "invalid_share"}
            )
        except Exception as error:  # Network and TLS failures should be user-actionable.
            LOGGER.warning("Unable to reach Akuvox credential source: %s", error)
            return self.async_show_form(
                step_id="shared_credentials", data_schema=schema, errors={"base": "cannot_reach_source"}
            )
        self.data = {
            SHARED_MODE: SHARED_MODE_REMOTE,
            "remote_source_url": source_url,
            "remote_share_id": share_id,
            # The source exchanges a one-time pairing secret for this private
            # receiver credential on the first successful request.
            SHARED_SECRET: receiver_secret or secret,
            **{key: connection.get(key, "") for key in ("host", "subdomain", "country_code", "phone_number")},
            **{
                key: device_data.get(key, [])
                for key in ("camera_data", "door_relay_data", "door_keys_data")
            },
            "activity_data": snapshot.get("activity_data", []),
            "call_data": snapshot.get("call_data", []),
            "shared_permissions": snapshot.get("permissions", {}),
            "hub_name": str(snapshot.get("account_label") or "Akuvox SmartPlus"),
            "auth_token": credentials["auth_token"],
            "token": credentials["token"],
        }
        return self.async_create_entry(
            title=str(snapshot.get("account_label") or "Akuvox SmartPlus"), data=self.data
        )

    async def async_step_sms_sign_in(self, user_input=None):
        """Initialise direct SMS sign-in."""

        # Initialize the API client
        if self.akuvox_api_client is None:
            self.akuvox_api_client = AkuvoxApiClient(
                session=async_get_clientsession(self.hass),
                hass=self.hass,
                entry=None,
            )

        return await self._async_step_sms_sign_in_legacy(user_input)

    async def async_step_reauth(self, _entry_data):
        """Begin reauthentication after SmartPlus can no longer refresh a session."""
        self._reauth_entry = self._get_reauth_entry()
        entry_data = dict(self._reauth_entry.data)
        if entry_data.get("login_method") == "email_password":
            self.data = {
                "login_method": "email_password",
                "login_account": str(entry_data.get("login_account", "")),
                "subdomain": str(
                    self._reauth_entry.options.get("subdomain", entry_data.get("subdomain", "Default"))
                    if self._reauth_entry.options.get("override", False)
                    else entry_data.get("subdomain", "Default")
                ),
            }
            self.akuvox_api_client = AkuvoxApiClient(
                session=async_get_clientsession(self.hass), hass=self.hass, entry=None
            )
            return await self.async_step_reauth_email_password()

        country_code = str(entry_data.get("country_code", ""))
        phone_number = _normalise_subscriber_number(entry_data.get("phone_number"))
        subdomain = str(entry_data.get("subdomain", ""))
        if not country_code or not phone_number:
            return self.async_abort(reason="reauth_missing_account_data")

        self.data = {
            "full_phone_number": entry_data.get(
                "full_phone_number", f"(+{country_code}) {phone_number}"
            ),
            "country_code": country_code,
            "phone_number": phone_number,
            "subdomain": subdomain or helpers.get_subdomain_from_country_code(country_code),
        }
        self.akuvox_api_client = AkuvoxApiClient(
            session=async_get_clientsession(self.hass),
            hass=self.hass,
            entry=None,
        )
        return await self.async_step_reauth_sms()

    async def async_step_reauth_sms(self, user_input=None):
        """Send an SMS code after the user selected SMS reauthentication."""
        try:
            code_sent = await self.akuvox_api_client.async_send_sms(
                self.hass,
                self.data["country_code"],
                self.data["phone_number"],
                self.data["subdomain"],
            )
        except Exception as error:
            LOGGER.warning("Unable to send SmartPlus reauthentication SMS: %s", error)
            code_sent = False
        if code_sent:
            return await self.async_step_reauth_confirm()
        return self.async_show_form(
            step_id="reauth_sms",
            data_schema=vol.Schema({}),
            errors={"base": "cannot_connect"},
        )

    async def async_step_reauth_confirm(self, user_input=None):
        """Validate the reauthentication SMS code and replace stored credentials."""
        schema = vol.Schema(
            {
                vol.Required(
                    "sms_code",
                    description="Enter the code sent to your SmartPlus phone number",
                ): str,
            }
        )
        if user_input is None:
            return self.async_show_form(
                step_id="reauth_confirm",
                data_schema=schema,
                errors={},
            )
        try:
            signed_in = await self.akuvox_api_client.async_sms_sign_in(
                self.data["phone_number"],
                self.data["country_code"],
                str(user_input["sms_code"]),
                start_polling=False,
            )
        except Exception as error:
            LOGGER.warning("SmartPlus reauthentication failed: %s", error)
            signed_in = False
        if not signed_in:
            return self.async_show_form(
                step_id="reauth_confirm",
                data_schema=schema,
                errors={"base": "invalid_auth"},
            )

        return await self._async_finish_reauthentication()

    async def async_step_reauth_email_password(self, user_input=None):
        """Request an email OTP to reauthenticate an email-login entry."""
        schema = _email_login_schema(self.data)
        if user_input is None:
            return self.async_show_form(step_id="reauth_email_password", data_schema=schema)
        return await self._async_begin_email_password_sign_in(
            user_input, step_id="reauth_email_password", schema=schema, reauth=True
        )

    async def async_step_reauth_verify_email_code(self, user_input=None):
        """Verify an emailed OTP while reauthenticating."""
        return await self._async_verify_email_code(user_input, reauth=True)

    async def _async_finish_reauthentication(self):
        """Persist validated credentials and reload the existing config entry."""
        devices = self.akuvox_api_client.get_devices_json()
        data = dict(self._reauth_entry.data)
        options = dict(self._reauth_entry.options)
        for target in (data, options):
            target.pop("auth_token", None)
            target.pop("token", None)
        credentials = self.akuvox_api_client.get_credentials()
        await async_store_credentials(
            self.hass,
            self._reauth_entry.entry_id,
            credentials["auth_token"],
            credentials["token"],
        )
        refreshed_at = datetime.now(timezone.utc).isoformat()
        data.update({
            "host": devices["host"],
            # Retain this copy for entries created by older releases.
            TOKEN_REFRESHED_AT: refreshed_at,
        })
        # Panel settings prefer entry options, so update them too. Otherwise a
        # prior options timestamp masks the successful reauthentication time.
        options[TOKEN_REFRESHED_AT] = refreshed_at
        options[TOKEN_UPDATE_TYPE] = TOKEN_UPDATE_REFRESHED
        data.update(self.data)
        data.update(
            {
                "camera_data": devices["camera_data"],
                "door_relay_data": devices["door_relay_data"],
                "door_keys_data": devices["door_keys_data"],
            }
        )
        if options.get("override", False):
            # A validated new gateway must not be masked by the old override on reload.
            for key in ("host", "subdomain"):
                options[key] = data.get(key, "")
        async_clear_authentication_failure(self.hass, self._reauth_entry)
        return self.async_update_reload_and_abort(
            self._reauth_entry,
            data=data,
            options=options,
            reason="reauth_successful",
        )

    async def _async_step_sms_sign_in_legacy(self, user_input=None):
        """Step 1: User enters their mobile phone country code and number.

        Args:
            user_input (dict): User-provided input data.

        Returns:
            dict: A dictionary representing the next step or an entry creation.

        """

        data_schema = self.get_sms_sign_in_schema(user_input)

        if user_input is not None:
            country_code = helpers.get_country_phone_code_from_name(user_input.get("country_code"))
            phone_number = _normalise_subscriber_number(user_input.get("phone_number"))
            subdomain: str = user_input.get("subdomain", "Default")
            subdomain = subdomain if subdomain != "Default" else helpers.get_subdomain_from_country_code(country_code)

            location_dict = helpers.get_location_dict(country_code)
            LOGGER.debug("User will use the API subdomain '%s' for %s", subdomain, location_dict.get("country"))

            self.data = {
                "full_phone_number": f"(+{country_code}) {phone_number}",
                "country_code": country_code,
                "phone_number": phone_number,
                "subdomain": subdomain
            }

            if len(country_code) > 0 and len(phone_number) > 0: # type: ignore
                # Request SMS code for login
                request_sms_code = await self.akuvox_api_client.async_send_sms(self.hass, country_code, phone_number, subdomain)
                if request_sms_code:
                    return await self.async_step_verify_sms_code()
                else:
                    return self.async_show_form(
                        step_id="sms_sign_in",
                        data_schema=vol.Schema(data_schema),
                        description_placeholders=user_input,
                        last_step=False,
                        errors={
                            "base": "SMS code request failed. Check your phone number."
                        }
                    )

            return self.async_show_form(
                step_id="sms_sign_in",
                data_schema=vol.Schema(data_schema),
                description_placeholders=user_input,
                last_step=False,
                errors={
                    "base": "Please enter a valid country code and phone number."
                }
            )

        return self.async_show_form(
            step_id="sms_sign_in",
            data_schema=vol.Schema(data_schema),
            description_placeholders=user_input,
            last_step=False,
        )

    async def _async_step_email_password_sign_in(self, user_input=None):
        """Validate an email address or username and request its OTP."""
        if self.akuvox_api_client is None:
            self.akuvox_api_client = AkuvoxApiClient(
                session=async_get_clientsession(self.hass), hass=self.hass, entry=None
            )
        schema = _email_login_schema(self.data)
        if user_input is None:
            return self.async_show_form(step_id="email_password_sign_in", data_schema=schema)
        return await self._async_begin_email_password_sign_in(
            user_input, step_id="email_password_sign_in", schema=schema, reauth=False
        )

    async def _async_begin_email_password_sign_in(self, user_input, *, step_id, schema, reauth):
        """Check password, send OTP, and retain only non-secret flow state."""
        login_account = str(user_input.get("login_account", "")).strip()
        password = str(user_input.get("password", ""))
        if not login_account or not password:
            return self.async_show_form(step_id=step_id, data_schema=schema, errors={"base": "invalid_auth"})
        subdomain = str(user_input.get("subdomain", self.data.get("subdomain", "Default")))
        if subdomain not in SUBDOMAINS_LIST:
            return self.async_show_form(step_id=step_id, data_schema=schema, errors={"base": "invalid_auth"})
        if subdomain == "Default":
            subdomain = helpers.get_subdomain_from_country(self.hass.config.country)
        try:
            response = await self.akuvox_api_client.async_begin_email_sign_in(
                login_account, password, subdomain)
            payload = (response or {}).get("datas", response or {})
            temporary_token = str(payload.get("two_factor_auth_temp_token", ""))
            if not temporary_token and payload.get("token"):
                # This account signs in without an email OTP
                return await self._async_finish_direct_password_sign_in(
                    login_account, step_id=step_id, schema=schema, reauth=reauth)
            if not temporary_token:
                LOGGER.warning("SmartPlus password login returned no email OTP challenge")
                code_sent = False
            else:
                code_sent = await self.akuvox_api_client.async_send_email_otp(
                    login_account, temporary_token
                )
                if not code_sent:
                    LOGGER.warning("SmartPlus rejected the email OTP request")
        except Exception as error:
            LOGGER.warning("Unable to request SmartPlus email OTP: %s", error)
            code_sent = False
        if not code_sent:
            return self.async_show_form(step_id=step_id, data_schema=schema, errors={"base": "cannot_connect"})
        self._store_email_login(login_account)
        return await (
            self.async_step_reauth_verify_email_code() if reauth else self.async_step_verify_email_code()
        )

    def _store_email_login(self, login_account: str) -> None:
        """Keep the login name and the gateway that accepted it, never the password."""
        self.data.update({
            "login_method": "email_password",
            "login_account": login_account,
            "subdomain": self.akuvox_api_client.get_subdomain(),
        })

    async def _async_finish_direct_password_sign_in(self, login_account, *, step_id, schema, reauth):
        """Create or reauthenticate the entry when SmartPlus required no email OTP."""
        try:
            signed_in = await self.akuvox_api_client.async_finish_password_sign_in(start_polling=False)
        except Exception as error:
            LOGGER.warning("SmartPlus password sign-in failed: %s", error)
            signed_in = False
        if not signed_in:
            return self.async_show_form(step_id=step_id, data_schema=schema, errors={"base": "cannot_connect"})
        self._store_email_login(login_account)
        if reauth:
            return await self._async_finish_reauthentication()
        self.data.update(self.akuvox_api_client.get_devices_json())
        self.data.update(self.akuvox_api_client.get_credentials())
        return self.async_create_entry(title=self.akuvox_api_client.get_title(), data=self.data)

    async def async_step_verify_email_code(self, user_input=None):
        """Verify the emailed OTP and create the entry."""
        return await self._async_verify_email_code(user_input, reauth=False)

    async def _async_verify_email_code(self, user_input, *, reauth):
        schema = vol.Schema({vol.Required("email_code"): str})
        if user_input is None:
            return self.async_show_form(
                step_id="reauth_verify_email_code" if reauth else "verify_email_code",
                data_schema=schema,
            )
        try:
            signed_in = await self.akuvox_api_client.async_email_otp_sign_in(
                str(self.data["login_account"]), str(user_input["email_code"]), start_polling=False
            )
        except Exception as error:
            LOGGER.warning("SmartPlus email OTP sign-in failed: %s", error)
            signed_in = False
        if not signed_in:
            return self.async_show_form(
                step_id="reauth_verify_email_code" if reauth else "verify_email_code",
                data_schema=schema, errors={"base": "invalid_auth"},
            )
        if reauth:
            return await self._async_finish_reauthentication()
        self.data.update(self.akuvox_api_client.get_devices_json())
        self.data.update(self.akuvox_api_client.get_credentials())
        return self.async_create_entry(title=self.akuvox_api_client.get_title(), data=self.data)

    async def async_step_verify_sms_code(self, user_input=None):
        """Step 2: User enters the SMS code received on their phone for verifiation.

        Args:
            user_input (dict): User-provided input data.

        Returns:
            dict: A dictionary representing the next step or an entry creation.

        """

        data_schema = {
            vol.Required(
                "sms_code",
                msg=None,
                description="Enter the code from the SMS you received on your device."): str,
        }

        if user_input is not None and user_input:
            sms_code = user_input.get("sms_code")
            country_code = self.data["country_code"]
            phone_number = self.data["phone_number"]

            # Validate SMS code
            sign_in_response = await self.akuvox_api_client.async_sms_sign_in(
                phone_number,
                country_code,
                sms_code)
            if sign_in_response is True:

                devices_json = self.akuvox_api_client.get_devices_json()
                self.data.update(devices_json)
                # A config-entry ID is not available until Home Assistant
                # creates the entry.  Carry the fresh tokens through this
                # one setup so ``async_load_and_migrate_credentials`` can
                # move them straight into private storage and remove them
                # from the entry again.
                self.data.update(self.akuvox_api_client.get_credentials())

                ################################
                ### Create integration entry ###
                ################################
                return self.async_create_entry(
                    title=self.akuvox_api_client.get_title(),
                    data=self.data
                )

            user_input = None
            return self.async_show_form(
                step_id="verify_sms_code",
                data_schema=vol.Schema(data_schema),
                description_placeholders=user_input,
                last_step=True,
                errors={
                    "sms_code": "Invalid SMS code. Please enter the correct code."
                }
            )

        return self.async_show_form(
            step_id="verify_sms_code",
            data_schema=vol.Schema(data_schema),
            description_placeholders=user_input,
            last_step=True
        )

    def get_sms_sign_in_schema(self, user_input):
        """Get the schema for sms_sign_in step."""
        user_input = user_input or {}

        # List of countries
        default_country_name_code = helpers.find_country_name_code(str(COUNTRY_PHONE.get(self.hass.config.country,"")))
        default_country_name = LOCATIONS_DICT.get(default_country_name_code, {}).get("country") # type: ignore
        country_options = _country_select_options()

        return {
            vol.Required("country_code",
                         default=default_country_name,
                         description="Your phone's international calling code prefix"):
                         selector.SelectSelector(
                             selector.SelectSelectorConfig(
                                 options=country_options,
                                 mode=selector.SelectSelectorMode.DROPDOWN,
                                 custom_value=False),
                                 ),
            vol.Required(
                "phone_number",
                msg=None,
                default=user_input.get("phone_number"),  # type: ignore
                description="Your phone number"): str,
            vol.Optional("subdomain",
                default="Default", # type: ignore
                description="Manually set the regional API subdomain"):
                selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=_subdomain_select_options(include_default=True),
                        mode=selector.SelectSelectorMode.DROPDOWN,
                        custom_value=True),
                        )
        }

class AkuvoxOptionsFlowHandler(config_entries.OptionsFlow):
    """Handle options flow for Akuvox integration."""

    def __init__(self) -> None:
        """Initialise per-options-flow state."""
        super().__init__()
        self.akuvox_api_client: AkuvoxApiClient | None = None

    async def async_step_init(self, user_input=None):
        """Initialize the options flow."""
        # Define the options schema
        config_data = dict(self.config_entry.data)

        default_country_name_code = helpers.find_country_name_code(config_data.get('country_code', self.hass.config.country))
        default_country_name = LOCATIONS_DICT.get(default_country_name_code, {}).get("country") # type: ignore
        default_subdomain = LOCATIONS_DICT.get(default_country_name_code, {}).get("subdomain") # type: ignore
        current_subdomain = self.get_data_key_value("subdomain") or default_subdomain

        options_schema = vol.Schema({
            vol.Optional("country",
                         default=default_country_name,
                         description="Your country code"):
                         selector.SelectSelector(
                             selector.SelectSelectorConfig(
                                 options=_country_select_options(),
                                 mode=selector.SelectSelectorMode.DROPDOWN,
                                 custom_value=False),
                                 ),
            vol.Optional("subdomain",
                default=current_subdomain, # type: ignore
                description="Manually set the regional API subdomain"):
                selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=_subdomain_select_options(include_default=False),
                        mode=selector.SelectSelectorMode.DROPDOWN,
                        custom_value=True),
                        ),
            vol.Optional("create_share_for", default="", description="Create a 10-minute pairing link for this receiver"): str,
            vol.Optional("revoke_pairing_link", default="", description="Revoke a pairing link created by this Home Assistant"): str,
        })

        # Show the form with the current options
        if user_input is None:
            return self.async_show_form(
                step_id="init",
                data_schema=options_schema,
                description_placeholders=user_input,
                last_step=True
            )

        receiver_name = str(user_input.pop("create_share_for", "")).strip()
        revoke_link = str(user_input.pop("revoke_pairing_link", "")).strip()
        if revoke_link:
            try:
                _source_url, share_id, _secret = parse_pairing_uri(revoke_link)
                if not await async_revoke_share(self.hass, share_id):
                    raise ValueError("Unknown share")
            except ValueError:
                return self.async_show_form(
                    step_id="init", data_schema=options_schema,
                    errors={"base": "invalid_share"},
                )
        if receiver_name:
            try:
                pairing_link = await async_create_share(
                    self.hass,
                    self.config_entry,
                    get_external_url(self.hass),
                    receiver_name,
                    [
                        *[f"camera:{item.get('name', '')}" for item in self.config_entry.data.get("camera_data", [])],
                        *[f"relay:{item.get('mac', '')}:{item.get('relay_id', '')}" for item in self.config_entry.data.get("door_relay_data", [])],
                    ],
                )
            except (AttributeError, ValueError):
                return self.async_show_form(
                    step_id="init", data_schema=options_schema,
                    errors={"base": "external_url_required"},
                )
            self._options_after_share = user_input
            return self.async_show_form(
                step_id="share_created",
                data_schema=vol.Schema({vol.Required("pairing_link", default=pairing_link): str}),
                description_placeholders={"receiver_name": receiver_name},
            )

        # API client
        if self.akuvox_api_client is None:
            coordinator: AkuvoxDataUpdateCoordinator = self.hass.data[DOMAIN][
                self.config_entry.entry_id
            ]
            self.akuvox_api_client = coordinator.client
            self.akuvox_api_client._data.subdomain = current_subdomain # type: ignore
            self.akuvox_api_client._data.host = self.get_data_key_value("host") # type: ignore
            self.akuvox_api_client._data.phone_number = self.get_data_key_value("phone_number") # type: ignore
        # User input is valid, update the options
        LOGGER.debug("Updating configuration...")
        return self.async_create_entry(
            data=user_input, # type: ignore
            title="",
        )

    async def async_step_share_created(self, _user_input=None):
        """Finish after the user copies the one-time pairing link."""
        return self.async_create_entry(data=getattr(self, "_options_after_share", {}), title="")

    def get_data_key_value(self, key, placeholder=None):
        """Get the value for a given key. Options flow 1st, Config flow 2nd."""
        dicts = [dict(self.config_entry.options), dict(self.config_entry.data)]
        for p_dict in dicts:
            if key in p_dict:
                return p_dict[key]
        return placeholder
