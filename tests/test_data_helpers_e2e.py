"""End-to-end parsing and helper tests using representative SmartPlus payloads."""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock

from custom_components.akuvox.data import AkuvoxData
from custom_components.akuvox.helpers import AkuvoxHelpers

from test_session_refresh_e2e import _Hass


class TestDataAndHelpersE2E(unittest.IsolatedAsyncioTestCase):
    """Verify payloads become safe Home Assistant entity data."""

    def setUp(self) -> None:
        """Create a representative signed-in SmartPlus data model."""
        self.data = AkuvoxData(
            entry=None,
            hass=_Hass(),
            host="api.example",
            subdomain="ecloud",
            auth_token="refresh-credential",
            token="session-token",
        )

    def test_sms_login_and_device_payload_created_entities(self) -> None:
        """Login and device payloads created camera and relay entity data."""
        self.data.parse_sms_login_response(
            {"token": "new-session", "rtmp_server": "rtsp.example:554"}
        )
        self.data.parse_userconf_data(
            {
                "app_conf": {"project_name": "Home"},
                "dev_list": [
                    {
                        "location": "Door",
                        "mac": "001122",
                        "rtsp_pwd": "safe/password",
                        "relay": [{"relay_id": 2}],
                    },
                    {"location": "Incomplete"},
                ],
            }
        )

        self.assertEqual(self.data.project_name, "Home")
        self.assertEqual(len(self.data.camera_data), 1)
        self.assertIn("safe%2Fpassword", self.data.camera_data[0]["video_url"])
        self.assertEqual(self.data.door_relay_data[0]["relay_id"], "2")

    async def test_door_log_deduplicated_then_published_new_event(self) -> None:
        """The parser ignored duplicates and returned a new activity exactly once."""
        event = {
            "CaptureTime": "new",
            "Initiator": "Visitor",
            "CaptureType": "Call",
            "Location": "Door",
            "MAC": "001122",
            "Relay": "1",
        }
        self.data.async_get_stored_data_for_key = AsyncMock(side_effect=[False, {"CaptureTime": "old"}])
        self.data.async_set_stored_data_for_key = AsyncMock()

        self.assertEqual(await self.data.async_parse_personal_door_log([event]), event)
        self.data.async_set_stored_data_for_key.assert_awaited_once_with("latest_door_log", event)

    def test_helpers_resolved_known_and_unknown_regions(self) -> None:
        """Country lookups selected an API region and safe defaults."""
        helpers = AkuvoxHelpers()

        self.assertEqual(helpers.get_subdomain_from_country_code("972"), "ecloud")
        self.assertEqual(helpers.get_subdomain_from_country_code("unknown"), "ecloud")
        self.assertIsNone(helpers.find_country_name_code("unknown"))
