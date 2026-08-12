"""Configuration-flow schema tests for supported SmartPlus sign-in methods."""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, MagicMock

from custom_components.akuvox.config_flow import AkuvoxFlowHandler


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

    def test_app_token_and_sms_schemas_exposed_required_fields(self) -> None:
        """Manual-token and SMS sign-in forms retained their required fields."""
        app_schema = self.flow.get_app_tokens_sign_in_schema()
        sms_schema = self.flow.get_sms_sign_in_schema({})

        app_fields = {str(field.schema) for field in app_schema}
        sms_fields = {str(field.schema) for field in sms_schema}
        self.assertTrue({"country_code", "phone_number", "auth_token", "token"}.issubset(app_fields))
        self.assertTrue({"country_code", "phone_number"}.issubset(sms_fields))


class _ReauthEntry:
    """Represents an existing account which needs a new SmartPlus session."""

    def __init__(self) -> None:
        self.data = {
            "country_code": "972",
            "phone_number": "5551234",
            "subdomain": "ecloud",
            "auth_token": "old-auth-token",
            "token": "old-session-token",
        }
        self.options = {}


class _ReauthClient:
    """Returns freshly authenticated credentials and discovered entities."""

    def __init__(self) -> None:
        self.async_sms_sign_in = AsyncMock(return_value=True)

    def get_devices_json(self) -> dict:
        return {
            "auth_token": "new-auth-token",
            "token": "new-session-token",
            "host": "api.example",
            "camera_data": [{"name": "Lobby"}],
            "door_relay_data": [{"name": "Lobby", "relay_id": "1"}],
            "door_keys_data": [],
        }


class TestReauthFlowE2E(unittest.IsolatedAsyncioTestCase):
    """Verify reauthentication renewed the active config entry in place."""

    async def test_sms_code_updated_and_reloaded_existing_entry(self) -> None:
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
        self.assertEqual(update["data"]["token"], "new-session-token")
        self.assertEqual(update["data"]["auth_token"], "new-auth-token")
        self.assertEqual(update["data"]["camera_data"], [{"name": "Lobby"}])
        self.assertIn("token_refreshed_at", update["data"])
        self.assertEqual(update["reason"], "reauth_successful")
