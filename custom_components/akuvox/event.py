"""Event entities for Akuvox door-open detection."""
from __future__ import annotations

from collections.abc import Callable
from typing import Any

from homeassistant.components.event import EventEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import storage
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .api import AkuvoxApiClient
from .const import DOMAIN, LOGGER, NAME, VERSION, account_storage_key
from .coordinator import AkuvoxDataUpdateCoordinator

EVENT_TYPE_DOOR_UNLOCKED = "door_unlocked"


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up one door-open event entity for each configured door."""
    LOGGER.debug("Setting up Akuvox door-open event entities")
    coordinator: AkuvoxDataUpdateCoordinator = hass.data[DOMAIN][entry.entry_id]
    data = await storage.Store(
        hass, 1, account_storage_key(entry.entry_id, "cache")
    ).async_load()
    if not isinstance(data, dict):
        data = dict(entry.data)

    door_names = {
        str(item.get("name", "")).strip()
        for collection in (data.get("camera_data", []), data.get("door_relay_data", []))
        if isinstance(collection, list)
        for item in collection
        if isinstance(item, dict) and item.get("name")
    }
    async_add_entities(
        AkuvoxDoorUnlockEvent(coordinator.client, entry, name)
        for name in sorted(door_names)
    )
    LOGGER.debug("Added %s Akuvox door-open event entities", len(door_names))


class AkuvoxDoorUnlockEvent(EventEntity):
    """Expose a detected door opening as a selectable automation trigger."""

    _attr_has_entity_name = True
    # Keep the stable entity ID and event type below so existing automations
    # continue to work, while presenting the user-facing event as Door opened.
    _attr_name = "Door opened"
    _attr_event_types = [EVENT_TYPE_DOOR_UNLOCKED]

    def __init__(self, client: AkuvoxApiClient, entry: ConfigEntry, door_name: str) -> None:
        """Initialize the event entity for one door."""
        self._client = client
        self._door_name = door_name
        self._unsub: Callable[[], None] | None = None
        self._attr_unique_id = f"{entry.entry_id}_{door_name}_door_unlocked"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, door_name)},
            name=door_name,
            model=VERSION,
            manufacturer=NAME,
        )

    async def async_added_to_hass(self) -> None:
        """Listen for door-open events after the entity is registered."""
        await super().async_added_to_hass()
        self._unsub = self._client.async_subscribe_to_door_unlocks(
            self._door_name, self._handle_unlock
        )

    async def async_will_remove_from_hass(self) -> None:
        """Remove the client callback when the entity unloads."""
        if self._unsub is not None:
            self._unsub()
            self._unsub = None
        await super().async_will_remove_from_hass()

    @callback
    def _handle_unlock(self, event_data: dict[str, Any]) -> None:
        """Publish the detected door opening through Home Assistant's event entity."""
        self._trigger_event(EVENT_TYPE_DOOR_UNLOCKED, event_data)
        self.async_write_ha_state()
