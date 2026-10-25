"""Custom integration to integrate akuvox with Home Assistant.

For more details about this integration, please refer to
https://github.com/nimroddolev/akuvox
"""
from __future__ import annotations

from copy import deepcopy

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.exceptions import ConfigEntryNotReady
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.start import async_at_started
from homeassistant.helpers.update_coordinator import UpdateFailed

from .config_flow import AkuvoxOptionsFlowHandler
from .api import AkuvoxApiClient
from .const import (
    DOMAIN,
    LOGGER,
)
from .coordinator import AkuvoxDataUpdateCoordinator
from .credentials import async_load_and_migrate_credentials
from .panel import async_refresh_panel, async_register_websocket_api
from .repairs import async_clear_authentication_failure
from .sharing import (
    async_register_remote_synchronizer,
    async_register_share_view,
    async_remove_remote_synchronizer,
    is_remote_entry,
)

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

PLATFORMS: list[Platform] = [
    Platform.CAMERA,
    Platform.BUTTON,
    Platform.EVENT,
    Platform.SENSOR
]


async def async_setup(hass: HomeAssistant, _config: dict) -> bool:
    """Set up shared Akuvox resources before any account is configured."""
    async_register_websocket_api(hass)
    async_register_share_view(hass)
    # Register the panel from persisted entry options, independently of cloud
    # connectivity. A failed account refresh must not make it disappear.
    await async_refresh_panel(hass)
    return True


# https://developers.home-assistant.io/docs/config_entries_index/#setting-up-an-entry
async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up this integration using UI."""
    credentials = await async_load_and_migrate_credentials(hass, entry)
    if not credentials.get("auth_token") or not credentials.get("token"):
        raise ConfigEntryAuthFailed("SmartPlus credentials are missing")
    hass.data.setdefault(DOMAIN, {})
    async_register_websocket_api(hass)
    hass.data[DOMAIN][entry.entry_id] = coordinator = AkuvoxDataUpdateCoordinator(
        hass=hass,
        client=AkuvoxApiClient(
            session=async_get_clientsession(hass),
            hass=hass,
            entry=entry,
            credentials=credentials,
        ),
    )
    await async_update_configuration(hass=hass, entry=entry)
    LOGGER.debug("Akuvox setup: configuration applied")
    # Home Assistant invokes an entry's update listener for a title change as
    # well as for a settings change.  Keep the settings snapshot separate so a
    # user renaming their hub does not unnecessarily restart its cloud session.
    _remember_entry_configuration(coordinator.client, entry)
    if is_remote_entry(entry):
        remote_sync = async_register_remote_synchronizer(hass, entry, coordinator.client)
        entry.async_on_unload(remote_sync.async_stop)
    refresh_task = hass.async_create_task(_async_refresh_cloud_data(hass, entry))

    @callback
    def cancel_refresh() -> None:
        """Cancel the cloud refresh without returning Task.cancel's boolean."""
        # HA treats a truthy unload callback result as a coroutine to schedule.
        refresh_task.cancel()

    entry.async_on_unload(cancel_refresh)
    # Reauthentication reloads an entry while Home Assistant is already
    # running. Deferring platform forwarding through ``async_at_started`` in
    # that case leaves the old camera, relay, and event entities unloaded
    # until the callback is scheduled, which presents them as unavailable.
    # Start the runtime directly for a live reload; only defer it during HA
    # startup, when platforms must wait for the core to be ready.
    if getattr(hass, "is_running", False):
        await _async_start_runtime(hass, entry)
    else:
        entry.async_on_unload(
            async_at_started(
                hass,
                lambda _hass: _async_start_runtime_after_start(hass, entry),
            )
        )
    entry.async_on_unload(entry.add_update_listener(async_reload_entry))
    entry.async_on_unload(coordinator.client.async_stop_proactive_token_refresh)
    return True


async def _async_refresh_cloud_data(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Begin the SmartPlus request without waiting for HA startup."""
    coordinator: AkuvoxDataUpdateCoordinator | None = hass.data.get(DOMAIN, {}).get(
        entry.entry_id
    )
    # The entry can be unloaded before this deliberately background task gets
    # its first event-loop turn.
    if coordinator is None:
        return
    # Receiver entries obtain their scoped data from the host snapshot.  A
    # direct SmartPlus refresh can replace it with the account's full device
    # list and leaves scoped entities unavailable while it races setup.
    if is_remote_entry(entry):
        return
    try:
        await coordinator.async_refresh()
    except (ConfigEntryNotReady, UpdateFailed) as error:
        LOGGER.warning("SmartPlus was unavailable after startup: %s", error)


@callback
def _async_start_runtime_after_start(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Schedule non-HTTP runtime setup after the core is ready."""
    hass.add_job(_async_start_runtime(hass, entry))


async def _async_start_runtime(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Start polling and entities after Home Assistant has initialized."""
    coordinator: AkuvoxDataUpdateCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_clear_authentication_failure(hass, entry)
    if is_remote_entry(entry):
        remote_sync = hass.data.get("akuvox_credential_sharing", {}).get(entry.entry_id)
        if remote_sync is not None:
            try:
                await remote_sync.async_sync()
            except Exception as error:  # The cached scoped snapshot remains usable.
                LOGGER.warning("Unable to fetch the initial shared Akuvox snapshot: %s", error)
            remote_sync.async_start()
    else:
        coordinator.client.async_start_proactive_token_refresh()
        await coordinator.client.async_start_polling()
        hass.async_create_task(coordinator.client.async_load_panel_history())
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)


async def async_migrate_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Migrate credentials from config-entry storage to private storage."""
    await async_load_and_migrate_credentials(hass, entry)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Handle removal of an entry."""
    client = get_api_client(hass, entry.entry_id)
    if client is not None:
        await client.async_stop_polling()
        client.async_stop_proactive_token_refresh()
    await async_remove_remote_synchronizer(hass, entry.entry_id)
    if unloaded := await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        hass.data[DOMAIN].pop(entry.entry_id)
        await async_refresh_panel(hass)
    return unloaded


async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload an entry when its functional configuration changed."""
    coordinator: AkuvoxDataUpdateCoordinator = hass.data[DOMAIN][entry.entry_id]
    if coordinator.client.consume_entry_reload_skip():
        LOGGER.debug("Skipping reload after routine SmartPlus token refresh")
        _remember_entry_configuration(coordinator.client, entry)
        return
    if not _entry_configuration_changed(coordinator.client, entry):
        LOGGER.debug("Skipping reload after SmartPlus hub title update")
        return
    await hass.config_entries.async_reload(entry.entry_id)


def _entry_configuration_snapshot(entry: ConfigEntry) -> tuple[dict, dict]:
    """Return the entry fields that require an integration restart when changed."""
    return deepcopy(dict(entry.data)), deepcopy(dict(entry.options))


def _remember_entry_configuration(client: AkuvoxApiClient, entry: ConfigEntry) -> None:
    """Record the entry's current functional configuration for its listener."""
    client._entry_configuration_snapshot = _entry_configuration_snapshot(entry)


def _entry_configuration_changed(client: AkuvoxApiClient, entry: ConfigEntry) -> bool:
    """Return whether data or options changed, excluding the presentation title."""
    snapshot = _entry_configuration_snapshot(entry)
    previous_snapshot = getattr(client, "_entry_configuration_snapshot", None)
    client._entry_configuration_snapshot = snapshot
    # Be conservative for clients created before this guard: reload once to
    # preserve the existing behavior for any genuine update.
    return previous_snapshot is None or previous_snapshot != snapshot

# Polling

async def async_stop_polling(hass: HomeAssistant, entry_id: str | None = None):
    """Stop one account's poller, or every account poller when unspecified."""
    clients = (
        [get_api_client(hass, entry_id)]
        if entry_id is not None
        else [item.client for item in hass.data.get(DOMAIN, {}).values()]
    )
    for client in clients:
        if client is not None:
            await client.async_stop_polling()

async def async_start_polling(hass: HomeAssistant, entry_id: str | None = None):
    """Start one account's activity poller, or every account poller."""
    clients = (
        [get_api_client(hass, entry_id)]
        if entry_id is not None
        else [item.client for item in hass.data.get(DOMAIN, {}).values()]
    )
    for client in clients:
        if client is not None:
            await client.async_start_polling_personal_door_log()

def get_api_client(hass: HomeAssistant, entry_id: str) -> AkuvoxApiClient | None:
    """Return the API client belonging to exactly one configuration entry."""
    coordinator = hass.data.get(DOMAIN, {}).get(entry_id)
    return getattr(coordinator, "client", None)

# Integration options

async def async_options(self, entry: ConfigEntry):
    """Present current configuration options for modification."""
    # Create an options flow handler and return it
    return AkuvoxOptionsFlowHandler()

async def async_options_updated(self, entry: ConfigEntry):
    """Handle updated configuration options and update the entry."""
    # Handle the updated configuration options
    updated_options = entry.options

    # Print the updated options
    LOGGER.debug("Updated Options: %s", str(updated_options))

# Update

async def async_update_configuration(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Update stored values from configuration."""
    try:
        if entry.options:
            updated_options: dict = entry.options.copy()

            # Update API & data classes
            coordinator: AkuvoxDataUpdateCoordinator = hass.data[DOMAIN][entry.entry_id]
            client: AkuvoxApiClient = coordinator.client

            LOGGER.debug("Configured values:")
            for key, value in updated_options.items():
                #                           value=value)
                if value:
                    client.update_data(key, value)
                    str_value: str = str(value)
                    if key in ["auth_token", "token"]:
                        length: int = len(str_value)
                        str_value = f"{str_value[0:3]}{'*'*int(length-6)}{str_value[int(length-3):length]}" # type: ignore
                    LOGGER.debug(" - %s = %s", key, str_value)
    except Exception as error:
        LOGGER.warning("Unable to update configuration: %s", str(error))
