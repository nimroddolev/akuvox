"""Configuration-flow schema tests for supported SmartPlus sign-in methods."""
from __future__ import annotations

import unittest

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
