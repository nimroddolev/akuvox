"""Preserve account-specific phone digits through SMS setup and reauthentication."""
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from custom_components.akuvox.config_flow import AkuvoxFlowHandler, _normalise_subscriber_number
from test_config_flow_e2e import _Hass, _ReauthEntry, _ReauthClient


class TestSMSNumberPreservation(unittest.IsolatedAsyncioTestCase):
    """A country code must not imply how SmartPlus stored the subscriber number."""

    def test_formatting_does_not_remove_or_add_digits(self):
        """Whitespace and separators do not change the account identifier."""
        for entered, expected in [(" 050-000 0000 ", "0500000000"),
                                  ("500000000", "500000000"),
                                  ("0412 345 678", "0412345678"),
                                  ("412345678", "412345678"),
                                  ("202-555-0100", "2025550100"),
                                  ("00123", "00123"), (None, "")]:
            with self.subTest(entered=entered):
                self.assertEqual(_normalise_subscriber_number(entered), expected)

    async def test_setup_sends_and_verifies_the_same_registered_digits(self):
        """Setup carries either regional number format through entry creation."""
        for country, gateway, entered, expected, code in [
            ("Israel", "ecloud", "050-000 0000", "0500000000", "972"),
            ("Israel", "ecloud", "500000000", "500000000", "972"),
            ("Australia", "aucloud", "0412 345 678", "0412345678", "61"),
            ("Australia", "aucloud", "412345678", "412345678", "61"),
            ("United States", "ucloud", "2025550100", "2025550100", "1"),
        ]:
            with self.subTest(country=country, entered=entered):
                flow = AkuvoxFlowHandler()
                flow.hass = _Hass()
                client = _ReauthClient()
                client.async_send_sms = AsyncMock(return_value=True)
                client.get_title = MagicMock(return_value="Home")
                flow.akuvox_api_client = client
                flow.async_show_form = MagicMock(return_value={"type": "form"})
                flow.async_create_entry = MagicMock(return_value={"type": "create_entry"})
                await flow._async_step_sms_sign_in_legacy({
                    "country_code": country, "phone_number": entered, "subdomain": gateway})
                client.async_send_sms.assert_awaited_once_with(flow.hass, code, expected, gateway)
                self.assertEqual(flow.data["phone_number"], expected)
                await flow.async_step_verify_sms_code({"sms_code": "123456"})
                client.async_sms_sign_in.assert_awaited_once_with(expected, code, "123456")
                self.assertEqual(flow.async_create_entry.call_args.kwargs["data"]["phone_number"], expected)

    async def test_reauth_keeps_saved_number_for_sms_and_verification(self):
        """Reauthentication must reuse the saved account's successful format."""
        for number, code, gateway in [
            ("0500000000", "972", "ecloud"), ("500000000", "972", "ecloud"),
            ("0412345678", "61", "aucloud"), ("412345678", "61", "aucloud"),
            ("2025550100", "1", "ucloud"),
        ]:
            with self.subTest(number=number):
                flow = AkuvoxFlowHandler()
                flow.hass = _Hass()
                entry = _ReauthEntry()
                entry.data.update(phone_number=number, country_code=code, subdomain=gateway)
                flow._get_reauth_entry = MagicMock(return_value=entry)
                client = _ReauthClient()
                client.async_send_sms = AsyncMock(return_value=True)
                flow.async_show_form = MagicMock(return_value={"type": "form"})
                flow._async_finish_reauthentication = AsyncMock(return_value={"type": "abort"})
                with patch("custom_components.akuvox.config_flow.async_get_clientsession", return_value=object()), \
                        patch("custom_components.akuvox.config_flow.AkuvoxApiClient", return_value=client):
                    await flow.async_step_reauth({})
                client.async_send_sms.assert_awaited_once_with(flow.hass, code, number, gateway)
                await flow.async_step_reauth_confirm({"sms_code": "123456"})
                client.async_sms_sign_in.assert_awaited_once_with(number, code, "123456", start_polling=False)

    async def test_setup_persists_fallback_number_and_uses_it_to_verify(self):
        """An accepted alternate number replaces the submitted account identifier."""
        flow = AkuvoxFlowHandler()
        flow.hass = _Hass()
        client = _ReauthClient()
        client.async_send_sms = AsyncMock(return_value=True)
        client.get_phone_number = MagicMock(return_value="500000000")
        client.get_title = MagicMock(return_value="Home")
        flow.akuvox_api_client = client
        flow.async_show_form = MagicMock(return_value={"type": "form"})
        flow.async_create_entry = MagicMock(return_value={"type": "create_entry"})
        await flow._async_step_sms_sign_in_legacy({
            "country_code": "Israel", "phone_number": "0500000000", "subdomain": "ecloud"})
        await flow.async_step_verify_sms_code({"sms_code": "123456"})
        client.async_sms_sign_in.assert_awaited_once_with("500000000", "972", "123456")
        saved = flow.async_create_entry.call_args.kwargs["data"]
        self.assertEqual(saved["phone_number"], "500000000")
        self.assertEqual(saved["full_phone_number"], "(+972) 500000000")

    async def test_reauth_updates_number_before_verification_and_persistence(self):
        """Reauthentication carries the accepted identifier into its entry update."""
        flow = AkuvoxFlowHandler()
        flow.hass = _Hass()
        flow.data = {"phone_number": "0412345678", "country_code": "61", "subdomain": "aucloud"}
        client = _ReauthClient()
        client.async_send_sms = AsyncMock(return_value=True)
        client.get_phone_number = MagicMock(return_value="412345678")
        flow.akuvox_api_client = client
        flow.async_show_form = MagicMock(return_value={"type": "form"})
        flow._async_finish_reauthentication = AsyncMock(return_value={"type": "abort"})
        await flow.async_step_reauth_sms()
        await flow.async_step_reauth_confirm({"sms_code": "123456"})
        client.async_sms_sign_in.assert_awaited_once_with("412345678", "61", "123456", start_polling=False)
        self.assertEqual(flow.data["phone_number"], "412345678")
        self.assertEqual(flow.data["full_phone_number"], "(+61) 412345678")
        flow._async_finish_reauthentication.assert_awaited_once()
