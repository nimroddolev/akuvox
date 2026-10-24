"""End-to-end platform setup and poller tests for the integration."""
from __future__ import annotations

import asyncio
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
        self.config = SimpleNamespace(components=set())

    def async_create_background_task(self, target, name) -> asyncio.Task:
        """Run snapshot refreshes as ordinary tasks."""
        return asyncio.ensure_future(target)


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


class _Producer:
    """A go2rtc stream producer."""

    def __init__(self, url: str) -> None:
        self.url = url


class _Go2rtcStreams:
    """Records go2rtc stream registrations."""

    def __init__(self) -> None:
        self.registered: dict[str, list[str]] = {}
        self.add = AsyncMock(side_effect=self._add)

    async def _add(self, name: str, sources: list[str]) -> None:
        self.registered[name] = sources

    async def list(self) -> dict:
        return {
            name: SimpleNamespace(producers=[_Producer(url) for url in sources])
            for name, sources in self.registered.items()
        }


class _Go2rtcClient:
    """Stands in for Home Assistant's go2rtc REST client."""

    def __init__(self) -> None:
        self.streams = _Go2rtcStreams()
        self.get_jpeg_snapshot = AsyncMock(return_value=b"go2rtc-jpeg")


class TestCameraHomeKitE2E(unittest.IsolatedAsyncioTestCase):
    """Verify HomeKit Bridge and snapshot requests use go2rtc's restream."""

    def _camera(self, go2rtc: _Go2rtcClient | None = None) -> camera.AkuvoxCameraEntity:
        hass = _Hass()
        hass.config.components.add("go2rtc")
        entity = camera.AkuvoxCameraEntity(hass, "Lobby door", "rtsp://example/lobby")
        entity._webrtc_provider = (
            SimpleNamespace(_rest_client=go2rtc) if go2rtc is not None else None
        )
        return entity

    async def test_homekit_got_a_video_only_go2rtc_restream(self) -> None:
        """HomeKit's ffmpeg received a plain RTSP URL that go2rtc serves."""
        go2rtc = _Go2rtcClient()
        entity = self._camera(go2rtc)

        with patch("custom_components.akuvox.camera._called_from_homekit", return_value=True):
            first = await entity.stream_source()
            second = await entity.stream_source()

        self.assertEqual(first, "rtsp://127.0.0.1:18554/akuvox_hk_Lobby_door")
        self.assertEqual(second, first)
        self.assertEqual(
            go2rtc.streams.registered,
            {"akuvox_hk_Lobby_door": ["ffmpeg:rtsp://example/lobby#input=rtsp/udp"]},
        )
        go2rtc.streams.add.assert_awaited_once()

    async def test_other_go2rtc_callers_kept_the_ffmpeg_source(self) -> None:
        """Requests outside HomeKit still got go2rtc's ffmpeg source form."""
        entity = self._camera(_Go2rtcClient())

        with patch("custom_components.akuvox.camera._called_from_homekit", return_value=False):
            self.assertEqual(
                await entity.stream_source(), "ffmpeg:rtsp://example/lobby#input=rtsp/udp"
            )

    async def test_homekit_fell_back_to_the_relay_without_go2rtc_client(self) -> None:
        """Without a go2rtc client HomeKit got the plain relay URL its ffmpeg can open."""
        entity = self._camera()

        with patch("custom_components.akuvox.camera._called_from_homekit", return_value=True):
            self.assertEqual(await entity.stream_source(), "rtsp://example/lobby")

    def test_homekit_callers_were_recognised_by_module(self) -> None:
        """Only callers inside the HomeKit integration counted as HomeKit."""
        namespace = {"__name__": "homeassistant.components.homekit.type_cameras"}
        exec("def ask(check):\n    return check()", namespace)  # noqa: S102

        self.assertTrue(namespace["ask"](camera._called_from_homekit))
        self.assertFalse(camera._called_from_homekit())

    async def test_snapshot_came_from_go2rtc_and_was_reused(self) -> None:
        """Snapshots used the go2rtc stream and were cached briefly."""
        go2rtc = _Go2rtcClient()
        entity = self._camera(go2rtc)

        self.assertEqual(await entity.async_camera_image(), b"go2rtc-jpeg")
        self.assertEqual(await entity.async_camera_image(), b"go2rtc-jpeg")

        go2rtc.get_jpeg_snapshot.assert_awaited_once_with("akuvox_hk_Lobby_door", None, None)

    async def test_stale_snapshot_was_returned_while_refreshing(self) -> None:
        """An old frame answered at once while a newer one was fetched."""
        go2rtc = _Go2rtcClient()
        entity = self._camera(go2rtc)
        entity._snapshot = b"old-jpeg"
        entity._snapshot_time = 0

        self.assertEqual(await entity.async_camera_image(), b"old-jpeg")
        await entity._snapshot_task

        self.assertEqual(entity._snapshot, b"go2rtc-jpeg")
