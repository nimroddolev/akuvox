"""DataUpdateCoordinator for akuvox."""
from __future__ import annotations


from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import storage
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
from .const import(
    DOMAIN,
    LOGGER,
    account_storage_key,
)
from .repairs import async_report_authentication_failure
from .sharing import is_remote_entry


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
        entry = getattr(self.client, "config_entry", None)
        if (
            entry is not None
            and is_remote_entry(entry)
        ):
            # Remote entries are populated exclusively by their source's
            # scoped snapshot. A generic coordinator refresh must never pull
            # the receiver's broader SmartPlus account data over the top.
            return
        try:
            if await self.client.async_retrieve_user_data():
                data: dict = self.client.get_devices_json()
                if data is not None and entry is not None:
                    LOGGER.debug("Saving user's data to local storage")
                    store = storage.Store(
                        self.hass, 1, account_storage_key(entry.entry_id, "cache")
                    )
                    await store.async_save(data)

        except AkuvoxApiClientAuthenticationError as exception:
            if entry := getattr(self.client, "config_entry", None):
                async_report_authentication_failure(self.hass, entry)
            raise ConfigEntryAuthFailed(exception) from exception
        except AkuvoxApiClientError as exception:
            raise UpdateFailed(exception) from exception
