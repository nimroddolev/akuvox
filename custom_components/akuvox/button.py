"""Button platform for akuvox."""
from homeassistant.components.button import ButtonEntity
from homeassistant.helpers import storage
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import AkuvoxApiClient
from .const import (
    DOMAIN,
    LOGGER,
    NAME,
    VERSION,
    DATA_STORAGE_KEY
)
from .entity import AkuvoxEntity

async def async_setup_entry(hass, entry, async_add_devices):
    """Set up the door relay platform."""
    client = AkuvoxApiClient(
        session=async_get_clientsession(hass),
        hass=hass,
        entry=entry
    )
    store = storage.Store(hass, 1, DATA_STORAGE_KEY)
    device_data: dict = await store.async_load() # type: ignore
    door_relay_data = device_data["door_relay_data"]

    entities = []
    for door_relay in door_relay_data:
        name = door_relay["name"]
        mac = door_relay["mac"]
        relay_id = door_relay["relay_id"]
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

    async_add_devices(entities)


class AkuvoxDoorRelayEntity(ButtonEntity, AkuvoxEntity):
    """Akuvox door relay class."""

    def __init__(
        self,
        client: AkuvoxApiClient,
        entry,
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
        unique_name = name + ", " + relay_id
        self._client = client
        self._name = unique_name
        self._host = self.get_saved_value("host")
        self._token = self.get_saved_value("token")
        self._data = data

        self._attr_unique_id = unique_name
        self._attr_name = unique_name

        LOGGER.debug("Adding Akuvox door relay '%s'", unique_name)
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, name)},  # type: ignore
            name=name,
            model=VERSION,
            manufacturer=NAME,
        )

    def press(self) -> None:
        """Trigger the door relay."""
        self._client.make_opendoor_request(
            name=self._name,
            host=self._host,
            token=self._token,
            data=self._data
        )

