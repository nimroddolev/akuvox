"""End-to-end Home Assistant lifecycle tests for the Akuvox integration."""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from homeassistant.exceptions import ConfigEntryAuthFailed, ConfigEntryNotReady
from homeassistant.helpers.update_coordinator import UpdateFailed

from custom_components.akuvox import (
    async_reload_entry,
    async_setup,
    async_setup_entry,
    async_stop_polling,
    async_unload_entry,
)
from custom_components.akuvox.api import (
    AkuvoxApiClientAuthenticationError,
    AkuvoxApiClientCommunicationError,
)
from custom_components.akuvox import repairs
from custom_components.akuvox.const import DOMAIN
from custom_components.akuvox.coordinator import AkuvoxDataUpdateCoordinator


class _Client:
    """Records integration lifecycle calls without external I/O."""

    def __init__(self, *_args, **_kwargs) -> None:
        self.started = False
        self.stopped = False
        self.polling_stopped = False
        self.skip_reload = False

    def async_start_proactive_token_refresh(self) -> None:
        self.started = True

    def async_stop_proactive_token_refresh(self) -> None:
        self.stopped = True

    def consume_entry_reload_skip(self) -> bool:
        value, self.skip_reload = self.skip_reload, False
        return value

    async def async_stop_polling(self) -> None:
        self.polling_stopped = True


class _Coordinator:
    """Provides coordinator lifecycle hooks used by integration setup."""

    def __init__(self, hass, client) -> None:
        """Create a fake coordinator for one config entry."""
        self.client = client
        self.first_refresh = AsyncMock()

    async def async_config_entry_first_refresh(self) -> None:
        await self.first_refresh()


class _UnavailableCoordinator(_Coordinator):
    """Models a temporary SmartPlus transport outage during startup."""

    async def async_config_entry_first_refresh(self) -> None:
        raise UpdateFailed("Timed out fetching SmartPlus API data")


class _NotReadyCoordinator(_Coordinator):
    """Models Home Assistant's first-refresh wrapper for a transport outage."""

    async def async_config_entry_first_refresh(self) -> None:
        raise ConfigEntryNotReady("Timed out fetching SmartPlus API data")


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

    def async_entries(self, _domain: str):
        """Return no additional entries for the isolated lifecycle harness."""
        return []


class _Hass:
    """Provides the subset of Home Assistant used by lifecycle functions."""

    def __init__(self) -> None:
        self.data = {}
        self.config_entries = _ConfigEntries()


class TestIntegrationLifecycleE2E(unittest.IsolatedAsyncioTestCase):
    """Verify setup, routine token updates, reload, and unload work together."""

    async def test_domain_setup_registered_panel_commands_without_an_account(self) -> None:
        """The empty-account panel could request its WebSocket data."""
        hass = _Hass()
        with (
            patch("custom_components.akuvox.async_register_websocket_api") as register,
            patch("custom_components.akuvox.async_refresh_panel", new=AsyncMock()) as refresh_panel,
        ):
            self.assertTrue(await async_setup(hass, {}))
        register.assert_called_once_with(hass)
        refresh_panel.assert_awaited_once_with(hass)

    async def test_setup_reload_and_unload_completed_cleanly(self) -> None:
        """Integration lifecycle registered and removed every managed resource."""
        hass = _Hass()
        entry = _Entry()
        with (
            patch("custom_components.akuvox.async_load_and_migrate_credentials", new=AsyncMock(return_value={})),
            patch("custom_components.akuvox.AkuvoxApiClient", _Client),
            patch("custom_components.akuvox.AkuvoxDataUpdateCoordinator", _Coordinator),
            patch("custom_components.akuvox.async_get_clientsession", return_value=object()),
            patch("custom_components.akuvox.async_register_websocket_api"),
            patch("custom_components.akuvox.async_refresh_panel", new=AsyncMock()),
            patch("custom_components.akuvox.async_clear_authentication_failure"),
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

        with patch("custom_components.akuvox.async_refresh_panel", new=AsyncMock()):
            self.assertTrue(await async_unload_entry(hass, entry))
        self.assertTrue(coordinator.client.stopped)
        self.assertNotIn(entry.entry_id, hass.data[DOMAIN])

    async def test_stopping_one_account_left_other_activity_pollers_running(self) -> None:
        """Activity polling belongs to the selected config entry only."""
        hass = _Hass()
        first = _Client()
        second = _Client()
        hass.data[DOMAIN] = {
            "first": type("Coordinator", (), {"client": first})(),
            "second": type("Coordinator", (), {"client": second})(),
        }

        await async_stop_polling(hass, "second")

        self.assertFalse(first.polling_stopped)
        self.assertTrue(second.polling_stopped)

    async def test_setup_kept_panel_available_when_cloud_was_temporarily_unavailable(self) -> None:
        """A transport timeout did not put the whole integration into retry-only state."""
        hass = _Hass()
        entry = _Entry()
        with (
            patch("custom_components.akuvox.async_load_and_migrate_credentials", new=AsyncMock(return_value={})),
            patch("custom_components.akuvox.AkuvoxApiClient", _Client),
            patch("custom_components.akuvox.AkuvoxDataUpdateCoordinator", _UnavailableCoordinator),
            patch("custom_components.akuvox.async_get_clientsession", return_value=object()),
            patch("custom_components.akuvox.async_register_websocket_api"),
            patch("custom_components.akuvox.async_refresh_panel", new=AsyncMock()) as refresh_panel,
            patch("custom_components.akuvox.async_clear_authentication_failure"),
        ):
            self.assertTrue(await async_setup_entry(hass, entry))

        self.assertIn(entry.entry_id, hass.data[DOMAIN])
        refresh_panel.assert_awaited_once_with(hass)

    async def test_setup_kept_panel_available_when_first_refresh_was_not_ready(self) -> None:
        """The Home Assistant first-refresh wrapper did not hide the panel."""
        hass = _Hass()
        entry = _Entry()
        with (
            patch("custom_components.akuvox.async_load_and_migrate_credentials", new=AsyncMock(return_value={})),
            patch("custom_components.akuvox.AkuvoxApiClient", _Client),
            patch("custom_components.akuvox.AkuvoxDataUpdateCoordinator", _NotReadyCoordinator),
            patch("custom_components.akuvox.async_get_clientsession", return_value=object()),
            patch("custom_components.akuvox.async_register_websocket_api"),
            patch("custom_components.akuvox.async_refresh_panel", new=AsyncMock()) as refresh_panel,
            patch("custom_components.akuvox.async_clear_authentication_failure"),
        ):
            self.assertTrue(await async_setup_entry(hass, entry))

        self.assertIn(entry.entry_id, hass.data[DOMAIN])
        refresh_panel.assert_awaited_once_with(hass)


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


class TestAuthenticationRepairE2E(unittest.TestCase):
    """Verify Home Assistant owns the single reauthentication repair."""

    def test_auth_failure_kept_panel_state_without_creating_a_second_repair(self) -> None:
        """The custom panel state did not duplicate Home Assistant's repair."""
        hass = MagicMock()
        hass.data = {}
        entry = MagicMock(entry_id="entry-id")

        with (
            patch("custom_components.akuvox.repairs.ir.async_create_issue") as create_issue,
            patch("custom_components.akuvox.repairs.ir.async_delete_issue") as delete_issue,
        ):
            repairs.async_report_authentication_failure(hass, entry)

        create_issue.assert_not_called()
        delete_issue.assert_called_once_with(
            hass, DOMAIN, "reauthentication_required_entry-id"
        )
        self.assertTrue(repairs.authentication_failed(hass, "entry-id"))


class TestActivityStorageRepairsE2E(unittest.TestCase):
    """Verify activity-storage warnings follow the configured threshold."""

    def setUp(self) -> None:
        self.hass = MagicMock()
        self.entry = MagicMock(entry_id="entry-id", title="Home")

    def test_warning_escalates_at_each_threshold(self) -> None:
        """The current repair reflects the highest reached storage threshold."""
        with patch("custom_components.akuvox.repairs.ir.async_create_issue") as create_issue:
            for usage, level in ((90, "90"), (95, "95"), (99, "99"), (100, "full")):
                repairs.async_update_activity_storage_warning(
                    self.hass, self.entry, usage, 100
                )
                self.assertEqual(
                    create_issue.call_args.kwargs["translation_key"],
                    f"activity_storage_{level}",
                )

    def test_warning_clears_below_ninety_percent(self) -> None:
        """Storage usage below the warning threshold removes the repair."""
        with patch("custom_components.akuvox.repairs.ir.async_delete_issue") as delete_issue:
            repairs.async_update_activity_storage_warning(
                self.hass, self.entry, 89, 100
            )

        delete_issue.assert_called_once_with(
            self.hass, DOMAIN, "activity_storage_limit_entry-id"
        )
