"""Adds config flow for Akuvox."""
from __future__ import annotations

from homeassistant import config_entries
import voluptuous as vol  # Import voluptuous for validation

from .api import (
    AkuvoxApiClient,
    AkuvoxApiClientAuthenticationError,
    AkuvoxApiClientCommunicationError,
    AkuvoxApiClientError,
)
from .const import DOMAIN

COUNTRY_CODES = ["+1", "+44", "+972"]  # Add more country codes as needed


class AkuvoxFlowHandler(config_entries.ConfigFlow, domain=DOMAIN):
    """Config flow for Akuvox."""

    VERSION = 1
    data: dict | None = None

    async def async_step_user(self, user_input=None):
        """Step 1: User enters their mobile phone country code and number.

        Args:
            user_input (dict): User-provided input data.

        Returns:
            dict: A dictionary representing the next step or an entry creation.
        """
        if user_input is not None:
            country_code = user_input.get("country_code")
            phone_number = user_input.get("phone_number")

            # Combine country code and phone number
            full_phone_number = f"{country_code}{phone_number}"

            self.data = {"full_phone_number": full_phone_number}
            sms_sent = await self.send_sms(full_phone_number)

            if sms_sent:
                return await self.async_step_verify_sms_code()
                return await self.async_show_form(step_id="verify_sms_code")
            else:
                return self.async_show_form(
                    step_id="user",
                    errors={
                        "base": "Failed to send SMS code. Please check your phone number and try again."}
                )

        data_schema = {
            vol.Required("country_code", default="+1"): vol.In(COUNTRY_CODES),
            vol.Required("phone_number"): str,
        }

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(data_schema),
        )

    async def async_step_verify_sms_code(self, user_input=None):
        """Step 2: User enters the SMS code received on their phone for verifiation.

        Args:
            user_input (dict): User-provided input data.

        Returns:
            dict: A dictionary representing the next step or an entry creation.
        """
        if user_input is not None:
            sms_code = user_input.get("sms_code")

            # Validate SMS code (you should implement this validation logic)
            user_data = await self.validate_sms_code(sms_code)
            if user_data is not None:
                # If the user is signed in, proceed to verification result
                self.data["user_data"] = user_data  # type: ignore
                return self.async_create_entry(
                    title=self.data["full_phone_number"],
                    data=self.data
                )
            else:
                return self.async_show_form(
                    step_id="verify_sms_code",
                    errors={
                        "sms_code": "Invalid SMS code. Please enter the correct code."}
                )

        return self.async_show_form(
            step_id="verify_sms_code",
            data_schema=vol.Schema({
                # Add a text field for entering SMS code
                vol.Required("sms_code"): str
            })
        )

    async def send_sms(self, full_phone_number):
        """Request SMS code to user's device."""
        # Implement code to send SMS with the provided full phone number
        # Use a third-party service or API for this
        # Return True if SMS sent successfully, False otherwise
        # Send SMS logic goes here
        return True  # Replace with your actual SMS sending logic

    async def validate_sms_code(self, sms_code):
        """Validate the SMS code received by the user."""
        # Implement code to validate the entered SMS code
        # You might need to compare it with the code sent earlier
        # Return True if code is valid, False otherwise
        # Validation logic goes here
        return True  # Replace with your actual SMS code validation logic

    # async def async_step_user(
    #     self,
    #     user_input: dict | None = None,
    # ) -> config_entries.FlowResult:
    #     """Handle a flow initialized by the user."""
    #     _errors = {}
    #     if user_input is not None:
    #         try:
    #             await self._test_credentials(
    #                 username=user_input[CONF_USERNAME],
    #                 password=user_input[CONF_PASSWORD],
    #             )
    #         except AkuvoxApiClientAuthenticationError as exception:
    #             LOGGER.warning(exception)
    #             _errors["base"] = "auth"
    #         except AkuvoxApiClientCommunicationError as exception:
    #             LOGGER.error(exception)
    #             _errors["base"] = "connection"
    #         except AkuvoxApiClientError as exception:
    #             LOGGER.exception(exception)
    #             _errors["base"] = "unknown"
    #         else:
    #             return self.async_create_entry(
    #                 title=user_input[CONF_USERNAME],
    #                 data=user_input,
    #             )

    #     return self.async_show_form(
    #         step_id="user",
    #         data_schema=vol.Schema(
    #             {
    #                 vol.Required(
    #                     CONF_USERNAME,
    #                     default=(user_input or {}).get(CONF_USERNAME),
    #                 ): selector.TextSelector(
    #                     selector.TextSelectorConfig(
    #                         type=selector.TextSelectorType.TEXT
    #                     ),
    #                 ),
    #                 vol.Required(CONF_PASSWORD): selector.TextSelector(
    #                     selector.TextSelectorConfig(
    #                         type=selector.TextSelectorType.PASSWORD
    #                     ),
    #                 ),
    #             }
    #         ),
    #         errors=_errors,
    #     )

    # async def _test_credentials(self, username: str, password: str) -> None:
    #     """Validate credentials."""
    #     client = AkuvoxApiClient(
    #         username=username,
    #         password=password,
    #         session=async_create_clientsession(self.hass),
    #     )
    #     await client.async_get_data()
