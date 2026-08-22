"""End-to-end tests for SmartPlus account, device, and activity workflows."""
from __future__ import annotations

import base64
import io
import unittest
import zipfile
from unittest.mock import ANY, AsyncMock, MagicMock, patch

from custom_components.akuvox.api import AkuvoxApiClient
from custom_components.akuvox.data import AkuvoxData

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
        self.entry = _Entry()
        self.entry.data.update(
            {
                "host": "api.example",
                "phone_number": "5551234",
                "country_code": "972",
            }
        )
        self.session = _Session(responses)
        self.hass = _WorkflowHass()
        return AkuvoxApiClient(self.session, self.hass, self.entry)

    async def test_local_activity_export_includes_data_and_preview_images(self) -> None:
        """The local export contains JSON, CSV, and safely named preview images."""
        client = self._client([])
        client._activity_history_loaded = True
        client._activity_history = [
            {
                "Location": "כניסה ראשית",
                "CaptureTime": "2026-08-21 12:34:56",
                "Event": "Doorbell",
                "picUrl": "https://temporary.example/image.jpeg",
                "LocalPreview": {
                    "content_type": "image/jpeg",
                    "data": base64.b64encode(b"preview-data").decode(),
                },
            }
        ]
        client._call_history_loaded = True
        client._call_history = [{"id": "call-1", "captureTime": "2026-08-21 12:35:00"}]

        exported = await client.async_export_panel_activity_storage()

        self.assertEqual(exported["filename"].split("_")[0], "akuvox")
        with zipfile.ZipFile(io.BytesIO(base64.b64decode(exported["data"]))) as archive:
            self.assertEqual(
                set(archive.namelist()),
                {
                    "activity.csv",
                    "activity.json",
                    "call_history.csv",
                    "call_history.json",
                    "images/כניסה_ראשית_2026-08-21_12_34_56.jpeg",
                },
            )
            self.assertEqual(
                archive.read("images/כניסה_ראשית_2026-08-21_12_34_56.jpeg"),
                b"preview-data",
            )
            self.assertIn("image_filename", archive.read("activity.json").decode())
            self.assertNotIn("LocalPreview", archive.read("activity.json").decode())
            self.assertNotIn("picUrl", archive.read("activity.json").decode())
            self.assertIn("call-1", archive.read("call_history.json").decode())

    async def test_local_data_import_merged_records_and_preview_images(self) -> None:
        """An exported archive merged missing activity, calls, and previews."""
        source = self._client([])
        source._activity_history_loaded = True
        source._activity_history = [
            {
                "id": "activity-1",
                "CaptureTime": "2026-08-21 12:34:56",
                "Location": "Lobby",
                "LocalPreview": {"data": base64.b64encode(b"image").decode()},
            }
        ]
        source._call_history_loaded = True
        source._call_history = [{"id": "call-1", "captureTime": "2026-08-21 12:35:00"}]
        exported = await source.async_export_panel_activity_storage()

        target = self._client([])
        target._activity_history_loaded = True
        target._call_history_loaded = True
        target._data.async_set_stored_data_for_key = AsyncMock()
        with patch("custom_components.akuvox.api.async_update_activity_storage_warning"):
            result = await target.async_import_panel_data(exported["data"])

        self.assertEqual(result, {"activity_imported": 1, "call_history_imported": 1})
        self.assertEqual(target._activity_history[0]["LocalPreview"]["data"], base64.b64encode(b"image").decode())

    async def test_clearing_local_activity_removes_persisted_history(self) -> None:
        """Clearing uses the dedicated history store and updates panel listeners."""
        client = self._client([])
        client._activity_history_loaded = True
        client._activity_history = [{"CaptureTime": "2026-08-21"}]
        client._data.async_set_stored_data_for_key = AsyncMock()
        client._notify_panel_data_updated = MagicMock()

        with patch("custom_components.akuvox.api.async_update_activity_storage_warning"):
            await client.async_clear_panel_activity_storage()

        self.assertEqual(client._activity_history, [])
        client._data.async_set_stored_data_for_key.assert_awaited_once_with(
            "panel_activity_history", []
        )
        client._notify_panel_data_updated.assert_called_once()

    def test_userconf_parsed_sip_configuration(self) -> None:
        """The post-login response provided a complete SIP capability configuration."""
        data = AkuvoxData(None, _WorkflowHass())
        data.parse_userconf_data(
            {
                "app_conf": {
                    "sip_server": "sip.example:5070",
                    "main_sip": "user-sip",
                    "main_sip_passwd": "private-password",
                    "trans_type": "1",
                },
                "dev_list": [{"location": "Lobby", "mac": "AABBCC", "sip": "door-sip"}],
            }
        )

        self.assertEqual(data.sip_server, "sip.example:5070")
        self.assertEqual(data.sip_account, "user-sip")
        self.assertEqual(data.sip_password, "private-password")
        self.assertEqual(data.sip_transport, "1")
        self.assertEqual(data.sip_device_accounts, {"AABBCC": "door-sip"})

    async def test_sip_credentials_were_stored_privately_after_userconf(self) -> None:
        """Post-login SIP values were retained outside the panel payload."""
        client = self._client([])
        client.async_user_conf = AsyncMock(
            return_value={
                "app_conf": {
                    "sip_server": "sip.example:5070",
                    "main_sip": "account-sip",
                    "main_sip_passwd": "private-password",
                    "trans_type": "1",
                },
                "dev_list": [{"location": "Lobby", "mac": "AABBCC", "sip": "door-sip"}],
            }
        )

        with patch(
            "custom_components.akuvox.api.async_store_sip_credentials",
            new=AsyncMock(),
        ) as store_sip_credentials:
            self.assertTrue(await client.async_retrieve_device_data())

        store_sip_credentials.assert_awaited_once_with(
            self.hass,
            self.entry.entry_id,
            {
                "sip_server": "sip.example:5070",
                "sip_account": "account-sip",
                "sip_password": "private-password",
                "sip_transport": "1",
            },
        )
        panel_data = client.get_panel_data()
        self.assertTrue(panel_data["sip_available"])
        for private_field in (
            "sip_server",
            "sip_account",
            "sip_password",
            "sip_transport",
        ):
            self.assertNotIn(private_field, panel_data)

    async def test_account_bootstrap_parsed_devices_and_temp_keys(self) -> None:
        """Server discovery, device retrieval, and key retrieval completed together."""
        client = self._client(
            [
                _success(
                    {
                        "rest_server_https": "api.example",
                        "rtmp_server": "rtsp.example:554",
                        "vrtsp_server": "virtual-rtsp.example:554",
                        "rtsp_server": "documented-rtsp.example:554",
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
                                "relay": [{"relay_id": 0, "door_name": "Front door"}],
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
                                "Expired": 0,
                                "BeginTime": "01-01-2026 00:00:00",
                                "EndTime": "02-01-2026 00:00:00",
                                "Doors": [{"ID": 2, "KeyID": 4, "Relay": 1, "MAC": "AABBCC"}],
                            }
                        ],
                    },
                ),
                _Response(200, {"code": 0, "data": {"list": []}}),
            ]
        )
        client.async_start_polling_personal_door_log = AsyncMock()

        self.assertTrue(await client.async_retrieve_user_data())
        devices = client.get_devices_json()

        self.assertEqual(devices["host"], "api.example")
        self.assertEqual(devices["camera_data"][0]["name"], "Lobby")
        self.assertIn("documented-rtsp.example", devices["camera_data"][0]["video_url"])
        self.assertIn("p%40ss%20word", devices["camera_data"][0]["video_url"])
        self.assertEqual(devices["door_relay_data"][0]["door_name"], "Front door")
        self.assertEqual(devices["door_keys_data"][0]["doors"][0]["mac"], "AABBCC")
        self.assertEqual(devices["door_keys_data"][0]["doors"][0]["relay"], "0")
        self.assertEqual(
            devices["door_keys_data"][0]["begin_time"], "2026-01-01 00:00:00"
        )
        self.assertEqual(
            devices["door_keys_data"][0]["end_time"], "2026-01-02 00:00:00"
        )
        self.assertFalse(devices["door_keys_data"][0]["expired"])
        self.assertEqual(devices["door_keys_data"][0]["qr_code_url"], "")
        self.assertEqual(len(self.session.requests), 3)

    async def test_temporary_key_expiry_followed_the_smartplus_flag(self) -> None:
        """Akuvox's numeric Expired flag was not inverted in the panel data."""
        client = self._client([])
        client._data.parse_temp_keys_data(
            [
                {
                    "ID": "expired-key",
                    "Description": "Expired guest",
                    "TmpKey": "1234",
                    "BeginTime": "01-01-2026 00:00:00",
                    "EndTime": "02-01-2026 00:00:00",
                    "Expired": 1,
                }
            ]
        )

        self.assertTrue(client.get_panel_data()["temporary_keys"][0]["expired"])

    async def test_reload_used_the_account_country_and_subdomain(self) -> None:
        """Reload discovery retained the region saved with the SmartPlus account."""
        client = self._client([])
        client._data.subdomain = "ecloud"
        client.async_make_servers_list_request = AsyncMock(return_value=True)
        client.async_retrieve_device_data = AsyncMock(return_value=True)
        client.async_retrieve_temp_keys_data = AsyncMock(return_value=True)

        self.assertTrue(await client.async_retrieve_user_data(start_polling=False))

        client.async_make_servers_list_request.assert_awaited_once_with(
            hass=self.hass,
            auth_token=client._data.auth_token,
            token=client._data.token,
            country_code="972",
            phone_number="5551234",
            subdomain="ecloud",
        )

    async def test_ecloud_server_discovery_used_post_without_a_timing_out_get(self) -> None:
        """Non-US accounts avoided the GET endpoint that does not serve them."""
        client = self._client([_success({"rtsp_server": "rtsp.example:554"})])
        client._async_ensure_rest_server = AsyncMock(return_value=True)

        self.assertTrue(
            await client.async_make_servers_list_request(
                hass=self.hass,
                auth_token="auth-token",
                token="session-token",
                country_code="972",
                phone_number="5551234",
                subdomain="ecloud",
            )
        )

        self.assertEqual(len(self.session.requests), 1)
        self.assertEqual(self.session.requests[0]["method"], "post")

    async def test_activity_response_published_a_new_door_event(self) -> None:
        """A valid v4 activity response fired the event without a duplicate request."""
        client = self._client(
            [
                _Response(
                    200,
                    {
                        "code": 0,
                        "data": {
                            "list": [
                                {
                                    "captureTime": "2026-08-12 20:00:00",
                                    "initiator": "Visitor",
                                    "captureType": "faceUnlock",
                                    "deviceName": "Lobby",
                                    "picUrl": "https://images.example/event.jpg",
                                    "relayName": "Relay1",
                                }
                            ]
                        },
                    },
                ),
                _Response(200, {"code": 0, "data": {"list": []}}),
            ]
        )
        client._data.async_get_stored_data_for_key = AsyncMock(
            side_effect=[None, None, False, {"CaptureTime": "old"}]
        )
        client._data.async_set_stored_data_for_key = AsyncMock()

        self.assertTrue(await client.async_retrieve_personal_door_log())
        self.hass.bus.async_fire.assert_any_call("akuvox_door_update", ANY)
        self.hass.bus.async_fire.assert_any_call(
            "akuvox_panel_data_updated", {"entry_id": self.entry.entry_id}
        )
        self.assertEqual(len(self.session.requests), 2)
        request = self.session.requests[0]
        self.assertEqual(request["method"], "get")
        self.assertRegex(
            request["url"],
            r"^https://backend\.ecloud\.akuvox\.com/web-server/v4/"
            r"smartplus/community/log/master/getDoorLog\?row=20&page=1&_t=\d+$",
        )
        self.assertEqual(request["headers"]["x-auth-token"], "expired-token")
        self.assertEqual(request["headers"]["origin"], "https://ecloud.akuvox.com")
        panel_event = client.get_panel_data()["activity"][0]
        self.assertEqual(panel_event["CaptureTime"], "2026-08-12 20:00:00")
        self.assertEqual(panel_event["Location"], "Lobby")
        self.assertEqual(panel_event["CaptureType"], "faceUnlock")

    async def test_activity_history_restored_and_persisted_for_panel(self) -> None:
        """Panel activity survived a restart and included the newly polled event."""
        client = self._client([])
        persisted = [{"CaptureTime": "2026-08-12 09:00:00", "Location": "Lobby"}]
        client._data.async_get_stored_data_for_key = AsyncMock(return_value=persisted)
        client._data.async_set_stored_data_for_key = AsyncMock()

        await client._async_record_panel_activity(
            [{"CaptureTime": "2026-08-12 10:00:00", "Location": "Garage"}]
        )

        self.assertEqual(
            [event["CaptureTime"] for event in client.get_panel_data()["activity"]],
            ["2026-08-12 10:00:00", "2026-08-12 09:00:00"],
        )
        client._data.async_set_stored_data_for_key.assert_awaited_once()

    async def test_activity_update_notified_the_panel_when_an_existing_event_changed(self) -> None:
        """An activity image arriving later refreshed the visible existing event."""
        client = self._client([])
        client._activity_history = [
            {"CaptureTime": "2026-08-12 10:00:00", "PicUrl": ""}
        ]
        client._activity_history_loaded = True
        client._data.async_set_stored_data_for_key = AsyncMock()

        await client._async_record_panel_activity(
            [{"CaptureTime": "2026-08-12 10:00:00", "PicUrl": "https://image"}]
        )

        self.assertEqual(
            client.get_panel_data()["activity"][0]["PicUrl"], "https://image"
        )
        self.hass.bus.async_fire.assert_called_once_with(
            "akuvox_panel_data_updated", {"entry_id": self.entry.entry_id}
        )

    async def test_call_history_parsed_and_persisted_for_panel(self) -> None:
        """The call-log page was retained without exposing credentials to the panel."""
        client = self._client(
            [_Response(200, {"code": 0, "data": {"list": [{"id": "call-1", "startTime": "2026-08-13 15:39:17", "isAnswer": True}]}})]
        )
        client._data.async_get_stored_data_for_key = AsyncMock(return_value=None)
        client._data.async_set_stored_data_for_key = AsyncMock()

        self.assertTrue(await client.async_retrieve_call_history())

        self.assertEqual(client.get_panel_data()["calls"][0]["id"], "call-1")
        self.assertIn("getCallLog", self.session.requests[0]["url"])
        self.assertEqual(self.session.requests[0]["headers"]["x-auth-token"], "expired-token")

    async def test_empty_activity_response_was_a_healthy_poll(self) -> None:
        """An empty activity list did not trigger a fallback request or warning."""
        client = self._client([
            _Response(200, {"code": 0, "data": []}),
            _Response(200, {"code": 0, "data": {"list": []}}),
        ])
        client._data.async_get_stored_data_for_key = AsyncMock(return_value=False)
        client._data.async_set_stored_data_for_key = AsyncMock()

        self.assertTrue(await client.async_retrieve_personal_door_log())
        self.assertEqual(len(self.session.requests), 2)
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

    async def test_temporary_key_mutations_used_documented_endpoints(self) -> None:
        """Akuvox temporary-key mutations used their documented response shapes."""
        client = self._client([
            _Response(200, {"code": 0, "msg": "Adding succeeded."}),
            _Response(200, {"code": 0, "msg": "Modify Success"}),
            _Response(200, {"code": 0, "data": []}),
        ])
        client._data.host = "api.example"
        client._data.door_keys_data = [
            {
                "key_id": "1234",
                "date_flag": "",
                "scheduler_type": 3,
                "id_number": "123abc",
                "license_plate": "EjdjMyr1d3",
                "uhf_card": "",
                "is_follow_my_access": 1,
                "doors": [
                    {"mac": "AABBCC", "relay": "0", "security_relay": "0"}
                ],
            }
        ]
        client.async_retrieve_temp_keys_data = AsyncMock(return_value=True)

        await client.async_create_panel_temp_key(
            "Guest", "2026-08-13 10:00:00", "2026-08-13 11:00:00", 1,
            [{"mac": "AABBCC", "relay": "1"}], "123abc", "Myr1d3", "card-1",
        )
        await client.async_edit_panel_temp_key(
            "1234", "Guest", "2026-08-13 10:00:00", "2026-08-13 11:00:00", 1,
            [{"mac": "AABBCC", "relay": "0"}], "updated-id", "UpdatedPlate", "updated-card",
        )
        await client.async_delete_panel_temp_key("1234")

        self.assertEqual(len(self.session.requests), 3)
        self.assertEqual(self.session.requests[0]["method"], "post")
        self.assertEqual(self.session.requests[1]["method"], "post")
        create_request = self.session.requests[0]
        self.assertIn("addPersonalTempKey", create_request["url"])
        self.assertEqual(create_request["headers"]["content-type"], "application/x-www-form-urlencoded")
        self.assertIn("StartDay=2026-08-13", create_request["data"])
        self.assertIn("MAC%5B0%5D%5BMAC%5D=AABBCC", create_request["data"])
        self.assertIn("IDNumber=123abc", create_request["data"])
        self.assertIn("LicensePlate=Myr1d3", create_request["data"])
        self.assertIn("UhfCard=card-1", create_request["data"])
        edit_request = self.session.requests[1]
        self.assertIn("editPersonalTempKey", edit_request["url"])
        self.assertIn("MAC%5B0%5D%5BRelay%5D=1", edit_request["data"])
        self.assertNotIn("MAC%5B0%5D%5BRelay%5D=2", edit_request["data"])
        self.assertIn("MAC%5B0%5D%5BSecurityRelay%5D=0", edit_request["data"])
        self.assertIn("IDNumber=updated-id", edit_request["data"])
        self.assertIn("LicensePlate=UpdatedPlate", edit_request["data"])
        self.assertIn("UhfCard=updated-card", edit_request["data"])
        delete_request = self.session.requests[2]
        self.assertIn(
            "backend.ecloud.akuvox.com/web-server/v3/app/community/tempKey/delPersonalTempKey",
            delete_request["url"],
        )
        self.assertEqual(delete_request["data"], "ID=1234")
        self.assertEqual(
            delete_request["headers"]["content-type"],
            "application/x-www-form-urlencoded",
        )
        self.assertEqual(client.async_retrieve_temp_keys_data.await_count, 3)

    async def test_temporary_key_qr_is_fetched_only_on_request(self) -> None:
        """Temporary-key QR images use the authenticated image proxy."""
        client = self._client([])
        client._data.door_keys_data = [
            {
                "key_id": "1234",
                "qr_code_url": "https://ecloud.akuvox.com/temporary-key-qr.png",
            }
        ]
        client.async_get_panel_activity_image = AsyncMock(
            return_value={"content_type": "image/png", "data": "cXI="}
        )

        result = await client.async_get_panel_temp_key_qr("1234")

        self.assertEqual(result, {"content_type": "image/png", "data": "cXI="})
        client.async_get_panel_activity_image.assert_awaited_once_with(
            "temp-key:1234", allow_http=True
        )
        self.assertFalse(client._activity_history)

    async def test_temporary_key_keeps_a_complete_qr_code_url(self) -> None:
        """SmartPlus QR URLs must not be prefixed with a second host."""
        client = self._client([])
        client._data.parse_temp_keys_data(
            [{
                "ID": "qr-key",
                "Description": "Guest",
                "TmpKey": "1234",
                "BeginTime": "01-01-2026 00:00:00",
                "EndTime": "02-01-2026 00:00:00",
                "QrCodeUrl": "http://files.example/download/temporary-key.png",
            }]
        )

        self.assertEqual(
            client._data.door_keys_data[0]["qr_code_url"],
            "http://files.example/download/temporary-key.png",
        )
