"""End-to-end Home Assistant lifecycle tests for the Akuvox integration."""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import UpdateFailed

from custom_components.akuvox import async_reload_entry, async_setup_entry, async_unload_entry
from custom_components.akuvox.api import (
    AkuvoxApiClientAuthenticationError,
    AkuvoxApiClientCommunicationError,
)
from custom_components.akuvox.const import DOMAIN
from custom_components.akuvox.coordinator import AkuvoxDataUpdateCoordinator


class _Client:
    """Records integration lifecycle calls without external I/O."""

    def __init__(self, *_args, **_kwargs) -> None:
        self.started = False
        self.stopped = False
        self.skip_reload = False

    def async_start_proactive_token_refresh(self) -> None:
        self.started = True

    def async_stop_proactive_token_refresh(self) -> None:
        self.stopped = True

    def consume_entry_reload_skip(self) -> bool:
        value, self.skip_reload = self.skip_reload, False
        return value

    async def async_stop_polling(self) -> None:
        return None


class _Coordinator:
    """Provides coordinator lifecycle hooks used by integration setup."""

    def __init__(self, hass, client) -> None:
        """Create a fake coordinator for one config entry."""
        self.client = client
        self.first_refresh = AsyncMock()

    async def async_config_entry_first_refresh(self) -> None:
        await self.first_refresh()


class _Entry:
    """Minimal config entry suitable for the integration lifecycle."""

    entry_id = "entry-id"
    data = {"token": "token"}
    options = {}

    def __init__(self) -> None:
        self.unload_callbacks = []

    def add_update_listener(self, listener):
        return listener

    def async_on_unload(self, callback) -> None:
        self.unload_callbacks.append(callback)


class _ConfigEntries:
    """Imitates the Home Assistant config-entry manager."""

    def __init__(self) -> None:
        self.forwarded = AsyncMock()
        self.unloaded = AsyncMock(return_value=True)
        self.reloaded = AsyncMock()

    async def async_forward_entry_setups(self, entry, platforms) -> None:
        await self.forwarded(entry, platforms)

    async def async_unload_platforms(self, entry, platforms) -> bool:
        return await self.unloaded(entry, platforms)

    async def async_reload(self, entry_id: str) -> None:
        await self.reloaded(entry_id)


class _Hass:
    """Provides the subset of Home Assistant used by lifecycle functions."""

    def __init__(self) -> None:
        self.data = {}
        self.config_entries = _ConfigEntries()


class TestIntegrationLifecycleE2E(unittest.IsolatedAsyncioTestCase):
    """Verify setup, routine token updates, reload, and unload work together."""

    async def test_setup_reload_and_unload_completed_cleanly(self) -> None:
        """Integration lifecycle registered and removed every managed resource."""
        hass = _Hass()
        entry = _Entry()
        with (
            patch("custom_components.akuvox.async_load_and_migrate_credentials", new=AsyncMock(return_value={})),
            patch("custom_components.akuvox.AkuvoxApiClient", _Client),
            patch("custom_components.akuvox.AkuvoxDataUpdateCoordinator", _Coordinator),
            patch("custom_components.akuvox.async_get_clientsession", return_value=object()),
        ):
            self.assertTrue(await async_setup_entry(hass, entry))

        coordinator = hass.data[DOMAIN][entry.entry_id]
        self.assertTrue(coordinator.client.started)
        self.assertEqual(len(entry.unload_callbacks), 2)

        coordinator.client.skip_reload = True
        await async_reload_entry(hass, entry)
        hass.config_entries.reloaded.assert_not_awaited()

        await async_reload_entry(hass, entry)
        hass.config_entries.reloaded.assert_awaited_once_with(entry.entry_id)

        self.assertTrue(await async_unload_entry(hass, entry))
        self.assertTrue(coordinator.client.stopped)
        self.assertNotIn(entry.entry_id, hass.data[DOMAIN])


class _DataClient:
    """Configurable client used to verify coordinator exception handling."""

    def __init__(self, result=True, error=None) -> None:
        self.result = result
        self.error = error

    async def async_retrieve_user_data(self) -> bool:
        if self.error:
            raise self.error
        return self.result

    def get_devices_json(self) -> dict:
        return {"camera_data": []}


class TestCoordinatorE2E(unittest.IsolatedAsyncioTestCase):
    """Verify coordinator outcomes map to Home Assistant health states."""

    async def test_auth_and_transport_errors_mapped_correctly(self) -> None:
        """Authentication and connectivity failures received distinct HA errors."""
        hass = MagicMock()
        with patch("custom_components.akuvox.coordinator.DataUpdateCoordinator.__init__", return_value=None):
            auth_coordinator = AkuvoxDataUpdateCoordinator(
                hass, _DataClient(error=AkuvoxApiClientAuthenticationError("expired"))
            )
            network_coordinator = AkuvoxDataUpdateCoordinator(
                hass, _DataClient(error=AkuvoxApiClientCommunicationError("offline"))
            )

        auth_coordinator.hass = hass
        network_coordinator.hass = hass
        with self.assertRaises(ConfigEntryAuthFailed):
            await auth_coordinator._async_update_data()
        with self.assertRaises(UpdateFailed):
            await network_coordinator._async_update_data()
