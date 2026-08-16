"""Authentication repair reporting for the Akuvox integration."""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir

from .const import DOMAIN, PANEL_RUNTIME_DOMAIN

_AUTH_FAILURES = "authentication_failures"


def async_report_authentication_failure(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Expose a lost SmartPlus session to the panel.

    Home Assistant creates the canonical reauthentication repair when the
    integration raises ``ConfigEntryAuthFailed``. Creating another issue here
    duplicates that repair, so this function only retains the panel state.
    """
    hass.data.setdefault(PANEL_RUNTIME_DOMAIN, {}).setdefault(_AUTH_FAILURES, set()).add(
        entry.entry_id
    )
    # Remove a duplicate issue left by versions that created a custom repair.
    ir.async_delete_issue(hass, DOMAIN, f"reauthentication_required_{entry.entry_id}")


def async_clear_authentication_failure(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Clear the panel state and repair once a session is valid again."""
    runtime = hass.data.setdefault(PANEL_RUNTIME_DOMAIN, {})
    runtime.setdefault(_AUTH_FAILURES, set()).discard(entry.entry_id)
    ir.async_delete_issue(hass, DOMAIN, f"reauthentication_required_{entry.entry_id}")


def authentication_failed(hass: HomeAssistant, entry_id: str) -> bool:
    """Return whether the entry needs SmartPlus reauthentication."""
    return entry_id in hass.data.get(PANEL_RUNTIME_DOMAIN, {}).get(_AUTH_FAILURES, set())
