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
            {
                "token": "new-session",
                "rtmp_server": "fallback.example:1935",
                "vrtsp_server": "rtsp.example:8554",
                "rtsp_server": "documented-rtsp.example:554",
            }
        )
        self.data.parse_userconf_data(
            {
                "app_conf": {"project_name": "Home", "role": 21},
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
        self.assertEqual(self.data.smartplus_role, "21")
        self.assertEqual(len(self.data.camera_data), 1)
        self.assertIn("documented-rtsp.example:554", self.data.camera_data[0]["video_url"])
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
        self.data.async_get_stored_data_for_key = AsyncMock(
            return_value={"CaptureTime": "old"}
        )
        self.data.async_set_stored_data_for_key = AsyncMock()
        self.data._door_log_initialized = True

        self.assertEqual(await self.data.async_parse_personal_door_log([event]), event)
        self.data.async_set_stored_data_for_key.assert_awaited_once_with("latest_door_log", event)

    async def test_first_door_log_is_used_as_the_polling_baseline(self) -> None:
        """The initial poll never emits an event for a potentially stale row."""
        event = {
            "CaptureTime": "new",
            "Initiator": "Resident",
            "CaptureType": "Remote Open Door",
            "Location": "כניסה ראשית",
            "MAC": "001122",
            "Relay": "1",
            "PicUrl": "https://images.example/snapshot.jpg",
        }
        self.data.async_get_stored_data_for_key = AsyncMock(return_value=None)
        self.data.async_set_stored_data_for_key = AsyncMock()

        self.assertIsNone(await self.data.async_parse_personal_door_log([event]))
        self.data.async_set_stored_data_for_key.assert_awaited_once_with("latest_door_log", event)

    async def test_door_log_publishes_unseen_rows_one_at_a_time(self) -> None:
        """A relay unlock is not skipped when a newer activity shares its poll."""
        latest = {
            "CaptureTime": "old",
            "Initiator": "Visitor",
            "CaptureType": "Call",
            "Location": "Door",
            "MAC": "001122",
            "Relay": "1",
        }
        relay_unlock = {**latest, "CaptureTime": "relay-unlock", "PicUrl": "snapshot"}
        newer_event = {**latest, "CaptureTime": "newer", "PicUrl": "snapshot"}
        self.data.async_get_stored_data_for_key = AsyncMock(return_value=latest)
        self.data.async_set_stored_data_for_key = AsyncMock()
        self.data._door_log_initialized = True

        event = await self.data.async_parse_personal_door_log(
            [newer_event, relay_unlock, latest]
        )

        self.assertEqual(event, relay_unlock)
        self.data.async_set_stored_data_for_key.assert_awaited_once_with(
            "latest_door_log", relay_unlock
        )

    async def test_door_log_with_empty_screenshot_url_waited_for_a_later_poll(self) -> None:
        """An incomplete new door-log entry was not published or marked as seen."""
        event = {
            "CaptureTime": "new",
            "Initiator": "Visitor",
            "CaptureType": "Call",
            "Location": "Door",
            "MAC": "001122",
            "Relay": "1",
            "PicUrl": "",
        }
        self.data.async_get_stored_data_for_key = AsyncMock(
            return_value={"CaptureTime": "old"}
        )
        self.data.async_set_stored_data_for_key = AsyncMock()
        self.data._door_log_initialized = True

        self.assertIsNone(await self.data.async_parse_personal_door_log([event]))
        self.data.async_set_stored_data_for_key.assert_not_awaited()

    async def test_door_log_can_publish_before_an_image_is_available(self) -> None:
        """The event setting can opt a door out of image waiting."""
        event = {
            "CaptureTime": "new",
            "Initiator": "Visitor",
            "CaptureType": "Remote Open Door",
            "Location": "Door",
            "MAC": "001122",
            "Relay": "1",
            "PicUrl": "",
        }
        self.data._entry = type("Entry", (), {"options": {"wait_for_event_image": False}})()
        self.data._door_log_initialized = True
        self.data.async_get_stored_data_for_key = AsyncMock(return_value={"CaptureTime": "old"})
        self.data.async_set_stored_data_for_key = AsyncMock()

        self.assertEqual(await self.data.async_parse_personal_door_log([event]), event)

    def test_helpers_resolved_known_and_unknown_regions(self) -> None:
        """Country lookups selected an API region and safe defaults."""
        helpers = AkuvoxHelpers()

        self.assertEqual(helpers.get_subdomain_from_country_code("972"), "ecloud")
        self.assertEqual(helpers.get_subdomain_from_country_code("unknown"), "ecloud")
        self.assertIsNone(helpers.find_country_name_code("unknown"))
