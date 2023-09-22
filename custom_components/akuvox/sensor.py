"""Sensor platform for akuvox."""
from homeassistant.components.sensor import SensorEntity
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.aiohttp_client import async_get_clientsession
import datetime

from .api import AkuvoxApiClient
from .const import (
    DOMAIN,
    LOGGER,
    NAME,
    VERSION
)

async def async_setup_entry(hass, entry, async_add_devices):
    """Set up the temporary door key platform."""
    LOGGER.debug("In sensor.py async_setup_entry()")
    entry.data.get("host", "")
    override = entry.options.get("override", False)
    get_saved_value(entry, override, "token")

    client = AkuvoxApiClient(
        session=async_get_clientsession(hass),
        hass=hass,
        data=entry.data
    )
    await client.async_init_api_data()
    await client.async_retrieve_temp_keys_data()
    device_data = client.get_devices_json()
    door_key_data = device_data["door_keys_data"]

    LOGGER.debug("door_key_data = %s", str(door_key_data))

    entities = []
    for door_key in door_key_data:
        key_id = door_key["key_id"]
        description = door_key["description"]
        key_code=door_key["key_code"]
        begin_time=door_key["begin_time"]
        end_time=door_key["end_time"]
        allowed_times=door_key["allowed_times"]
        qr_code_url=door_key["qr_code_url"]

        entities.append(
            AkuvoxTemporaryDoorKey(
                client=client,
                key_id=key_id,
                description=description,
                key_code=key_code,
                begin_time=begin_time,
                end_time=end_time,
                allowed_times=allowed_times,
                qr_code_url=qr_code_url,
            )
        )

    async_add_devices(entities)

class AkuvoxTemporaryDoorKey(SensorEntity):
    """Akuvox temporary door key class."""

    def __init__(
        self,
        client: AkuvoxApiClient,
        key_id: str,
        description: str,
        key_code: str,
        begin_time: str,
        end_time: str,
        allowed_times: int,
        qr_code_url) -> None:
        """Initialize the Akuvox door relay class."""
        super().__init__()
        self.client = client
        self.key_id = key_id
        self.description = description
        self.key_code = key_code
        self.begin_time = begin_time
        self.end_time = end_time
        self.allowed_times = allowed_times
        self.qr_code_url = qr_code_url
        self.access_times = 0
        self.expired = False

        name = f"{self.description} {self.key_id}"
        self._attr_unique_id = name
        self._attr_name = name
        self._attr_key_code = key_code
        self._attr_extra_state_attributes = {
            "key_id": key_id,
            "description": description,
            "key_code": key_code,
            "begin_time": begin_time,
            "end_time": end_time,
            "allowed_times": allowed_times,
            "qr_code_url": qr_code_url,
            "access_times": 0,
            "expired": False,
        }

        LOGGER.debug("Adding temporary door key '%s'", self._attr_unique_id)
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, "Temporary Keys")},  # type: ignore
            name="Temporary Keys",
            model=VERSION,
            manufacturer=NAME,
        )

    # def press(self) -> None:
    #     """Trigger the door relay."""
    #     self._client.make_opendoor_request(
    #         name=self._name,
    #         host=self._host,
    #         token=self._token,
    #         data=self._data
    #     )

def get_saved_value(entry, override, key: str):
    """Get the value for a given key. Options flow 1st, Config flow 2nd."""
    return entry.options.get(key, entry.data[key]) if override is True else entry.data[key]




class TemporaryDoorKey:
    """Akuvox temporary door key class."""

    def __init__(self,
                 key_id,
                 description,
                 key_code,
                 begin_time,
                 end_time,
                 allowed_times,
                 qr_code_url):
        """Initialize the Akuvox dor key class."""
        self.key_id = key_id
        self.description = description
        self.key_code = key_code
        self.begin_time = begin_time
        self.end_time = end_time
        self.allowed_times = allowed_times
        self.qr_code_url = qr_code_url
        self.access_times = 0
        self.expired = False

    def is_key_active(self):
        """Check if the key is currently active based on the begin_time and end_time."""
        current_time = datetime.datetime.now()
        return self.begin_time <= current_time <= self.end_time

    def to_dict(self):
        """Convert the object to a dictionary for easy serialization."""
        return {
            'key_id': self.key_id,
            'description': self.description,
            'key_code': self.key_code,
            'begin_time': self.begin_time.strftime('%Y-%m-%d %H:%M:%S'),
            'end_time': self.end_time.strftime('%Y-%m-%d %H:%M:%S'),
            'access_times': self.access_times,
            'allowed_times': self.allowed_times,
            'qr_code_url': self.qr_code_url,
            'expired': self.expired
        }
