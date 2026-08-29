"""Adds config flow for Akuvox."""
from __future__ import annotations

from datetime import datetime, timezone

from homeassistant import config_entries
from homeassistant.helpers import selector
from homeassistant.helpers.aiohttp_client import async_get_clientsession

import voluptuous as vol
from .api import AkuvoxApiClient
from .coordinator import AkuvoxDataUpdateCoordinator
from .credentials import async_get_credentials, async_store_credentials
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
        """Step 0: Initialise the API client and proceed directly to SMS sign-in."""

        # Initialize the API client
        if self.akuvox_api_client is None:
            self.akuvox_api_client = AkuvoxApiClient(
                session=async_get_clientsession(self.hass),
                hass=self.hass,
                entry=None,
            )

        return self.async_show_form(
            step_id="sms_sign_in",
            data_schema=vol.Schema(self.get_sms_sign_in_schema(user_input)),
            description_placeholders=user_input,
            last_step=False,
        )

    async def async_step_reauth(self, _entry_data):
        """Begin reauthentication after SmartPlus can no longer refresh a session."""
        self._reauth_entry = self._get_reauth_entry()
        entry_data = dict(self._reauth_entry.data)
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
        async_clear_authentication_failure(self.hass, self._reauth_entry)
        return self.async_update_reload_and_abort(
            self._reauth_entry,
            data=data,
            options=options,
            reason="reauth_successful",
        )

    async def async_step_sms_sign_in(self, user_input=None):
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
        })

        # Show the form with the current options
        if user_input is None:
            return self.async_show_form(
                step_id="init",
                data_schema=options_schema,
                description_placeholders=user_input,
                last_step=True
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

    def get_data_key_value(self, key, placeholder=None):
        """Get the value for a given key. Options flow 1st, Config flow 2nd."""
        dicts = [dict(self.config_entry.options), dict(self.config_entry.data)]
        for p_dict in dicts:
            if key in p_dict:
                return p_dict[key]
        return placeholder
