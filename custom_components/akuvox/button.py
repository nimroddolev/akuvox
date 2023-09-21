"""Button platform for akuvox."""
from homeassistant.components.button import ButtonEntity
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import AkuvoxApiClient
from .const import (
    DOMAIN,
    LOGGER,
    NAME,
    VERSION
)

async def async_setup_entry(hass, entry, async_add_devices):
    """Set up the door relay platform."""
    host = entry.data.get("host", "")
    override = entry.options.get("override", False)
    token = get_saved_value(entry, override, "token")
    door_relay_data = get_saved_value(entry, override, "door_relay_data")
    client = AkuvoxApiClient(
        session=async_get_clientsession(hass),
        hass=hass,
        data=entry.data
    )

    entities = []
    for door_relay in door_relay_data:
        name = door_relay["name"]
        mac = door_relay["mac"]
        relay_id = door_relay["relay_id"]
        data = f"mac={mac}&relay={relay_id}"

        entities.append(
            AkuvoxDoorRelayEntity(
                client=client,
                host=host,
                token=token,
                name=name,
                data=data,
            )
        )

    async_add_devices(entities)


class AkuvoxDoorRelayEntity(ButtonEntity):
    """Akuvox door relay class."""

    def __init__(
        self,
        client: AkuvoxApiClient,
        host: str,
        token: str,
        name: str,
        data: str,
    ) -> None:
        """Initialize the Akuvox door relay class."""
        super().__init__()

        self._client = client
        self._name = name
        self._host = host
        self._token = token
        self._data = data

        self._attr_unique_id = name
        self._attr_name = name

        LOGGER.debug("Adding Akuvox door relay '%s'", self._attr_unique_id)
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

def get_saved_value(entry, override, key: str):
    """Get the value for a given key. Options flow 1st, Config flow 2nd."""
    return entry.options.get(key, entry.data[key]) if override is True else entry.data[key]
