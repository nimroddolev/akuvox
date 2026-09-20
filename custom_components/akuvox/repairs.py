"""Authentication repair reporting for the Akuvox integration."""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir

from .const import DOMAIN, PANEL_DATA_UPDATED_EVENT, PANEL_RUNTIME_DOMAIN

_AUTH_FAILURES = "authentication_failures"
_ACTIVITY_STORAGE_ISSUE_PREFIX = "activity_storage_limit_"
_ACTIVITY_STORAGE_SETTINGS_URL = "/akuvox-smartplus#Settings"
_CREDENTIAL_SOURCE_ISSUE_PREFIX = "credential_source_"
_CREDENTIAL_SOURCE_PROBLEMS = "credential_source_problems"


def async_update_activity_storage_warning(
    hass: HomeAssistant,
    entry: ConfigEntry,
    usage_bytes: int,
    limit_bytes: int,
) -> None:
    """Create, escalate, or clear the local activity-storage repair."""
    issue_id = f"{_ACTIVITY_STORAGE_ISSUE_PREFIX}{entry.entry_id}"
    if limit_bytes <= 0 or usage_bytes < limit_bytes * 0.9:
        ir.async_delete_issue(hass, DOMAIN, issue_id)
        return

    percentage = (usage_bytes / limit_bytes) * 100
    if percentage >= 100:
        level = "full"
        severity = ir.IssueSeverity.WARNING
    elif percentage >= 99:
        level = "99"
        severity = ir.IssueSeverity.WARNING
    elif percentage >= 95:
        level = "95"
        severity = ir.IssueSeverity.WARNING
    else:
        level = "90"
        severity = ir.IssueSeverity.WARNING

    ir.async_create_issue(
        hass,
        DOMAIN,
        issue_id,
        is_fixable=False,
        severity=severity,
        translation_key=f"activity_storage_{level}",
        translation_placeholders={"entry_title": entry.title},
        learn_more_url=_ACTIVITY_STORAGE_SETTINGS_URL,
    )


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


def async_update_credential_source_issue(
    hass: HomeAssistant, entry: ConfigEntry, problem: str | None
) -> None:
    """Expose source connectivity/revocation without asking a receiver for SMS."""
    issue_id = f"{_CREDENTIAL_SOURCE_ISSUE_PREFIX}{entry.entry_id}"
    problems = hass.data.setdefault(PANEL_RUNTIME_DOMAIN, {}).setdefault(
        _CREDENTIAL_SOURCE_PROBLEMS, {}
    )
    if problem is None:
        problems.pop(entry.entry_id, None)
        ir.async_delete_issue(hass, DOMAIN, issue_id)
    else:
        problems[entry.entry_id] = problem
        ir.async_create_issue(
            hass, DOMAIN, issue_id, is_fixable=False, severity=ir.IssueSeverity.WARNING,
            translation_key=f"credential_source_{problem}",
            translation_placeholders={"entry_title": entry.title},
        )
    # The custom panel subscribes to this event, so a failed background poll is
    # explained immediately instead of only appearing in Home Assistant Repairs.
    hass.bus.async_fire(PANEL_DATA_UPDATED_EVENT, {"entry_id": entry.entry_id})


def credential_source_problem(hass: HomeAssistant, entry_id: str) -> str | None:
    """Return the current remote credential-source problem for the panel."""
    return hass.data.get(PANEL_RUNTIME_DOMAIN, {}).get(
        _CREDENTIAL_SOURCE_PROBLEMS, {}
    ).get(entry_id)
