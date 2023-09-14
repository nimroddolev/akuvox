"""DataUpdateCoordinator for akuvox."""
from __future__ import annotations


from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import (
    DataUpdateCoordinator,
    UpdateFailed,
)
from homeassistant.exceptions import ConfigEntryAuthFailed

from .api import (
    AkuvoxApiClient,
    AkuvoxApiClientAuthenticationError,
    AkuvoxApiClientError,
)
from .const import DOMAIN, LOGGER


# https://developers.home-assistant.io/docs/integration_fetching_data#coordinated-single-api-poll-for-data-for-all-entities
class AkuvoxDataUpdateCoordinator(DataUpdateCoordinator):
    """Class to manage fetching data from the API."""

    config_entry: ConfigEntry

    def __init__(
        self,
        hass: HomeAssistant,
        client: AkuvoxApiClient,
    ) -> None:
        """Initialize."""
        self.client = client
        super().__init__(
            hass=hass,
            logger=LOGGER,
            name=DOMAIN,
            update_interval=None,
        )

    async def _async_update_data(self):
        """Update data via library."""
        try:
            return await self.client.async_init_api_data()
        except AkuvoxApiClientAuthenticationError as exception:
            raise ConfigEntryAuthFailed(exception) from exception
        except AkuvoxApiClientError as exception:
            raise UpdateFailed(exception) from exception
