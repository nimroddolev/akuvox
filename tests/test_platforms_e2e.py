"""End-to-end platform setup and poller tests for the integration."""
from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import ANY, AsyncMock, MagicMock, patch

from custom_components.akuvox import button, camera, sensor
from custom_components.akuvox.const import DOMAIN
from homeassistant.components.camera.const import StreamType


class _Store:
    """Returns the persisted entity data used by platform setup."""

    def __init__(self, data: dict) -> None:
        self._data = data

    async def async_load(self) -> dict:
        return self._data


class _Hass:
    """Provides shared integration data to the entity platforms."""

    def __init__(self) -> None:
        self.data = {DOMAIN: {"entry-id": type("Coordinator", (), {"client": object()})()}}


class _Entry:
    """Provides saved credentials required by entity constructors."""

    entry_id = "entry-id"
    data = {"host": "api.example", "token": "session-token", "auth_token": "auth"}
    options = {}


class _EntityClient:
    """Provides the API methods exercised by actual entity constructors."""

    def __init__(self) -> None:
        self.initialise_calls = []
        self.async_make_opendoor_request = AsyncMock()

    def init_api_with_data(self, **kwargs) -> None:
        """Record entity initialisation data."""
        self.initialise_calls.append(kwargs)


class TestPlatformSetupE2E(unittest.IsolatedAsyncioTestCase):
    """Verify persisted SmartPlus data became Home Assistant entities."""

    async def test_camera_button_and_sensor_platforms_created_entities(self) -> None:
        """Each platform transformed saved account data into its entity type."""
        hass = _Hass()
        entry = _Entry()
        stored_data = {
            "camera_data": [{"name": "Lobby", "video_url": "rtsp://example/lobby"}],
            "door_relay_data": [{"name": "Lobby", "mac": "AABBCC", "relay_id": "1"}],
            "door_keys_data": [
                {
                    "key_id": 3,
                    "description": "Guest",
                    "key_code": "1234",
                    "begin_time": "01-01-2026 00:00:00",
                    "end_time": "02-01-2026 00:00:00",
                    "allowed_times": 1,
                    "access_times": 1,
                    "qr_code_url": "https://example/key",
                }
            ],
        }
        added_cameras = MagicMock()
        added_buttons = MagicMock()
        added_sensors = MagicMock()

        with (
            patch("custom_components.akuvox.camera.storage.Store", return_value=_Store(stored_data)),
            patch("custom_components.akuvox.camera.AkuvoxCameraEntity", side_effect=lambda **kwargs: kwargs),
            patch("custom_components.akuvox.button.storage.Store", return_value=_Store(stored_data)),
            patch("custom_components.akuvox.button.AkuvoxDoorRelayEntity", side_effect=lambda **kwargs: kwargs),
            patch("custom_components.akuvox.sensor.storage.Store", return_value=_Store(stored_data)),
            patch("custom_components.akuvox.sensor.AkuvoxTemporaryDoorKey", side_effect=lambda **kwargs: kwargs),
        ):
            self.assertTrue(await camera.async_setup_entry(hass, entry, added_cameras))
            await button.async_setup_entry(hass, entry, added_buttons)
            await sensor.async_setup_entry(hass, entry, added_sensors)

        self.assertEqual(added_cameras.call_args.args[0][0]["name"], "Lobby")
        self.assertEqual(added_buttons.call_args.args[0][0]["data"], "mac=AABBCC&relay=1")
        self.assertEqual(added_sensors.call_args.args[0][0]["key_code"], "1234")

    async def test_button_and_sensor_ignored_missing_or_corrupt_saved_data(self) -> None:
        """Missing or malformed cached platform data did not prevent setup."""
        hass = _Hass()
        entry = _Entry()
        added_buttons = MagicMock()
        added_sensors = MagicMock()

        with (
            patch("custom_components.akuvox.button.storage.Store", return_value=_Store(None)),
            patch("custom_components.akuvox.sensor.storage.Store", return_value=_Store({"door_keys_data": {}})),
        ):
            await button.async_setup_entry(hass, entry, added_buttons)
            await sensor.async_setup_entry(hass, entry, added_sensors)

        added_buttons.assert_not_called()
        added_sensors.assert_not_called()

    async def test_actual_entities_used_saved_credentials_and_async_actions(self) -> None:
        """Camera, relay, and temporary-key entities completed their public paths."""
        client = _EntityClient()
        entry = _Entry()

        camera_entity = camera.AkuvoxCameraEntity(
            _Hass(), entry, "Lobby", "rtsp://example/lobby"
        )
        relay_entity = button.AkuvoxDoorRelayEntity(
            client, entry, "Lobby", "1", "mac=AABBCC&relay=1"
        )
        key_entity = sensor.AkuvoxTemporaryDoorKey(
            client,
            entry,
            3,
            "Guest",
            "1234",
            sensor.datetime(2020, 1, 1),
            sensor.datetime(2030, 1, 1),
            1,
            1,
            "https://example/key",
        )

        await relay_entity.async_press()

        self.assertEqual(camera_entity.unique_id, "entry-id:Lobby")
        self.assertEqual(relay_entity.unique_id, "entry-id:Lobby, 1")
        self.assertTrue(key_entity.is_key_active())
        client.async_make_opendoor_request.assert_awaited_once()

    async def test_relay_press_used_the_refreshed_session_token(self) -> None:
        """A relay press sent the token the client holds after a refresh."""
        client = _EntityClient()
        client._data = SimpleNamespace(host="api.example", token="setup-token")
        relay_entity = button.AkuvoxDoorRelayEntity(
            client, _Entry(), "Lobby", "1", "mac=AABBCC&relay=1"
        )
        client._data.token = "refreshed-token"

        await relay_entity.async_press()

        client.async_make_opendoor_request.assert_awaited_once_with(
            name="Lobby, 1",
            host="api.example",
            token="refreshed-token",
            data="mac=AABBCC&relay=1",
        )

    def test_camera_preserved_the_configured_udp_transport(self) -> None:
        """Camera entities retained their RTSP transport configuration."""
        with patch("custom_components.akuvox.camera.GenericCamera.__init__") as init:
            camera.AkuvoxCameraEntity(_Hass(), "Lobby", "rtsp://example/lobby")

        config = init.call_args.kwargs["device_info"]
        self.assertEqual(config["advanced"]["rtsp_transport"], "udp")

    def test_camera_offered_hls_without_broken_webrtc_audio(self) -> None:
        """Akuvox cameras avoided go2rtc's failing WebRTC audio producer."""
        camera_entity = camera.AkuvoxCameraEntity(
            _Hass(), "Lobby", "rtsp://example/lobby"
        )

        self.assertEqual(
            camera_entity.camera_capabilities.frontend_stream_types,
            {StreamType.HLS},
        )
        self.assertFalse(camera_entity.use_stream_for_stills)

    async def test_camera_snapshot_used_direct_udp_ffmpeg_capture(self) -> None:
        """Snapshots bypassed the cloud RTSP proxy's broken MJPEG transport."""
        entity = camera.AkuvoxCameraEntity(_Hass(), "Lobby", "rtsp://example/lobby")
        frame = MagicMock()
        frame.get_image = AsyncMock(return_value=b"jpeg-data")
        with (
            patch("custom_components.akuvox.camera.get_ffmpeg_manager") as manager,
            patch("custom_components.akuvox.camera.ImageFrame", return_value=frame),
        ):
            manager.return_value.binary = "ffmpeg"
            self.assertEqual(await entity.async_camera_image(640, 360), b"jpeg-data")

        frame.get_image.assert_awaited_once_with(
            "-rtsp_transport udp -i rtsp://example/lobby",
            output_format=ANY,
            timeout=8,
        )
