"""End-to-end tests for SmartPlus account, device, and activity workflows."""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, MagicMock

from custom_components.akuvox.api import AkuvoxApiClient

from test_session_refresh_e2e import _Entry, _Hass, _Response, _Session, _success


class _Config:
    country = "IL"


class _WorkflowHass(_Hass):
    """Adds the event bus and country used by account workflows."""

    def __init__(self) -> None:
        super().__init__()
        self.config = _Config()
        self.bus = type("Bus", (), {"async_fire": MagicMock()})()


class TestSmartPlusApiE2E(unittest.IsolatedAsyncioTestCase):
    """Exercise a complete simulated SmartPlus account lifecycle."""

    def _client(self, responses: list[_Response]) -> AkuvoxApiClient:
        entry = _Entry()
        entry.data.update(
            {
                "host": "api.example",
                "phone_number": "5551234",
                "country_code": "972",
            }
        )
        self.session = _Session(responses)
        self.hass = _WorkflowHass()
        return AkuvoxApiClient(self.session, self.hass, entry)

    async def test_account_bootstrap_parsed_devices_and_temp_keys(self) -> None:
        """Server discovery, device retrieval, and key retrieval completed together."""
        client = self._client(
            [
                _success(
                    {
                        "rest_server_https": "api.example",
                        "rtmp_server": "rtsp.example:554",
                    }
                ),
                _success(
                    {
                        "app_conf": {"project_name": "Building"},
                        "dev_list": [
                            {
                                "location": "Lobby",
                                "mac": "AABBCC",
                                "rtsp_pwd": "p@ss word",
                                "relay": [{"relay_id": 1, "door_name": "Front door"}],
                            }
                        ],
                    }
                ),
                _Response(
                    200,
                    {
                        "code": 0,
                        "data": [
                            {
                                "ID": 4,
                                "Description": "Guest",
                                "TmpKey": "1234",
                                "BeginTime": "01-01-2026 00:00:00",
                                "EndTime": "02-01-2026 00:00:00",
                                "Doors": [{"ID": 2, "KeyID": 4, "Relay": 1, "MAC": "AABBCC"}],
                            }
                        ],
                    },
                ),
            ]
        )
        client.async_start_polling = AsyncMock()

        self.assertTrue(await client.async_retrieve_user_data())
        devices = client.get_devices_json()

        self.assertEqual(devices["host"], "api.example")
        self.assertEqual(devices["camera_data"][0]["name"], "Lobby")
        self.assertIn("p%40ss%20word", devices["camera_data"][0]["video_url"])
        self.assertEqual(devices["door_relay_data"][0]["door_name"], "Front door")
        self.assertEqual(devices["door_keys_data"][0]["doors"][0]["mac"], "AABBCC")
        self.assertEqual(len(self.session.requests), 3)

    async def test_activity_response_published_a_new_door_event(self) -> None:
        """A valid activity response fired the event without a duplicate request."""
        client = self._client(
            [
                _Response(
                    200,
                    {
                        "code": 0,
                        "data": [
                            {
                                "CaptureTime": "2026-08-12 20:00:00",
                                "Initiator": "Visitor",
                                "CaptureType": "Call",
                                "Location": "Lobby",
                                "MAC": "AABBCC",
                                "Relay": "1",
                            }
                        ],
                    },
                ),
            ]
        )
        client._data.async_get_stored_data_for_key = AsyncMock(side_effect=[False, {"CaptureTime": "old"}])
        client._data.async_set_stored_data_for_key = AsyncMock()

        self.assertTrue(await client.async_retrieve_personal_door_log())
        self.hass.bus.async_fire.assert_called_once()
        self.assertEqual(len(self.session.requests), 1)

    async def test_empty_activity_response_was_a_healthy_poll(self) -> None:
        """An empty activity list did not trigger a fallback request or warning."""
        client = self._client([_Response(200, {"code": 0, "data": []})])
        client._data.async_get_stored_data_for_key = AsyncMock(return_value=False)
        client._data.async_set_stored_data_for_key = AsyncMock()

        self.assertTrue(await client.async_retrieve_personal_door_log())
        self.assertEqual(len(self.session.requests), 1)
        self.hass.bus.async_fire.assert_not_called()

    async def test_door_relay_request_used_the_authenticated_endpoint(self) -> None:
        """A relay action issued the expected authenticated POST request."""
        client = self._client([_success({"ok": True})])

        result = await client.async_make_opendoor_request(
            "Lobby, 1", "api.example", "expired-token", "mac=AABBCC&relay=1"
        )

        self.assertEqual(result, {"ok": True})
        request = self.session.requests[0]
        self.assertEqual(request["method"], "post")
        self.assertIn("opendoor?token=expired-token", request["url"])
        self.assertEqual(request["headers"]["X-AUTH-TOKEN"], "expired-token")
