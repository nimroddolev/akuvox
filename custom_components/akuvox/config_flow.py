"""Adds config flow for Akuvox."""
from __future__ import annotations

from homeassistant import config_entries
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import selector

import voluptuous as vol
from .api import AkuvoxApiClient
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

    @staticmethod
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
                data=None,
            )
            await self.akuvox_api_client.async_init_api_data()

        return self.async_show_menu(
            step_id="user",
            menu_options=["sms_sign_in_warning", "app_tokens_sign_in"],
            description_placeholders=user_input,
        )

    async def async_step_sms_sign_in_warning(self, user_input=None):
        """Step 1a: Warning before continuing with login via SMS Verification."""
        errors = {}
        sms_sign_in = "Continue with SMS Verification Sign"
        app_tokens_sign_in = "Sign-in via app tokens"
        data_schema = {
            "warning_option_selection": selector({
                "select": {
                    "options": [sms_sign_in, app_tokens_sign_in],
                }
            })
        }
        if user_input is not None:
            if "warning_option_selection" in user_input:
                selection = user_input["warning_option_selection"]
                if selection == sms_sign_in:
                    return self.async_show_form(
                        step_id="sms_sign_in",
                        data_schema=vol.Schema(self.get_sms_sign_in_schema()),
                        description_placeholders=user_input,
                        last_step=False,
                        errors=None
                    )
                if selection == app_tokens_sign_in:
                    return self.async_show_form(
                        step_id="app_tokens_sign_in",
                        data_schema=vol.Schema(self.get_app_tokens_sign_in_schema()),
                        description_placeholders=user_input,
                        last_step=False,
                        errors=None
                    )
                errors["base"] = "Please choose a sign-in option."
            else:
                errors["base"] = "Please choose a valid sign-in option."

        return self.async_show_form(
            step_id="sms_sign_in_warning",
            data_schema=vol.Schema(data_schema),
            description_placeholders=user_input,
            last_step=False,
            errors=errors
        )


    async def async_step_sms_sign_in(self, user_input=None):
        """Step 1b: User enters their mobile phone country code and number.

        Args:
            user_input (dict): User-provided input data.

        Returns:
            dict: A dictionary representing the next step or an entry creation.
        """

        data_schema = self.get_sms_sign_in_schema()

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


    async def async_step_app_tokens_sign_in(self, user_input=None):
        """Step 1c: User enters app tokens and phone number to sign in."""
        data_schema = self.get_app_tokens_sign_in_schema()
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

            # Perform login via auth_token, token and phone number
            if all(len(value) > 0 for value in (country_code, phone_number, token, auth_token)):
                # Retrieve ervers_list data.
                login_successful = await self.akuvox_api_client.async_make_servers_list_request(
                    auth_token, token, phone_number)
                if login_successful is True:
                    # Retrieve connected device data
                    await self.akuvox_api_client.async_retrieve_user_data()
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
                    step_id="app_tokens_sign_in",
                    data_schema=vol.Schema(self.get_app_tokens_sign_in_schema()),
                    description_placeholders=user_input,
                    last_step=False,
                    errors={
                        "base": "Sign in failed. Please check the values entered and try again."
                    }
                )

            return self.async_show_form(
                step_id="app_tokens_sign_in",
                data_schema=vol.Schema(data_schema),
                description_placeholders=user_input,
                last_step=False,
                errors={
                    "base": "Please check the values enterted and try again."
                }
            )

        return self.async_show_form(
            step_id="app_tokens_sign_in",
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
            sign_in_response = await self.akuvox_api_client.async_sign_in(
                phone_number,
                country_code,
                sms_code)
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

    def get_sms_sign_in_schema(self):
        """Get the schema for sms_sign_in step."""
        return {
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

    def get_app_tokens_sign_in_schema(self):
        """Get the schema for app_tokens_sign_in step."""
        return {
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

class AkuvoxOptionsFlowHandler(config_entries.OptionsFlow):
    """Handle options flow for Akuvox integration."""

    akuvox_api_client: AkuvoxApiClient = None  # type: ignore

    def __init__(self, config_entry: config_entries.ConfigEntry):
        """Initialize options flow."""
        self.config_entry = config_entry

    async def async_step_init(self, user_input=None):
        """Initialize the options flow."""

        # Define the options schema
        config_options = dict(self.config_entry.options)
        config_data = dict(self.config_entry.data)

        options_schema = vol.Schema({
            vol.Required("override",
                         default=self.get_data_key_value("override", False) # type: ignore
            ): bool,
            vol.Optional("auth_token",
                         default=self.get_data_key_value("auth_token", False) # type: ignore
            ): str,
            vol.Optional("token",
                         default=self.get_data_key_value("token", False) # type: ignore
            ): str,
        })

        # Show the form with the current options
        if user_input is None:
            return self.async_show_form(
                step_id="init",
                data_schema=options_schema,
                description_placeholders=user_input,
                last_step=True
            )

        # Use the new tokens supplied by the user
        camera_data = None
        door_relay_data = None
        door_keys_data = None
        if user_input.get("override", False) is True:
            LOGGER.debug("New user tokens set. Refreshing device data...")

            # Initialize the API client
            if self.akuvox_api_client is None:
                self.akuvox_api_client = AkuvoxApiClient(
                    session=async_get_clientsession(self.hass),
                    hass=self.hass,
                    data=None
                )
            await self.akuvox_api_client.async_init_api_data()

            # Retrieve device data
            user_data_retrieved = await self.akuvox_api_client.async_retrieve_user_data_with_tokens(
                user_input["auth_token"],
                user_input["token"])
            if user_data_retrieved is True:
                devices_json = self.akuvox_api_client.get_devices_json()
                if devices_json is not None and all(key in devices_json for key in (
                    "camera_data",
                    "door_relay_data",
                    "door_keys_data")
                ):
                    camera_data = devices_json["camera_data"]
                    door_relay_data = devices_json["door_relay_data"]
                    door_keys_data = devices_json["door_keys_data"]
                    options_schema = vol.Schema({
                        vol.Required("override",
                                        default=config_options.get("override", None)): bool,
                        vol.Required("token", default=config_options.get("token", None)): str,
                        vol.Optional("camera_data", default=camera_data): dict,
                        vol.Optional("door_relay_data", default=door_relay_data): dict,
                        vol.Optional("door_keys_data", default=door_keys_data): dict,
                    })

                    ############################################
                    # User input is valid - update the options #
                    ############################################
                    LOGGER.debug("Configuration values changed. Updating...")
                    return self.async_create_entry(
                        data=user_input,
                        description_placeholders=user_input,
                    )

            data_schema = {
                vol.Required(
                    "override",
                    msg=None,
                    default=user_input.get("override", False),
                    description={
                        "auth_token": f"Current auth_token: {config_data['auth_token']}",
                        "token": f"Current token: {config_data['token']}",
                    },
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
                errors={"token": ("Unable to receive device list. Check your token.")}
            )

        # User input is valid, update the options
        LOGGER.debug("Initial token set.")
        user_input = None
        return self.async_create_entry(
            data=user_input, # type: ignore
            description_placeholders=user_input,
        )

    def get_data_key_value(self, key, placeholder=None):
        """Get the value for a given key. Options flow 1st, Config flow 2nd."""
        config_options = dict(self.config_entry.options)
        config_data = dict(self.config_entry.data)
        if key in config_options:
            return config_options[key]
        if key in config_data:
            return config_data[key]
        return placeholder
