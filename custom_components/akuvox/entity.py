"""Sensor platform for akuvox."""
# from homeassistant.components.entity import Entity
from homeassistant.helpers.entity import Entity
from .api import AkuvoxApiClient
from .const import LOGGER

class AkuvoxEntity(Entity):
    """Akuvox temporary door key class."""

    entry=None
    client: AkuvoxApiClient

    def __init__(
        self,
        client: AkuvoxApiClient,
        entry
        ) -> None:
        """Initialize the Akuvox door relay class."""
        LOGGER.debug("In AkuvoxEntity init")
        super().__init__()
        self.entry = entry
        self.client = client

        host = self.get_saved_value("host")
        auth_token = self.get_saved_value("auth_token")
        token = self.get_saved_value("token")
        self.client.init_api_with_tokens(host, auth_token, token)

        # LOGGER.debug("Adding temporary door key '%s'", self._attr_unique_id)
        # self._attr_device_info = DeviceInfo(
        #     identifiers={(DOMAIN, "Temporary Keys")},  # type: ignore
        #     name="Temporary Keys",
        #     model=VERSION,
        #     manufacturer=NAME,
        # )

    def get_saved_value(self, key: str):
        """Get the value for a given key. Options flow 1st, Config flow 2nd."""
        override = self.entry.options.get("override", False)
        return self.entry.options.get(key, self.entry.data[key]) if override is True else self.entry.data[key]
