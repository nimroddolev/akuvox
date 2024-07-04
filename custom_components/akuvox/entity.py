"""Sensor platform for akuvox."""
# from homeassistant.components.entity import Entity
from homeassistant.helpers.entity import Entity
from .api import AkuvoxApiClient

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
        country_code = self.get_saved_value("country_code") if len(self.get_saved_value("country_code")) > 0 else None
        self.client.init_api_with_data(
            hass=self.hass,
            host=host,
            subdomain=None,
            auth_token=auth_token,
            token=token,
            phone_number=phone_number,
            country_code=country_code)

    def get_saved_value(self, key: str) -> str:
        """Get the value for a given key. Options flow 1st, Config flow 2nd."""
        should_override = self.entry.options.get("override", False) # type: ignore
        default = ""
        if key in self.entry.data: # type: ignore
            default = self.entry.data[key] # type: ignore
        if should_override is True:
            return self.entry.options.get(key, default) # type: ignore
        return default
