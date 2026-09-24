"""End-to-end Home Assistant lifecycle tests for the Akuvox integration."""
from __future__ import annotations

import asyncio
import json
import unittest
from types import SimpleNamespace
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
from custom_components.akuvox import panel
from custom_components.akuvox.sharing import (
    _filter_shared_activity,
    _filter_shared_devices,
    _permission_relay_ids,
    _source_account_label,
    CredentialShareView,
    _digest,
    async_apply_remote_share_link,
    async_create_share,
    get_external_url,
)


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

    async def async_start_polling(self) -> None:
        """Match the runtime poller startup invoked after HA starts."""

    async def async_load_panel_history(self) -> None:
        """Match the deferred panel-history task."""

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

    async def async_refresh(self) -> None:
        await self.first_refresh()


class _UnavailableCoordinator(_Coordinator):
    """Models a temporary SmartPlus transport outage during startup."""

    async def async_refresh(self) -> None:
        raise UpdateFailed("Timed out fetching SmartPlus API data")


class _NotReadyCoordinator(_Coordinator):
    """Models Home Assistant's first-refresh wrapper for a transport outage."""

    async def async_refresh(self) -> None:
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
        self.entries = []

    async def async_forward_entry_setups(self, entry, platforms) -> None:
        await self.forwarded(entry, platforms)

    async def async_unload_platforms(self, entry, platforms) -> bool:
        return await self.unloaded(entry, platforms)

    async def async_reload(self, entry_id: str) -> None:
        await self.reloaded(entry_id)

    def async_entries(self, _domain: str):
        """Return config entries for the isolated lifecycle harness."""
        return self.entries


class _Hass:
    """Provides the subset of Home Assistant used by lifecycle functions."""

    def __init__(self) -> None:
        self.data = {}
        self.config_entries = _ConfigEntries()
        self.http = MagicMock()
        self.http.async_register_static_paths = AsyncMock()
        self._tasks: set[asyncio.Task] = set()

    def async_create_task(self, coroutine):
        task = asyncio.create_task(coroutine)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return task

    def add_job(self, coroutine) -> None:
        self.async_create_task(coroutine)


class TestPanelRegistrationE2E(unittest.IsolatedAsyncioTestCase):
    """Verify the integration panel is associated with its config entry."""

    async def test_integration_settings_open_the_smartplus_panel(self) -> None:
        """Home Assistant routes the entry Settings action to the panel."""
        hass = _Hass()
        hass.config_entries.entries = [_Entry()]
        with (
            patch("custom_components.akuvox.panel.add_extra_js_url"),
            patch(
                "custom_components.akuvox.panel.panel_custom.async_register_panel",
                new=AsyncMock(),
            ) as register_panel,
        ):
            await panel.async_refresh_panel(hass)

        self.assertEqual(
            register_panel.await_args.kwargs["config_panel_domain"],
            DOMAIN,
        )
        self.assertTrue(register_panel.await_args.kwargs["require_admin"])


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
            patch("custom_components.akuvox.async_load_and_migrate_credentials", new=AsyncMock(return_value={"auth_token": "auth", "token": "token"})),
            patch("custom_components.akuvox.AkuvoxApiClient", _Client),
            patch("custom_components.akuvox.AkuvoxDataUpdateCoordinator", _Coordinator),
            patch("custom_components.akuvox.async_get_clientsession", return_value=object()),
            patch("custom_components.akuvox.async_register_websocket_api"),
            patch("custom_components.akuvox.async_refresh_panel", new=AsyncMock()),
            patch("custom_components.akuvox.async_clear_authentication_failure"),
            patch("custom_components.akuvox.async_at_started", return_value=MagicMock()),
        ):
            self.assertTrue(await async_setup_entry(hass, entry))

        coordinator = hass.data[DOMAIN][entry.entry_id]
        self.assertFalse(coordinator.client.started)
        self.assertEqual(len(entry.unload_callbacks), 4)

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
            patch("custom_components.akuvox.async_load_and_migrate_credentials", new=AsyncMock(return_value={"auth_token": "auth", "token": "token"})),
            patch("custom_components.akuvox.AkuvoxApiClient", _Client),
            patch("custom_components.akuvox.AkuvoxDataUpdateCoordinator", _UnavailableCoordinator),
            patch("custom_components.akuvox.async_get_clientsession", return_value=object()),
            patch("custom_components.akuvox.async_register_websocket_api"),
            patch("custom_components.akuvox.async_refresh_panel", new=AsyncMock()) as refresh_panel,
            patch("custom_components.akuvox.async_clear_authentication_failure"),
            patch("custom_components.akuvox.async_at_started", return_value=MagicMock()),
        ):
            self.assertTrue(await async_setup_entry(hass, entry))

        self.assertIn(entry.entry_id, hass.data[DOMAIN])
        refresh_panel.assert_not_awaited()

    async def test_setup_kept_panel_available_when_first_refresh_was_not_ready(self) -> None:
        """The Home Assistant first-refresh wrapper did not hide the panel."""
        hass = _Hass()
        entry = _Entry()
        with (
            patch("custom_components.akuvox.async_load_and_migrate_credentials", new=AsyncMock(return_value={"auth_token": "auth", "token": "token"})),
            patch("custom_components.akuvox.AkuvoxApiClient", _Client),
            patch("custom_components.akuvox.AkuvoxDataUpdateCoordinator", _NotReadyCoordinator),
            patch("custom_components.akuvox.async_get_clientsession", return_value=object()),
            patch("custom_components.akuvox.async_register_websocket_api"),
            patch("custom_components.akuvox.async_refresh_panel", new=AsyncMock()) as refresh_panel,
            patch("custom_components.akuvox.async_clear_authentication_failure"),
            patch("custom_components.akuvox.async_at_started", return_value=MagicMock()),
        ):
            self.assertTrue(await async_setup_entry(hass, entry))

        self.assertIn(entry.entry_id, hass.data[DOMAIN])
        refresh_panel.assert_not_awaited()


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


class TestSharedDeviceScopingE2E(unittest.TestCase):
    """Verify a receiver receives only its explicitly shared devices."""

    def test_device_scope_excluded_other_devices_and_mixed_temporary_keys(self) -> None:
        """Unshared devices and keys spanning an unshared relay stay hidden."""
        source = {
            "camera_data": [{"name": "Lobby"}, {"name": "Garage"}],
            "door_relay_data": [
                {"name": "Lobby", "mac": "AA", "relay_id": "0"},
                {"name": "Garage", "mac": "BB", "relay_id": "1"},
            ],
            "door_keys_data": [
                {"key_id": "only-lobby", "doors": [{"mac": "AA", "relay": "0"}]},
                {"key_id": "mixed", "doors": [{"mac": "AA", "relay": "0"}, {"mac": "BB", "relay": "1"}]},
            ],
        }

        scoped = _filter_shared_devices(source, ["camera:Lobby", "relay:AA:0"])

        self.assertEqual(scoped["camera_data"], [{"name": "Lobby"}])
        self.assertEqual(scoped["door_relay_data"], [source["door_relay_data"][0]])
        self.assertEqual([key["key_id"] for key in scoped["door_keys_data"]], ["only-lobby"])

    def test_create_permission_only_includes_explicitly_permitted_relays(self) -> None:
        """A receiver cannot offer relays that were excluded from key creation."""
        share = {
            "device_ids": ["relay:AA:0", "relay:BB:1"],
            "create_key_relay_ids": ["relay:AA:0"],
        }

        self.assertEqual(
            _permission_relay_ids(share, "create_key_relay_ids", "allow_create_keys"),
            ["relay:AA:0"],
        )

    def test_key_scope_excludes_keys_with_a_relay_without_view_permission(self) -> None:
        """A key is visible only when every relay it uses has View permission."""
        source = {
            "camera_data": [],
            "door_relay_data": [
                {"name": "Lobby", "mac": "AA", "relay_id": "0"},
                {"name": "Garage", "mac": "BB", "relay_id": "1"},
            ],
            "door_keys_data": [
                {"key_id": "lobby", "doors": [{"mac": "AA", "relay": "0"}]},
                {
                    "key_id": "mixed",
                    "doors": [{"mac": "AA", "relay": "0"}, {"mac": "BB", "relay": "1"}],
                },
            ],
        }

        scoped = _filter_shared_devices(
            source,
            ["relay:AA:0", "relay:BB:1"],
            ["relay:AA:0"],
        )

        self.assertEqual([key["key_id"] for key in scoped["door_keys_data"]], ["lobby"])

    def test_activity_scope_includes_all_event_types_for_selected_devices(self) -> None:
        """Camera, motion, and door events share the same per-device scope."""
        activity = [
            {"Location": "Lobby", "CaptureType": "door"},
            {"Location": "Lobby", "CaptureType": "motion"},
            {"Location": "Garage", "CaptureType": "camera"},
        ]

        self.assertEqual(
            _filter_shared_activity(activity, ["Lobby"]), activity[:2]
        )


class TestCredentialShareUrlE2E(unittest.TestCase):
    """Verify pairing links use Home Assistant's public URL resolver."""

    def test_pairing_link_uses_preferred_https_external_url(self) -> None:
        """A current public URL is chosen instead of a saved configuration value."""
        hass = MagicMock()
        with patch(
            "custom_components.akuvox.sharing.get_url",
            return_value="https://current.example.com",
        ) as get_url:
            self.assertEqual(get_external_url(hass), "https://current.example.com")

        get_url.assert_called_once_with(
            hass,
            allow_internal=False,
            prefer_external=True,
            require_ssl=True,
        )


class TestRemoteShareLinkReplacementE2E(unittest.IsolatedAsyncioTestCase):
    """Verify a new pairing link preserves cached remote account data."""

    async def test_replacement_keeps_cached_devices_and_credentials(self) -> None:
        """Only the source pointer and secret change before the first sync."""
        hass = MagicMock()
        hass.data = {}
        entry = MagicMock(entry_id="entry-id")
        entry.data = {
            "remote_source_url": "https://old.example.com",
            "remote_share_id": "old-share",
            "camera_data": [{"name": "Cached camera"}],
            "token": "cached-token",
        }

        with patch(
            "custom_components.akuvox.sharing.async_store_remote_share_secret",
            new=AsyncMock(),
        ) as store_secret, patch(
            "custom_components.akuvox.sharing.async_update_credential_source_issue"
        ) as clear_issue:
            await async_apply_remote_share_link(
                hass,
                entry,
                "akuvox-share://v1?url=https%3A%2F%2Fnew.example.com&id=new-share&secret=new-secret",
            )

        store_secret.assert_awaited_once_with(hass, "entry-id", "new-secret")
        clear_issue.assert_called_once_with(hass, entry, None)
        saved_data = hass.config_entries.async_update_entry.call_args.kwargs["data"]
        self.assertEqual(saved_data["remote_source_url"], "https://new.example.com")
        self.assertEqual(saved_data["remote_share_id"], "new-share")
        self.assertEqual(saved_data["camera_data"], [{"name": "Cached camera"}])
        self.assertEqual(saved_data["token"], "cached-token")


class TestRemoteHubNameE2E(unittest.TestCase):
    """Verify a receiver retains its source hub's display name."""

    def test_source_hub_name_wins_over_generic_entry_title(self) -> None:
        """Pairing snapshots use the SmartPlus project name as their label."""
        entry = MagicMock()
        entry.title = "Akuvox SmartPlus"
        client = MagicMock()
        client.get_panel_data.return_value = {"project_name": "Benny Berman 7"}

        self.assertEqual(_source_account_label(entry, client), "Benny Berman 7")


class TestPanelHubSelectionE2E(unittest.TestCase):
    """Verify the panel header only exposes enabled hubs."""

    def test_disabled_hub_is_omitted_from_the_account_selector(self) -> None:
        """A disabled config entry is not a selectable panel account."""
        enabled = SimpleNamespace(disabled_by=None)
        disabled = SimpleNamespace(disabled_by="user")
        hass = MagicMock()
        hass.config_entries.async_entries.return_value = [enabled, disabled]

        self.assertEqual(panel._visible_panel_entries(hass), [enabled])


class TestOneTimePairingLinkE2E(unittest.IsolatedAsyncioTestCase):
    """Verify a pairing URI cannot bootstrap more than one receiver."""

    async def test_pairing_secret_is_replaced_after_first_valid_exchange(self) -> None:
        """The original link is rejected while the issued receiver secret works."""
        pairing_secret = "one-time-secret"
        shares = {
            "share-id": {
                "entry_id": "entry-id",
                "pairing_secret_hash": _digest(pairing_secret),
                "receiver_secret_hash": None,
                "expires_at": "2030-01-01T00:00:00+00:00",
                "activated": False,
                "revoked": False,
                "device_ids": [],
            }
        }
        store = MagicMock()
        store.async_load = AsyncMock(return_value=shares)
        store.async_save = AsyncMock()
        entry = MagicMock(entry_id="entry-id", title="Benny Berman 7")
        entry.data = {}
        hass = MagicMock()
        hass.data = {DOMAIN: {}}
        hass.config_entries.async_get_entry.return_value = entry
        request = MagicMock(headers={"Authorization": f"Bearer {pairing_secret}"})

        with (
            patch("custom_components.akuvox.sharing._store", return_value=store),
            patch(
                "custom_components.akuvox.sharing.async_get_credentials",
                new=AsyncMock(return_value={"auth_token": "auth", "token": "token"}),
            ),
        ):
            view = CredentialShareView(hass)
            first = await view.get(request, "share-id")
            payload = json.loads(first.body)
            second = await view.get(request, "share-id")
            receiver_request = MagicMock(
                headers={"Authorization": f"Bearer {payload['receiver_secret']}"}
            )
            receiver = await view.get(receiver_request, "share-id")

        self.assertEqual(first.status, 200)
        self.assertIn("receiver_secret", payload)
        self.assertEqual(second.status, 403)
        self.assertEqual(receiver.status, 200)

    async def test_concurrent_pairing_requests_redeem_only_once(self) -> None:
        """Only one concurrent request receives a private receiver secret."""
        pairing_secret = "one-time-secret"
        shares = {
            "share-id": {
                "entry_id": "entry-id",
                "pairing_secret_hash": _digest(pairing_secret),
                "receiver_secret_hash": None,
                "expires_at": "2030-01-01T00:00:00+00:00",
                "activated": False,
                "revoked": False,
                "device_ids": [],
            }
        }
        store = MagicMock()
        store.async_load = AsyncMock(return_value=shares)
        store.async_save = AsyncMock()
        entry = MagicMock(entry_id="entry-id", title="Benny Berman 7")
        entry.data = {}
        hass = MagicMock()
        hass.data = {DOMAIN: {}}
        hass.config_entries.async_get_entry.return_value = entry
        request = MagicMock(headers={"Authorization": f"Bearer {pairing_secret}"})
        credentials_requested = asyncio.Event()
        allow_credentials = asyncio.Event()

        async def get_credentials(*_args: object) -> dict[str, str]:
            credentials_requested.set()
            await allow_credentials.wait()
            return {"auth_token": "auth", "token": "token"}

        with (
            patch("custom_components.akuvox.sharing._store", return_value=store),
            patch(
                "custom_components.akuvox.sharing.async_get_credentials",
                side_effect=get_credentials,
            ),
        ):
            view = CredentialShareView(hass)
            first = asyncio.create_task(view.get(request, "share-id"))
            await credentials_requested.wait()
            second = asyncio.create_task(view.get(request, "share-id"))
            await asyncio.sleep(0)
            allow_credentials.set()
            first_response, second_response = await asyncio.gather(first, second)

        self.assertEqual(
            sorted((first_response.status, second_response.status)), [200, 403]
        )


class TestCredentialShareNamesE2E(unittest.IsolatedAsyncioTestCase):
    """Verify pairing receiver names remain unique for an account."""

    async def test_duplicate_receiver_name_is_rejected_case_insensitively(self) -> None:
        """A receiver cannot reuse an existing name with different casing or spacing."""
        store = MagicMock()
        store.async_load = AsyncMock(return_value={
            "existing": {"entry_id": "entry-id", "receiver_name": "Remote Home"}
        })
        store.async_save = AsyncMock()
        entry = MagicMock(entry_id="entry-id")

        with (
            patch("custom_components.akuvox.sharing._store", return_value=store),
            self.assertRaisesRegex(ValueError, "already uses this receiver name"),
        ):
            await async_create_share(
                MagicMock(), entry, "https://example.com", " remote home ", []
            )

        store.async_save.assert_not_awaited()

    async def test_share_persists_only_explicit_scoped_key_permissions(self) -> None:
        """A receiver gets an Add Key control only for selected shared relays."""
        store = MagicMock()
        store.async_load = AsyncMock(return_value={})
        store.async_save = AsyncMock()
        entry = MagicMock(entry_id="entry-id")

        with patch("custom_components.akuvox.sharing._store", return_value=store):
            await async_create_share(
                MagicMock(),
                entry,
                "https://example.com",
                "Remote Home",
                ["camera:Lobby", "relay:AA:0", "relay:BB:1"],
                create_key_relay_ids=["relay:AA:0", "relay:NOT-SHARED:2"],
                edit_key_relay_ids=[],
                view_key_relay_ids=["relay:AA:0", "relay:NOT-SHARED:2"],
                activity_device_names=["Lobby", "Garage"],
            )

        saved_shares = store.async_save.await_args.args[0]
        saved_share = next(iter(saved_shares.values()))
        self.assertEqual(saved_share["create_key_relay_ids"], ["relay:AA:0"])
        self.assertTrue(saved_share["allow_create_keys"])
        self.assertEqual(saved_share["edit_key_relay_ids"], [])
        self.assertFalse(saved_share["allow_edit_keys"])
        self.assertEqual(saved_share["view_key_relay_ids"], ["relay:AA:0"])
        self.assertTrue(saved_share["allow_view_keys"])
        self.assertTrue(saved_share["allow_activity"])
        self.assertEqual(saved_share["activity_device_names"], ["Lobby"])


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

    def test_remote_credential_problem_created_a_repair_and_panel_state(self) -> None:
        """A receiving instance exposes an invalid source token to both UIs."""
        hass = MagicMock()
        hass.data = {}
        entry = MagicMock(entry_id="entry-id", title="Remote home")

        with patch("custom_components.akuvox.repairs.ir.async_create_issue") as create_issue:
            repairs.async_update_credential_source_issue(
                hass, entry, "source_needs_reauth"
            )

        self.assertEqual(
            repairs.credential_source_problem(hass, "entry-id"),
            "source_needs_reauth",
        )
        self.assertEqual(
            create_issue.call_args.kwargs["translation_key"],
            "credential_source_source_needs_reauth",
        )
        hass.bus.async_fire.assert_called_once()


class TestActivityStorageRepairsE2E(unittest.TestCase):
    """Verify activity-storage warnings follow the configured threshold."""

    def setUp(self) -> None:
        """Create a minimal Home Assistant and config-entry test context."""
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
                self.assertEqual(
                    create_issue.call_args.kwargs["learn_more_url"],
                    "/akuvox-smartplus#Settings",
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
