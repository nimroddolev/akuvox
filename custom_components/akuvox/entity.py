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
        super().__init__()
        self.entry = entry
        self.client = client

        host = self.get_saved_value("host")
        auth_token = self.get_saved_value("auth_token")
        token = self.get_saved_value("token")
        phone_number = self.get_saved_value("phone_number")
        self.client.init_api_with_tokens(host, auth_token, token, phone_number)

    def get_saved_value(self, key: str):
        """Get the value for a given key. Options flow 1st, Config flow 2nd."""
        should_override = self.entry.options.get("override", False)
        if should_override is True:
            return self.entry.options.get(key, self.entry.data[key])
        return self.entry.data[key]
