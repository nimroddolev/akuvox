"""Snapshot freshness, concurrent callers, capture timeouts and unload coverage."""
import asyncio
import time
import unittest
from unittest.mock import AsyncMock, patch

from custom_components.akuvox.camera_snapshot import CameraSnapshotCache
from test_platforms_e2e import _Hass


class TestSnapshotLifecycle(unittest.IsolatedAsyncioTestCase):
    """An offline camera must not look current or retain work after unload."""

    async def test_fresh_and_briefly_stale_frames_do_not_block_callers(self):
        """A brief stale window hides latency without treating old frames as live."""
        capture = AsyncMock(return_value=b"new")
        cache = CameraSnapshotCache(_Hass(), capture, "Lobby")
        cache.image = b"old"
        cache.updated_at = time.monotonic()
        self.assertEqual(await cache.get(), b"old")
        capture.assert_not_awaited()
        cache.updated_at -= 6
        self.assertEqual(await cache.get(), b"old")
        await cache.task
        self.assertEqual(await cache.get(), b"new")
        capture.assert_awaited_once()

    async def test_expired_frame_is_not_returned_after_failed_refresh(self):
        """Repeated capture failures never keep an old image visible indefinitely."""
        cache = CameraSnapshotCache(_Hass(), AsyncMock(return_value=None), "Lobby")
        cache.image = b"old"
        cache.updated_at = time.monotonic() - 31
        for _ in range(2):
            self.assertIsNone(await cache.get())
            await cache.task
        cache._capture.return_value = b"recovered"
        self.assertIsNone(await cache.get())
        await cache.task
        self.assertEqual(await cache.get(), b"recovered")

    async def test_concurrent_first_requests_share_one_capture(self):
        """Multiple viewers reuse the same initial in-flight capture."""
        release = asyncio.Event()

        async def capture():
            await release.wait()
            return b"frame"

        callback = AsyncMock(side_effect=capture)
        cache = CameraSnapshotCache(_Hass(), callback, "Lobby")
        first = asyncio.create_task(cache.get())
        second = asyncio.create_task(cache.get())
        await asyncio.sleep(0)
        release.set()
        self.assertEqual(await asyncio.gather(first, second), [b"frame", b"frame"])
        callback.assert_awaited_once()

    async def test_cancelling_one_viewer_does_not_cancel_other_viewers(self):
        """A disconnected HomeKit request must not cancel the panel's snapshot."""
        entered, release = asyncio.Event(), asyncio.Event()

        async def capture():
            entered.set()
            await release.wait()
            return b"frame"

        cache = CameraSnapshotCache(_Hass(), capture, "Lobby")
        first = asyncio.create_task(cache.get())
        await entered.wait()
        second = asyncio.create_task(cache.get())
        first.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await first
        self.assertFalse(cache.task.cancelled())
        release.set()
        self.assertEqual(await second, b"frame")

    async def test_hung_capture_times_out_and_later_request_can_retry(self):
        """Both the shared task and waiting caller have bounded deadlines."""
        capture = AsyncMock(side_effect=lambda: None)

        async def hang():
            await asyncio.Event().wait()

        capture.side_effect = hang
        cache = CameraSnapshotCache(_Hass(), capture, "Lobby")
        with patch("custom_components.akuvox.camera_snapshot.SNAPSHOT_TIMEOUT", 0.01):
            self.assertIsNone(await cache.get())
            await cache.task
        self.assertTrue(cache.task.done())
        capture.side_effect = None
        capture.return_value = b"recovered"
        self.assertEqual(await cache.get(), b"recovered")

    async def test_unload_cancels_capture_and_clears_cached_credentials_work(self):
        """Warmup captures cannot outlive a removed or revoked camera entity."""
        entered = asyncio.Event()

        async def capture():
            entered.set()
            await asyncio.Event().wait()

        cache = CameraSnapshotCache(_Hass(), capture, "Lobby")
        cache.start()
        await entered.wait()
        await cache.stop()
        self.assertTrue(cache.task.cancelled())
        self.assertIsNone(cache.start())
        self.assertIsNone(await cache.get())
