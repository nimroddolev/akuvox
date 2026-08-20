"""Custom integration to integrate akuvox with Home Assistant.

For more details about this integration, please refer to
https://github.com/nimroddolev/akuvox
"""
from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import UpdateFailed

from .config_flow import AkuvoxOptionsFlowHandler
from .api import AkuvoxApiClient
from .const import (
    DOMAIN,
    DEBUG_LOGGING,
    LOGGER
)
from .coordinator import AkuvoxDataUpdateCoordinator
from .credentials import async_load_and_migrate_credentials
from .panel import async_refresh_panel, async_register_websocket_api
from .repairs import async_clear_authentication_failure

PLATFORMS: list[Platform] = [
    Platform.CAMERA,
    Platform.BUTTON,
    Platform.SENSOR
]


async def async_setup(hass: HomeAssistant, _config: dict) -> bool:
    """Set up shared Akuvox resources before any account is configured."""
    async_register_websocket_api(hass)
    # Register the panel from persisted entry options, independently of cloud
    # connectivity. A failed account refresh must not make it disappear.
    await async_refresh_panel(hass)
    return True


# https://developers.home-assistant.io/docs/config_entries_index/#setting-up-an-entry
async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up this integration using UI."""
    credentials = await async_load_and_migrate_credentials(hass, entry)
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
    _configure_debug_logging(hass)
    # Keep the sidebar available even while the cloud service is temporarily
    # unavailable. The panel can then show its cached/reauthentication state.
    await async_refresh_panel(hass)

    # https://developers.home-assistant.io/docs/integration_fetching_data#coordinated-single-api-poll-for-data-for-all-entities
    try:
        await coordinator.async_config_entry_first_refresh()
    except (ConfigEntryNotReady, UpdateFailed) as error:
        # SmartPlus's cloud endpoints are occasionally slow or unavailable.
        # Do not hold up Home Assistant startup (and therefore the sidebar
        # panel) for a transient transport failure. Authentication failures
        # remain ConfigEntryAuthFailed and are still handled by HA's reauth
        # flow. The coordinator will recover on its next requested refresh.
        LOGGER.warning(
            "SmartPlus was unavailable during startup; continuing with cached "
            "integration state: %s",
            error,
        )
    async_clear_authentication_failure(hass, entry)
    coordinator.client.async_start_proactive_token_refresh()

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(async_reload_entry))
    entry.async_on_unload(coordinator.client.async_stop_proactive_token_refresh)

    return True


def _configure_debug_logging(hass: HomeAssistant) -> None:
    """Apply the persisted diagnostic level across Akuvox accounts."""
    enabled = any(
        bool(item.options.get(DEBUG_LOGGING, False))
        for item in hass.config_entries.async_entries(DOMAIN)
    )
    LOGGER.setLevel(logging.DEBUG if enabled else logging.INFO)


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
    if unloaded := await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        hass.data[DOMAIN].pop(entry.entry_id)
        await async_refresh_panel(hass)
    return unloaded


async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload config entry."""
    coordinator: AkuvoxDataUpdateCoordinator = hass.data[DOMAIN][entry.entry_id]
    if coordinator.client.consume_entry_reload_skip():
        LOGGER.debug("Skipping reload after routine SmartPlus token refresh")
        return
    await hass.config_entries.async_reload(entry.entry_id)

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

            # Wait for image URL?
            updated_options["wait_for_image_url"] = bool(updated_options.get("event_screenshot_options", "") == "wait")

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
