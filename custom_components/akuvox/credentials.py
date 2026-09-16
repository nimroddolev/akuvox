"""Private persistence for SmartPlus credentials.

Home Assistant does not expose an encrypted credential vault to custom
integrations.  ``Store(private=True)`` is its supported mechanism for data
which must not be kept in the general config-entry registry.
"""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import CREDENTIAL_STORAGE_KEY, CREDENTIAL_STORAGE_VERSION

_SECRET_KEYS = ("auth_token", "token", "remote_share_secret")


def _store(hass: HomeAssistant) -> Store[dict[str, dict[str, str]]]:
    """Return the integration's private credential store."""
    return Store(
        hass,
        CREDENTIAL_STORAGE_VERSION,
        CREDENTIAL_STORAGE_KEY,
        private=True,
        atomic_writes=True,
    )


async def async_store_credentials(
    hass: HomeAssistant, entry_id: str, auth_token: str, token: str
) -> None:
    """Persist credentials outside config-entry data and options."""
    store = _store(hass)
    credentials = await store.async_load() or {}
    credentials[entry_id] = {
        **credentials.get(entry_id, {}),
        "auth_token": auth_token,
        "token": token,
    }
    await store.async_save(credentials)


async def async_store_sip_credentials(
    hass: HomeAssistant, entry_id: str, sip_credentials: dict[str, str]
) -> None:
    """Persist post-login SIP credentials without exposing them in entry data."""
    credentials = await _store(hass).async_load() or {}
    credentials[entry_id] = {**credentials.get(entry_id, {}), **sip_credentials}
    await _store(hass).async_save(credentials)


async def async_get_credentials(hass: HomeAssistant, entry_id: str) -> dict[str, str]:
    """Return credentials from private storage for an authenticated UI flow."""
    credentials = await _store(hass).async_load() or {}
    return dict(credentials.get(entry_id, {}))


async def async_get_remote_share_secret(hass: HomeAssistant, entry_id: str) -> str:
    """Return the private bearer secret used by a remote credential source."""
    return (await async_get_credentials(hass, entry_id)).get("remote_share_secret", "")


async def async_load_and_migrate_credentials(
    hass: HomeAssistant, entry: ConfigEntry
) -> dict[str, str]:
    """Load private credentials and migrate legacy config-entry values.

    The migration is intentionally idempotent: it also removes stale copies
    from both data and options after a previous partial migration.
    """
    store = _store(hass)
    stored = await store.async_load() or {}
    credentials = dict(stored.get(entry.entry_id, {}))

    for source in (entry.options, entry.data):
        for key in _SECRET_KEYS:
            value = source.get(key)
            if key not in credentials and isinstance(value, str) and value:
                credentials[key] = value

    if credentials and credentials != stored.get(entry.entry_id):
        stored[entry.entry_id] = credentials
        await store.async_save(stored)

    data = dict(entry.data)
    options = dict(entry.options)
    changed = False
    for target in (data, options):
        for key in _SECRET_KEYS:
            if key in target:
                target.pop(key)
                changed = True
    if changed:
        hass.config_entries.async_update_entry(entry, data=data, options=options)

    return credentials
