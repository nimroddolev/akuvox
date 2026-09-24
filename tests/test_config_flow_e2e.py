"""Configuration-flow schema tests for supported SmartPlus sign-in methods."""
from __future__ import annotations

import hashlib
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from custom_components.akuvox.config_flow import (
    AkuvoxFlowHandler,
    _country_select_options,
    _normalise_subscriber_number,
    _subdomain_select_options,
)
from custom_components.akuvox.api import AkuvoxApiClient
from custom_components.akuvox.data import AkuvoxData


class _Config:
    """Supplies Home Assistant's configured country."""

    country = "IL"


class _Hass:
    """Supplies the config object read by flow schema generation."""

    config = _Config()


class TestConfigFlowE2E(unittest.TestCase):
    """Verify sign-in forms exposed all credentials needed by real workflows."""

    def setUp(self) -> None:
        """Create a flow with a Home Assistant country setting."""
        self.flow = AkuvoxFlowHandler()
        self.flow.hass = _Hass()

    def test_sms_schema_exposed_required_fields(self) -> None:
        """SMS sign-in retained the account fields required by SmartPlus."""
        sms_schema = self.flow.get_sms_sign_in_schema({})

        sms_fields = {str(field.schema) for field in sms_schema}
        self.assertTrue({"country_code", "phone_number"}.issubset(sms_fields))

    def test_flow_state_was_not_shared_between_instances(self) -> None:
        """Concurrent config flows retained independent mutable state."""
        other_flow = AkuvoxFlowHandler()
        self.flow.data["phone_number"] = "5551234"
        self.flow.rest_server_data["host"] = "api.example"

        self.assertEqual(other_flow.data, {})
        self.assertEqual(other_flow.rest_server_data, {})

    def test_subscriber_number_omitted_the_local_trunk_prefix(self) -> None:
        """The country code was not followed by a leading local zero."""
        self.assertEqual(_normalise_subscriber_number("052-532 1806"), "525321806")
        self.assertEqual(_normalise_subscriber_number("525321806"), "525321806")

    def test_config_selectors_used_explicit_visible_labels(self) -> None:
        """Country and region selectors never depend on implicit string labels."""
        country = next(option for option in _country_select_options() if option["value"] == "Israel")
        self.assertEqual(country["label"], "Israel (+972)")
        self.assertEqual(
            _subdomain_select_options(include_default=True)[0],
            {"value": "Default", "label": "Automatic (recommended)"},
        )

    def test_email_login_obfuscation_matches_the_smartplus_app(self) -> None:
        """SmartPlus shifts the account name and double-hashes the password."""
        self.assertEqual(
            AkuvoxApiClient._caesar_shift_login_value("Liv.dolev@gmail.com"),
            "Oly.grohy@gmail.com",
        )
        self.assertEqual(
            AkuvoxApiClient._caesar_shift_login_value("Zz9-@#"), "Cc9-@#"
        )
        first_digest = hashlib.md5(b"test-password").hexdigest()
        self.assertEqual(
            AkuvoxApiClient._double_md5_password("test-password"),
            hashlib.md5(first_digest.encode("ascii")).hexdigest(),
        )

    def test_email_otp_response_uses_refresh_token_as_auth_token(self) -> None:
        """The email OTP endpoint names its refresh credential differently."""
        data = AkuvoxData(entry=None, hass=self.flow.hass)

        data.parse_sms_login_response(
            {"datas": {"refresh_token": "refresh", "token": "session"}}
        )

        self.assertEqual(data.auth_token, "refresh")
        self.assertEqual(data.token, "session")

    def test_device_data_persists_the_rtsp_server(self) -> None:
        """Email logins retain their RTSP endpoint without an SMS bootstrap."""
        data = AkuvoxData(entry=None, hass=self.flow.hass)
        data.rtsp_server = "rtsp.example:8601"

        self.assertEqual(data.get_device_data()["rtsp_server"], "rtsp.example:8601")


class TestSharedCredentialsFlowE2E(unittest.IsolatedAsyncioTestCase):
    """Verify shared-credential failures identify the source connection."""

    async def test_source_connection_failure_has_a_pairing_specific_error(self) -> None:
        """A source outage does not incorrectly report an SMS delivery failure."""
        flow = AkuvoxFlowHandler()
        flow.hass = _Hass()
        flow.async_show_form = MagicMock(return_value={"type": "form"})

        with patch(
            "custom_components.akuvox.config_flow.async_fetch_shared_snapshot",
            new_callable=AsyncMock,
            side_effect=OSError("source unavailable"),
        ):
            result = await flow.async_step_shared_credentials(
                {"pairing_link": "akuvox-share://v1?url=https%3A%2F%2Fexample.com&id=share&secret=secret"}
            )

        self.assertEqual(result, {"type": "form"})
        self.assertEqual(flow.async_show_form.call_args.kwargs["errors"], {"base": "cannot_reach_source"})


class _ReauthEntry:
    """Represents an existing account which needs a new SmartPlus session."""

    def __init__(self) -> None:
        self.entry_id = "entry-id"
        self.data = {
            "country_code": "972",
            "phone_number": "05551234",
            "subdomain": "ecloud",
            "auth_token": "old-auth-token",
            "token": "old-session-token",
        }
        self.options = {}


class _ReauthClient:
    """Returns freshly authenticated credentials and discovered entities."""

    def __init__(self) -> None:
        self.async_sms_sign_in = AsyncMock(return_value=True)
        self.async_make_servers_list_request = AsyncMock(return_value=True)
        self.async_retrieve_user_data = AsyncMock(return_value=True)
        self.async_retrieve_device_data = AsyncMock(return_value=True)
        self.async_retrieve_temp_keys_data = AsyncMock(return_value=True)

    def get_devices_json(self) -> dict:
        return {
            "host": "api.example",
            "camera_data": [{"name": "Lobby"}],
            "door_relay_data": [{"name": "Lobby", "relay_id": "1"}],
            "door_keys_data": [],
        }

    def get_credentials(self) -> dict:
        return {"auth_token": "new-auth-token", "token": "new-session-token"}


class _EmailClient(_ReauthClient):
    """Models the two email-login requests without retaining passwords."""

    def __init__(self) -> None:
        super().__init__()
        self.async_begin_email_sign_in = AsyncMock(
            return_value={"two_factor_auth_temp_token": "temporary-token"}
        )
        self.async_send_email_otp = AsyncMock(return_value=True)
        self.async_email_otp_sign_in = AsyncMock(return_value=True)


class TestReauthFlowE2E(unittest.IsolatedAsyncioTestCase):
    """Verify reauthentication renewed the active config entry in place."""

    @patch("custom_components.akuvox.config_flow.async_clear_authentication_failure")
    @patch("custom_components.akuvox.config_flow.async_store_credentials", new_callable=AsyncMock)
    async def test_sms_code_updated_and_reloaded_existing_entry(
        self, store_credentials, clear_authentication_failure
    ) -> None:
        """A valid reauth SMS code replaced credentials without creating an entry."""
        flow = AkuvoxFlowHandler()
        flow.hass = _Hass()
        flow._reauth_entry = _ReauthEntry()
        flow.data = {"country_code": "972", "phone_number": "5551234", "subdomain": "ecloud"}
        flow.akuvox_api_client = _ReauthClient()
        flow.async_update_reload_and_abort = MagicMock(return_value={"type": "abort"})

        result = await flow.async_step_reauth_confirm({"sms_code": "123456"})

        self.assertEqual(result, {"type": "abort"})
        flow.akuvox_api_client.async_sms_sign_in.assert_awaited_once_with(
            "5551234", "972", "123456", start_polling=False
        )
        update = flow.async_update_reload_and_abort.call_args.kwargs
        self.assertNotIn("token", update["data"])
        self.assertNotIn("auth_token", update["data"])
        store_credentials.assert_awaited_once_with(
            flow.hass, flow._reauth_entry.entry_id, "new-auth-token", "new-session-token"
        )
        clear_authentication_failure.assert_called_once_with(flow.hass, flow._reauth_entry)
        self.assertEqual(update["data"]["camera_data"], [{"name": "Lobby"}])
        self.assertIn("token_refreshed_at", update["data"])
        self.assertIn("token_refreshed_at", update["options"])
        self.assertEqual(update["options"]["token_update_type"], "refreshed")
        self.assertEqual(update["reason"], "reauth_successful")


class TestEmailPasswordFlowE2E(unittest.IsolatedAsyncioTestCase):
    """Verify email/username login follows the app's password-plus-OTP flow."""

    async def test_password_request_sends_otp_without_persisting_password(self) -> None:
        """The password is used for the request but never retained in flow data."""
        flow = AkuvoxFlowHandler()
        flow.hass = _Hass()
        flow.akuvox_api_client = _EmailClient()
        flow.async_show_form = MagicMock(return_value={"type": "form"})

        result = await flow.async_step_email_password_sign_in(
            {"login_account": "person@example.com", "password": "not-stored"}
        )

        self.assertEqual(result, {"type": "form"})
        flow.akuvox_api_client.async_begin_email_sign_in.assert_awaited_once_with(
            "person@example.com", "not-stored"
        )
        flow.akuvox_api_client.async_send_email_otp.assert_awaited_once_with(
            "person@example.com", "temporary-token"
        )
        self.assertEqual(
            flow.data, {"login_method": "email_password", "login_account": "person@example.com"}
        )

    async def test_verified_email_otp_creates_an_entry(self) -> None:
        """A valid email OTP saves only the resulting SmartPlus tokens."""
        flow = AkuvoxFlowHandler()
        flow.hass = _Hass()
        flow.data = {"login_method": "email_password", "login_account": "person@example.com"}
        flow.akuvox_api_client = _EmailClient()
        flow.akuvox_api_client.get_devices_json = MagicMock(return_value={"host": "api.example"})
        flow.akuvox_api_client.get_credentials = MagicMock(
            return_value={"auth_token": "auth", "token": "token"}
        )
        flow.akuvox_api_client.get_title = MagicMock(return_value="Home")
        flow.async_create_entry = MagicMock(return_value={"type": "create_entry"})

        result = await flow.async_step_verify_email_code({"email_code": "123456"})

        self.assertEqual(result, {"type": "create_entry"})
        flow.akuvox_api_client.async_email_otp_sign_in.assert_awaited_once_with(
            "person@example.com", "123456", start_polling=False
        )
        self.assertNotIn("password", flow.data)
