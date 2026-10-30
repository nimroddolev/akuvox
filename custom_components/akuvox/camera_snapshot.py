"""Bounded-age snapshots with one cancellable capture per camera."""
from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from contextlib import suppress
import time

from homeassistant.core import HomeAssistant

from .const import LOGGER

SNAPSHOT_MAX_AGE = 5
SNAPSHOT_MAX_STALE = 30
SNAPSHOT_TIMEOUT = 8


class CameraSnapshotCache:
    """Share short-lived full-resolution frames without hiding camera outages."""

    def __init__(self, hass: HomeAssistant, capture: Callable[[], Awaitable[bytes | None]], name: str) -> None:
        """Keep the capture callback and its task scoped to this entity's lifetime."""
        self._hass = hass
        self._capture = capture
        self._name = name
        self.image: bytes | None = None
        self.updated_at = 0.0
        self.task: asyncio.Task | None = None
        self._stopped = False

    def start(self) -> asyncio.Task | None:
        """Deduplicate concurrent refresh requests, including the startup warmup."""
        if self._stopped:
            return None
        if self.task is None or self.task.done():
            self.task = self._hass.async_create_background_task(
                self._refresh(), f"akuvox snapshot {self._name}"
            )
        return self.task

    async def get(self) -> bytes | None:
        """Return a fresh or briefly stale frame, never an indefinitely old image."""
        if self._stopped:
            return None
        age = time.monotonic() - self.updated_at
        if self.image and age < SNAPSHOT_MAX_AGE:
            return self.image
        task = self.start()
        if self.image:
            return self.image if age <= SNAPSHOT_MAX_STALE else None
        if task is not None:
            # The capture has its own deadline. Cancelling a single caller must
            # not cancel the shared capture needed by another caller.
            with suppress(TimeoutError):
                await asyncio.wait_for(asyncio.shield(task), SNAPSHOT_TIMEOUT)
        return self.image

    async def _refresh(self) -> None:
        """Apply one overall timeout, even when the provider's REST client hangs."""
        try:
            async with asyncio.timeout(SNAPSHOT_TIMEOUT):
                image = await self._capture()
            if image:
                self.image = image
                self.updated_at = time.monotonic()
        except Exception as error:
            LOGGER.debug("Unable to refresh Akuvox snapshot for %s: %s", self._name, error)

    async def stop(self) -> None:
        """Stop captures before the entity or its credentials are unloaded."""
        self._stopped = True
        if self.task is not None and not self.task.done():
            self.task.cancel()
            with suppress(asyncio.CancelledError):
                await self.task
        self.image = None
