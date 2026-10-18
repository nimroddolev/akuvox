"""Panel WebSocket command tests using a Home Assistant-shaped harness."""
from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from homeassistant.components.logger.helpers import DATA_LOGGER

from custom_components.akuvox import panel
from custom_components.akuvox.const import (
    ACTIVITY_HISTORY_MAX_STORAGE_MB,
    ACTIVITY_IMAGE_ORIENTATIONS,
    CAMERA_STREAM_ORIENTATIONS,
    CUSTOM_ACTIVITY_IMAGE_ORIENTATIONS,
    CUSTOM_CAMERA_STREAM_ORIENTATIONS,
    CUSTOM_EVENT_IMAGE_WAIT,
    DEBUG_LOGGING,
    EVENT_IMAGE_WAIT_OVERRIDES,
    STORE_ACTIVITY_HISTORY,
    WAIT_FOR_EVENT_IMAGE,
    DOMAIN,
)
from custom_components.akuvox.coordinator import AkuvoxDataUpdateCoordinator


class _Connection:
    """Capture WebSocket results without a running HTTP server."""

    def __init__(self, *, is_admin: bool) -> None:
        self.user = SimpleNamespace(is_admin=is_admin)
        self.results: list[tuple[int, dict]] = []
        self.errors: list[tuple[int, str, str]] = []

    def send_result(self, message_id: int, result: dict | None = None) -> None:
        self.results.append((message_id, result or {}))

    def send_error(self, message_id: int, code: str, message: str) -> None:
        self.errors.append((message_id, code, message))


class _Entry:
    entry_id = "entry-id"
    title = "Front entrance"
    disabled_by = None

    def __init__(self) -> None:
        self.data = {}
        self.options = {"obsolete_option": True}


class _ConfigEntries:
    """Implement the config-entry calls made by the panel handlers."""

    def __init__(self, entry: _Entry) -> None:
        self.entry = entry
        self.updated: list[tuple[_Entry, dict]] = []

    def async_entries(self, domain: str) -> list[_Entry]:
        assert domain == DOMAIN
        return [self.entry]

    def async_get_entry(self, entry_id: str) -> _Entry | None:
        return self.entry if entry_id == self.entry.entry_id else None

    def async_update_entry(self, entry: _Entry, **kwargs) -> None:
        self.updated.append((entry, kwargs))
        if "options" in kwargs:
            entry.options = kwargs["options"]


class _Hass:
    """Small Home Assistant substitute for the panel's command boundary."""

    def __init__(self, entry: _Entry, client: MagicMock) -> None:
        logger_settings = SimpleNamespace(async_update=AsyncMock())
        self.data = {
            DOMAIN: {entry.entry_id: AkuvoxDataUpdateCoordinator.__new__(AkuvoxDataUpdateCoordinator)},
            DATA_LOGGER: SimpleNamespace(settings=logger_settings),
        }
        self.data[DOMAIN][entry.entry_id].client = client
        self.config_entries = _ConfigEntries(entry)


def _settings_message() -> dict:
    return {
        "id": 7,
        "entry_id": "entry-id",
        CUSTOM_CAMERA_STREAM_ORIENTATIONS: True,
        CAMERA_STREAM_ORIENTATIONS: {"Front camera": "rotate_90", "Unknown": "invalid"},
        CUSTOM_ACTIVITY_IMAGE_ORIENTATIONS: True,
        ACTIVITY_IMAGE_ORIENTATIONS: {"Front camera": "flip_horizontal"},
        STORE_ACTIVITY_HISTORY: True,
        ACTIVITY_HISTORY_MAX_STORAGE_MB: 25,
        WAIT_FOR_EVENT_IMAGE: True,
        CUSTOM_EVENT_IMAGE_WAIT: True,
        EVENT_IMAGE_WAIT_OVERRIDES: {"Front camera": True, "Unknown": "not-a-bool"},
        DEBUG_LOGGING: True,
    }


class TestPanelWebSocketE2E(unittest.IsolatedAsyncioTestCase):
    """Cover authorization and persistence at the panel's WebSocket boundary."""

    def setUp(self) -> None:
        """Create one account and API client for each isolated command test."""
        self.entry = _Entry()
        self.client = MagicMock()
        self.client.get_panel_data.return_value = {
            "cameras": [{"name": "Front camera"}],
            "relays": [],
        }
        self.client.async_clear_panel_activity_storage = AsyncMock()
        self.hass = _Hass(self.entry, self.client)

    async def test_non_admin_cannot_clear_local_history(self) -> None:
        """A non-admin command must not invoke a destructive client action."""
        connection = _Connection(is_admin=False)

        await panel.websocket_panel_clear_activity_storage.__wrapped__(
            self.hass, connection, {"id": 3, "entry_id": self.entry.entry_id}
        )

        self.assertEqual(connection.errors, [(3, "unauthorized", "Administrator access is required")])
        self.client.async_clear_panel_activity_storage.assert_not_awaited()

    async def test_admin_settings_save_filters_values_and_persists_logger_level(self) -> None:
        """Settings requests persist only known camera settings and logger state."""
        connection = _Connection(is_admin=True)
        with patch("custom_components.akuvox.panel.async_refresh_panel", new=AsyncMock()) as refresh:
            await panel.websocket_panel_save_settings.__wrapped__(
                self.hass, connection, _settings_message()
            )

        self.assertEqual(connection.results, [(7, {})])
        self.client.skip_next_entry_reload.assert_called_once_with()
        self.assertEqual(len(self.hass.config_entries.updated), 1)
        options = self.entry.options
        self.assertTrue(options["obsolete_option"])
        self.assertEqual(options[CAMERA_STREAM_ORIENTATIONS], {"Front camera": "rotate_90"})
        self.assertEqual(options[ACTIVITY_IMAGE_ORIENTATIONS], {"Front camera": "flip_horizontal"})
        self.assertEqual(options[EVENT_IMAGE_WAIT_OVERRIDES], {"Front camera": True})
        self.assertEqual(options[ACTIVITY_HISTORY_MAX_STORAGE_MB], 25)
        self.assertTrue(options[DEBUG_LOGGING])
        refresh.assert_awaited_once_with(self.hass)
        logger_update = self.hass.data[DATA_LOGGER].settings.async_update
        logger_update.assert_awaited_once()
        self.assertEqual(logger_update.await_args.args[1], DOMAIN)
        self.assertEqual(logger_update.await_args.args[2].level, "DEBUG")
