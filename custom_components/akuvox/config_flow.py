"""Adds config flow for Akuvox."""
from __future__ import annotations

from homeassistant import config_entries
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from .api import AkuvoxApiClient
import voluptuous as vol

from .const import (
    DOMAIN,
    DEFAULT_COUNTRY_CODE,
    DEFAULT_PHONE_NUMBER,
    DEFAULT_TOKEN,
    DEFAULT_APP_TOKEN,
    LOGGER
)


class AkuvoxFlowHandler(config_entries.ConfigFlow, domain=DOMAIN):
    """Config flow for Akuvox."""

    VERSION = 1
    data: dict = {}
    rest_server_data: dict = {}
    akuvox_api_client: AkuvoxApiClient = None  # type: ignore

    def async_get_options_flow(config_entry: config_entries.ConfigEntry) -> config_entries.OptionsFlow:
        """Create the options flow."""
        return AkuvoxOptionsFlowHandler(config_entry)

    async def async_step_user(self, user_input=None):
        """Step 0: User selects sign-in method."""

        # Initialize the API client
        if self.akuvox_api_client is None:
            self.akuvox_api_client = AkuvoxApiClient(
                session=async_get_clientsession(self.hass),
                hass=self.hass,
            )
            await self.akuvox_api_client.async_init_api_data()

        return self.async_show_menu(
            step_id="user",
            menu_options=["sms_sign_in", "app_tokens"],
        )

    async def async_step_sms_sign_in(self, user_input=None):
        """Step 1a: User enters their mobile phone country code and number.

        Args:
            user_input (dict): User-provided input data.

        Returns:
            dict: A dictionary representing the next step or an entry creation.
        """

        data_schema = {
            vol.Required(
                "country_code",
                msg=None,
                default=DEFAULT_COUNTRY_CODE,  # type: ignore
                description="Your phone's international calling code prefix, eg: +1"): str,
            vol.Required(
                "phone_number",
                msg=None,
                default=DEFAULT_PHONE_NUMBER,  # type: ignore
                description="Your phone number"): str,
        }

        if user_input is not None:
            country_code = user_input.get(
                "country_code", "").replace("+", "").replace(" ", "")
            phone_number = user_input.get(
                "phone_number", "").replace("-", "").replace(" ", "")

            self.data = {
                "full_phone_number": f"(+{country_code}) {phone_number}",
                "country_code": country_code,
                "phone_number": phone_number,
            }

            if len(country_code) > 0 and len(phone_number) > 0:
                # Request SMS code for login
                request_sms_code = await self.akuvox_api_client.send_sms(country_code, phone_number)
                if request_sms_code:
                    return await self.async_step_verify_sms_code()
                else:
                    return self.async_show_form(
                        step_id="sms_sign_in",
                        data_schema=vol.Schema(data_schema),
                        description_placeholders=user_input,
                        last_step=False,
                        errors={
                            "base": "SMS code request failed. Please check your phone number and try again."
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


    async def async_step_app_tokens(self, user_input=None):
        """Step 1b: User enters app tokens and phone number to sign in."""
        data_schema = {
            vol.Required(
                "country_code",
                msg=None,
                default=DEFAULT_COUNTRY_CODE,  # type: ignore
                description="Your phone's international calling code prefix"): str,
            vol.Required(
                "phone_number",
                msg=None,
                default=DEFAULT_PHONE_NUMBER,  # type: ignore
                description="Your phone number"): str,
            vol.Required(
                "auth_token",
                msg=None,
                default=DEFAULT_APP_TOKEN,  # type: ignore
                description="Your SmartPlus account's auth_token string"): str,
            vol.Required(
                "token",
                msg=None,
                default=DEFAULT_TOKEN,  # type: ignore
                description="Your SmartPlus account's token string"): str,
        }

        if user_input is not None:
            country_code = user_input.get(
                "country_code", "").replace("+", "").replace(" ", "")
            phone_number = user_input.get(
                "phone_number", "").replace("-", "").replace(" ", "")
            token = user_input.get("token", "")
            auth_token = user_input.get("auth_token", "")

            self.data = {
                "full_phone_number": f"(+{country_code}) {phone_number}",
                "country_code": country_code,
                "phone_number": phone_number,
                "token": token,
                "auth_token": auth_token,
            }

            # Perform login via auth string, auth_token stirng and phone number (no need for SMS code)
            if len(country_code) > 0 and len(phone_number) > 0 and len(token) > 0 and len(auth_token) > 0:
                    # Retrieve ervers_list data.
                    login_successful = await self.akuvox_api_client.async_make_servers_list_request(auth_token, token, phone_number)
                    if login_successful is True:
                        devices_json = self.akuvox_api_client.get_devices_json()
                        self.data.update(devices_json)

                        ################################
                        ### Create integration entry ###
                        ################################
                        return self.async_create_entry(
                            title=self.akuvox_api_client.get_title(),
                            data=self.data
                        )

                    return self.async_show_form(
                        step_id="app_tokens",
                        data_schema=vol.Schema({
                            vol.Required(
                                "country_code",
                                msg=None,
                                default=user_input.get("country_code", DEFAULT_COUNTRY_CODE),  # type: ignore
                                description="Your phone's international calling code prefix"): str,
                            vol.Required(
                                "phone_number",
                                msg=None,
                                default=user_input.get("phone_number", DEFAULT_PHONE_NUMBER),  # type: ignore
                                description="Your phone number"): str,
                            vol.Required(
                                "token",
                                msg=None,
                                default=user_input.get("token", ""),  # type: ignore
                                description="Your SmartPlus account's token string"): str,
                            vol.Required(
                                "auth_token",
                                msg=None,
                                default=user_input.get("auth_token", ""),  # type: ignore
                                description="Your SmartPlus account's auth_token string"): str,
                        }),
                        description_placeholders=user_input,
                        last_step=False,
                        errors={
                            "base": "Sign in failed. Please check the values entered and try again."
                        }
                    )

            return self.async_show_form(
                step_id="app_tokens",
                data_schema=vol.Schema(data_schema),
                description_placeholders=user_input,
                last_step=False,
                errors={
                    "base": "Please check the values enterted and try again."
                }
            )

        return self.async_show_form(
            step_id="app_tokens",
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
            vol.Required("sms_code", msg=None, description="Enter the code from the SMS you received on your device."): str,
        }

        if user_input is not None and user_input:
            sms_code = user_input.get("sms_code")
            country_code = self.data["country_code"]
            phone_number = self.data["phone_number"]

            # Validate SMS code
            sign_in_response = await self.akuvox_api_client.async_sign_in(phone_number, country_code, sms_code)
            if sign_in_response is True:

                devices_json = self.akuvox_api_client.get_devices_json()
                self.data.update(devices_json)

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

class AkuvoxOptionsFlowHandler(config_entries.OptionsFlow ):
    """Handle options flow for Akuvox integration."""

    akuvox_api_client: AkuvoxApiClient = None  # type: ignore

    def __init__(self, config_entry: config_entries.ConfigEntry):
        """Initialize options flow."""
        self.config_entry = config_entry

    async def async_step_init(self, user_input=None):
        """Initialize the options flow."""

        # Define the options schema
        current_options = dict(self.config_entry.options)
        options_schema = vol.Schema({
            vol.Required("override", default=current_options.get("override", False)): bool,
            vol.Optional("token", default=current_options.get("token", "")): str,
        })

        # Show the form with the current options
        if user_input is None:
            return self.async_show_form(
                step_id="init",
                data_schema=options_schema,
                description_placeholders=user_input,
                last_step=True
            )

        # Use the new token supplied by the user
        camera_data = None
        door_relay_data = None
        if user_input.get("override", False) is True:
            LOGGER.debug("New user token set. Refreshing device data...")

            # Initialize the API client
            if self.akuvox_api_client is None:
                self.akuvox_api_client = AkuvoxApiClient(
                    session=async_get_clientsession(self.hass),
                    hass=self.hass,
                )
            await self.akuvox_api_client.async_init_api_data()

            # Retrieve device data
            device_list_updated = await self.akuvox_api_client.asunc_user_conf_with_token(user_input["token"])
            if device_list_updated is True:
                LOGGER.debug("New device data received.")
                devices_json = self.akuvox_api_client.get_devices_json()
                if devices_json is not None and "camera_data" in devices_json and "door_relay_data" in devices_json:
                    camera_data = devices_json["camera_data"]
                    door_relay_data = devices_json["door_relay_data"]
                    options_schema = vol.Schema({
                        vol.Required("override", default=current_options.get("override", None)): bool,
                        vol.Required("token", default=current_options.get("token", None)): str,
                        vol.Optional("camera_data", default=camera_data): dict,
                        vol.Optional("door_relay_data", default=door_relay_data): dict,
                    })

                    ############################################
                    # User input is valid - update the options #
                    ############################################
                    LOGGER.debug("Configuration values changed. Updating...")
                    return self.async_create_entry(
                        data=user_input,
                        description_placeholders=user_input,
                    )
            else:
                LOGGER.debug("Unable to retrieve new device data.")

            data_schema = {
                vol.Required(
                    "override",
                    msg=None,
                    default=user_input.get("override", False),
                    description="Use your SmartPlus user's token?"
                ): bool,
                vol.Optional(
                    "token",
                    msg=None,
                    default=user_input.get("token", ""),
                    description="Your SmartPlus user's token."
                ): str
            }
            return self.async_show_form(
                step_id="init",
                data_schema=vol.Schema(data_schema),
                # description_placeholders=user_input,
                # last_step=True,
                errors={
                    "token": ("Unable to receive device list. Check your token.")
                }
            )

        # User input is valid, update the options
        LOGGER.debug("Initial token set.")
        user_input = None
        return self.async_create_entry(
            data=user_input, # type: ignore
            description_placeholders=user_input,
        )
