"""HomeKit stream routing and go2rtc registration regressions."""
import asyncio
import time
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from custom_components.akuvox import camera
from homeassistant.components.generic.camera import GenericCamera
from test_platforms_e2e import _Hass


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
        self._client = SimpleNamespace(request=AsyncMock(return_value=SimpleNamespace(release=MagicMock())))
        self.get_jpeg_snapshot = AsyncMock(return_value=b"go2rtc-jpeg")


class TestCameraHomeKitE2E(unittest.IsolatedAsyncioTestCase):
    """Verify HomeKit Bridge and snapshot requests use go2rtc's restream."""

    def _camera(self, go2rtc: _Go2rtcClient | None = None) -> camera.AkuvoxCameraEntity:
        hass = _Hass()
        hass.config.components.add("go2rtc")
        entity = camera.AkuvoxCameraEntity(hass, "Lobby door", "rtsp://example/lobby")
        entity._webrtc_provider = (
            SimpleNamespace(_rest_client=go2rtc, _url="http://localhost:11984/") if go2rtc is not None else None
        )
        return entity

    async def test_homekit_got_a_video_only_go2rtc_restream(self) -> None:
        """HomeKit's ffmpeg received a plain RTSP URL that go2rtc serves."""
        go2rtc = _Go2rtcClient()
        entity = self._camera(go2rtc)

        with patch("custom_components.akuvox.camera._called_from_homekit", return_value=True):
            first = await entity.stream_source()
            second = await entity.stream_source()

        self.assertEqual(first, f"rtsp://127.0.0.1:18554/{entity._go2rtc_stream_name}")
        self.assertEqual(second, first)
        self.assertEqual(
            go2rtc.streams.registered,
            {entity._go2rtc_stream_name: ["ffmpeg:rtsp://example/lobby#input=rtsp/udp"]},
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

        go2rtc.get_jpeg_snapshot.assert_awaited_once_with(entity._go2rtc_stream_name, None, None)

    async def test_stale_snapshot_was_returned_while_refreshing(self) -> None:
        """An old frame answered at once while a newer one was fetched."""
        go2rtc = _Go2rtcClient()
        entity = self._camera(go2rtc)
        entity._snapshot_cache.image = b"old-jpeg"
        entity._snapshot_cache.updated_at = time.monotonic() - 6

        self.assertEqual(await entity.async_camera_image(), b"old-jpeg")
        await entity._snapshot_cache.task

        self.assertEqual(entity._snapshot_cache.image, b"go2rtc-jpeg")

    async def test_external_or_unknown_provider_never_gets_a_local_restream(self):
        """An external API port gives no reliable information about its RTSP port."""
        for url in ("http://external:1984", "http://localhost:1984", "https://localhost:11984/",
                    "http://localhost:bad/", ""):
            entity = self._camera(_Go2rtcClient())
            entity._webrtc_provider._url = url
            self.assertEqual(await entity._async_homekit_source("rtsp://example/lobby"), "rtsp://example/lobby")
            entity._webrtc_provider._rest_client.streams.add.assert_not_awaited()

    async def test_registration_failure_falls_back_without_affecting_ha(self):
        """A failed go2rtc registration does not break the direct HomeKit source."""
        client = _Go2rtcClient()
        client.streams.add.side_effect = OSError("offline")
        entity = self._camera(client)
        self.assertEqual(await entity._async_homekit_source("rtsp://example/lobby"), "rtsp://example/lobby")
        with patch("custom_components.akuvox.camera._called_from_homekit", return_value=False):
            self.assertEqual(await entity.stream_source(), "ffmpeg:rtsp://example/lobby#input=rtsp/udp")

    async def test_account_and_unicode_names_are_isolated(self):
        """Duplicate display names and previously colliding Unicode names stay separate."""
        client = _Go2rtcClient()
        names = []
        cases = [("first", "Front Door"), ("second", "Front Door"),
                 ("first", "דלת א"), ("first", "דלת ב"), ("first", "Front-Door")]
        for index, (account, name) in enumerate(cases):
            entity = camera.AkuvoxCameraEntity(_Hass(), SimpleNamespace(entry_id=account), name, f"rtsp://camera/{index}")
            names.append(await entity._async_ensure_go2rtc_stream(client))
        self.assertEqual(len(names), len(set(names)))
        self.assertEqual(len(client.streams.registered), len(cases))
        for index, name in enumerate(names):
            self.assertEqual(client.streams.registered[name], [f"ffmpeg:rtsp://camera/{index}#input=rtsp/udp"])

    async def test_parallel_snapshot_and_homekit_register_only_once(self):
        """Concurrent consumers do not race two registrations for one camera."""
        entity = self._camera(_Go2rtcClient())
        client = entity._webrtc_provider._rest_client
        await asyncio.gather(*(entity._async_ensure_go2rtc_stream(client) for _ in range(5)))
        client.streams.add.assert_awaited_once()

    async def test_failed_provider_snapshot_uses_direct_udp(self):
        """The existing direct snapshot path still works if go2rtc fails."""
        client = _Go2rtcClient()
        client.get_jpeg_snapshot.side_effect = OSError("unavailable")
        entity = self._camera(client)
        entity._async_direct_snapshot = AsyncMock(return_value=b"direct")
        self.assertEqual(await entity.async_camera_image(), b"direct")
        entity._async_direct_snapshot.assert_awaited_once()

    async def test_unload_removes_streams_and_stops_new_work(self):
        """Unloading/revoking an account removes its restream and snapshot cache."""
        client = _Go2rtcClient()
        entity = self._camera(client)
        await entity._async_ensure_go2rtc_stream(client)
        with patch.object(GenericCamera, "async_will_remove_from_hass", new_callable=AsyncMock):
            await entity.async_will_remove_from_hass()
        client._client.request.assert_awaited_once_with(
            "DELETE", "/api/streams", params={"src": entity._go2rtc_stream_name})
        self.assertIsNone(await entity.async_camera_image())
        self.assertIsNone(await entity._async_ensure_go2rtc_stream(client))

    async def test_direct_ha_stream_worker_does_not_use_homekit_alias(self):
        """HA's native stream worker receives the original UDP source."""
        entity = self._camera(_Go2rtcClient())
        with patch("custom_components.akuvox.camera._called_from_homekit", return_value=True):
            token = camera._DIRECT_SOURCE.set(True)
            try:
                self.assertEqual(await entity.stream_source(), "rtsp://example/lobby")
            finally:
                camera._DIRECT_SOURCE.reset(token)


    async def test_stalled_provider_leaves_time_for_direct_capture(self):
        """An unresponsive provider cannot consume the full snapshot deadline."""
        client = _Go2rtcClient()
        async def hang(*args):
            await asyncio.Event().wait()
        client.get_jpeg_snapshot.side_effect = hang
        entity = self._camera(client)
        entity._async_direct_snapshot = AsyncMock(return_value=b"direct")
        with patch.object(camera, "_GO2RTC_TIMEOUT", 0.01):
            self.assertEqual(await entity.async_camera_image(), b"direct")
        entity._async_direct_snapshot.assert_awaited_once()

    async def test_unload_waits_for_registration_then_removes_alias(self):
        """An in-flight registration cannot leave an alias behind after unload."""
        client = _Go2rtcClient()
        entity = self._camera(client)
        entered, release = asyncio.Event(), asyncio.Event()
        async def add(name, sources):
            entered.set()
            await release.wait()
            client.streams.registered[name] = sources
        client.streams.add.side_effect = add
        registration = asyncio.create_task(entity._async_ensure_go2rtc_stream(client))
        await entered.wait()
        with patch.object(GenericCamera, "async_will_remove_from_hass", new_callable=AsyncMock):
            removal = asyncio.create_task(entity.async_will_remove_from_hass())
            await asyncio.sleep(0)
            self.assertFalse(removal.done())
            release.set()
            await asyncio.gather(registration, removal)
        client._client.request.assert_awaited_once_with(
            "DELETE", "/api/streams", params={"src": entity._go2rtc_stream_name})
        self.assertIsNone(await entity._async_ensure_go2rtc_stream(client))
