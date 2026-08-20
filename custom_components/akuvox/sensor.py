"""Sensor platform for akuvox."""
from datetime import datetime
from typing import Any

from homeassistant.components.sensor import SensorEntity
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
    """Set up the temporary door key platform."""
    coordinator: AkuvoxDataUpdateCoordinator = hass.data[DOMAIN][entry.entry_id]
    client = coordinator.client
    store = storage.Store(hass, 1, account_storage_key(entry.entry_id, "cache"))
    try:
        device_data: Any = await store.async_load()
    except (OSError, ValueError) as error:
        LOGGER.warning("Unable to load saved temporary door key data: %s", error)
        return
    if not isinstance(device_data, dict):
        LOGGER.warning("Saved temporary door key data was missing or invalid")
        return
    door_keys_data = device_data.get("door_keys_data")
    if not isinstance(door_keys_data, list):
        LOGGER.warning("Saved temporary door key list was missing or invalid")
        return
    entities: list[AkuvoxTemporaryDoorKey] = []
    for door_key_data in door_keys_data:
        if not isinstance(door_key_data, dict):
            LOGGER.warning("Skipping malformed temporary door key")
            continue
        try:
            key_id = door_key_data["key_id"]
            description = door_key_data["description"]
            key_code = door_key_data["key_code"]
            begin_time = _parse_temp_key_time(door_key_data["begin_time"])
            end_time = _parse_temp_key_time(door_key_data["end_time"])
            allowed_times = door_key_data["allowed_times"]
            access_times = door_key_data["access_times"]
            qr_code_url = door_key_data["qr_code_url"]
        except (KeyError, TypeError, ValueError) as error:
            LOGGER.warning("Skipping malformed temporary door key: %s", error)
            continue

        entities.append(
            AkuvoxTemporaryDoorKey(
                client=client,
                entry=entry,
                key_id=key_id,
                description=description,
                key_code=key_code,
                begin_time=begin_time,
                end_time=end_time,
                allowed_times=allowed_times,
                access_times=access_times,
                qr_code_url=qr_code_url,
            )
        )

    async_add_entities(entities)


def _parse_temp_key_time(value: object) -> datetime:
    """Parse both legacy SmartPlus and normalised temporary-key timestamps."""
    text = str(value).strip()
    for format_string in ("%Y-%m-%d %H:%M:%S", "%d-%m-%Y %H:%M:%S"):
        try:
            return datetime.strptime(text, format_string)
        except ValueError:
            continue
    raise ValueError(f"Unsupported temporary-key timestamp: {text!r}")

class AkuvoxTemporaryDoorKey(SensorEntity, AkuvoxEntity):
    """Akuvox temporary door key class."""

    def __init__(
        self,
        client: AkuvoxApiClient,
        entry: ConfigEntry,
        key_id: str,
        description: str,
        key_code: str,
        begin_time: datetime,
        end_time: datetime,
        allowed_times: int,
        access_times: int,
        qr_code_url: str,
    ) -> None:
        """Initialize the Akuvox door relay class."""
        super(SensorEntity, self).__init__(client=client, entry=entry)
        AkuvoxEntity.__init__(
            self=self,
            client=client,
            entry=entry
        )
        self.client = client
        self.key_id = key_id
        self.description = description
        self.key_code = key_code
        self.begin_time = begin_time
        self.end_time = end_time
        self.allowed_times = allowed_times
        self.access_times = access_times
        self.qr_code_url = qr_code_url
        self.expired = False

        name = f"{self.description} {self.key_id}".strip()
        self._attr_unique_id = f"{entry.entry_id}_{name}"
        self._attr_name = name
        self._attr_key_code = key_code

        self._attr_extra_state_attributes = self.to_dict()

        LOGGER.debug("Adding temporary door key '%s'", self._attr_unique_id)
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, f"{entry.entry_id}:Temporary Keys")},  # type: ignore
            name="Temporary Keys",
            model=VERSION,
            manufacturer=NAME,
        )

    def is_key_active(self):
        """Check if the key is currently active based on the begin_time and end_time."""
        current_time = datetime.now()
        return self.begin_time <= current_time <= self.end_time

    def to_dict(self):
        """Convert the object to a dictionary for easy serialization."""
        return {
            'key_id': self.key_id,
            'description': self.description,
            'key_code': self.key_code,
            'enabled': self.is_key_active(),
            'begin_time': self.begin_time,
            'end_time': self.end_time,
            'access_times': self.access_times,
            'allowed_times': self.allowed_times,
            'qr_code_url': self.qr_code_url,
            'expired': not self.is_key_active()
        }
