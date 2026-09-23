"""Button platform for akuvox."""
from typing import Any

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import storage
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .api import AkuvoxApiClient
from .coordinator import AkuvoxDataUpdateCoordinator
from .const import (
    DOMAIN,
    LOGGER,
    NAME,
    VERSION,
    account_storage_key,
)
from .entity import AkuvoxEntity

async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up the door relay platform."""
    coordinator: AkuvoxDataUpdateCoordinator = hass.data[DOMAIN][entry.entry_id]
    client = coordinator.client

    store = storage.Store(hass, 1, account_storage_key(entry.entry_id, "cache"))
    try:
        device_data: Any = await store.async_load()
    except (OSError, ValueError) as error:
        LOGGER.warning("Unable to load saved door relay data: %s", error)
        return
    if not isinstance(device_data, dict):
        device_data = dict(entry.data)
    door_relay_data = device_data.get("door_relay_data")
    if not isinstance(door_relay_data, list):
        LOGGER.warning("Saved door relay list was missing or invalid")
        return

    entities: list[AkuvoxDoorRelayEntity] = []
    for door_relay in door_relay_data:
        if not isinstance(door_relay, dict):
            LOGGER.warning("Skipping malformed saved door relay")
            continue
        try:
            name = str(door_relay["name"])
            mac = str(door_relay["mac"])
            relay_id = str(door_relay["relay_id"])
        except (KeyError, TypeError, ValueError) as error:
            LOGGER.warning("Skipping malformed saved door relay: %s", error)
            continue
        data = f"mac={mac}&relay={relay_id}"

        entities.append(
            AkuvoxDoorRelayEntity(
                client=client,
                entry=entry,
                name=name,
                relay_id=relay_id,
                data=data,
            )
        )

    async_add_entities(entities)


class AkuvoxDoorRelayEntity(ButtonEntity, AkuvoxEntity):
    """Akuvox door relay class."""

    def __init__(
        self,
        client: AkuvoxApiClient,
        entry: ConfigEntry,
        name: str,
        relay_id: str,
        data: str,
    ) -> None:
        """Initialize the Akuvox door relay class."""
        super(ButtonEntity, self).__init__(client=client, entry=entry)
        AkuvoxEntity.__init__(
            self=self,
            client=client,
            entry=entry
        )
        device_identity = f"{entry.entry_id}:{name}"
        relay_name = name + ", " + relay_id
        self._client = client
        self._name = relay_name
        client_data = getattr(client, "_data", None)
        self._host = client_data.host if client_data else self.get_saved_value("host")
        self._token = client_data.token if client_data else self.get_saved_value("token")
        self._data = data

        self._attr_unique_id = f"{entry.entry_id}:{relay_name}"
        self._attr_name = relay_name

        LOGGER.debug("Adding Akuvox door relay '%s'", relay_name)
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, device_identity)},
            name=name,
            model=VERSION,
            manufacturer=NAME,
        )

    async def async_press(self) -> None:
        """Trigger the door relay without blocking Home Assistant's event loop."""
        await self._client.async_make_opendoor_request(
            name=self._name,
            host=self._host,
            token=self._token,
            data=self._data,
        )
