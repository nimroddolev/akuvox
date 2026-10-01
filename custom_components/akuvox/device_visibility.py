"""Apply Home Assistant device visibility to SmartPlus panel data."""
from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr

from .const import DOMAIN


def _is_disabled(hass: HomeAssistant, entry: ConfigEntry, source_name: str) -> bool:
    """Return whether the Home Assistant device backing a SmartPlus item is disabled."""
    device_registry = dr.async_get(hass)
    identifier = (DOMAIN, f"{entry.entry_id}:{source_name}")
    scoped_lookup = getattr(device_registry, "async_get_device_by_identifier", None)
    device = (
        scoped_lookup(identifier, entry.entry_id)
        if scoped_lookup is not None
        else device_registry.async_get_device(identifiers={identifier})
    )
    # Existing installations used an unscoped identifier before config-entry
    # scoped device identifiers were introduced.
    if device is None:
        legacy_identifier = (DOMAIN, source_name)
        device = (
            scoped_lookup(legacy_identifier, entry.entry_id)
            if scoped_lookup is not None
            else device_registry.async_get_device(identifiers={legacy_identifier})
        )
        if device is not None and entry.entry_id not in device.config_entries:
            device = None
    return device is not None and getattr(device, "disabled_by", None) is not None


def filter_disabled_panel_devices(
    hass: HomeAssistant, entry: ConfigEntry, panel_data: dict[str, Any]
) -> dict[str, Any]:
    """Hide disabled HA devices and all panel records tied exclusively to them."""
    cameras = list(panel_data.get("cameras", []))
    relays = list(panel_data.get("relays", []))
    source_names = {
        str(item.get("source_name") or item.get("name", ""))
        for item in [*cameras, *relays]
        if isinstance(item, dict)
    }
    disabled_names = {
        name for name in source_names if name and _is_disabled(hass, entry, name)
    }
    visible_cameras = [
        item for item in cameras
        if isinstance(item, dict)
        and str(item.get("source_name") or item.get("name", "")) not in disabled_names
    ]
    visible_relays = [
        item for item in relays
        if isinstance(item, dict)
        and str(item.get("source_name") or item.get("name", "")) not in disabled_names
    ]
    visible_relay_ids = {
        (str(item.get("mac", "")), str(item.get("relay_id", "")))
        for item in visible_relays
    }
    result = dict(panel_data)
    result["cameras"] = visible_cameras
    result["relays"] = visible_relays
    result["temporary_keys"] = [
        item for item in panel_data.get("temporary_keys", [])
        if isinstance(item, dict)
        and item.get("doors")
        and all(
            isinstance(door, dict)
            and (str(door.get("mac", "")), str(door.get("relay", ""))) in visible_relay_ids
            for door in item["doors"]
        )
    ]
    result["activity"] = [
        item for item in panel_data.get("activity", [])
        if isinstance(item, dict)
        and str(item.get("Location") or item.get("deviceName") or item.get("door_name") or "")
        not in disabled_names
    ]
    result["calls"] = [
        item for item in panel_data.get("calls", [])
        if isinstance(item, dict)
        and str(item.get("calleeName") or item.get("deviceName") or "") not in disabled_names
    ]
    return result


def filter_disabled_device_data(
    hass: HomeAssistant, entry: ConfigEntry, device_data: dict[str, Any]
) -> dict[str, Any]:
    """Apply the same visibility rule to the data carried in a share snapshot."""
    panel_data = {
        "cameras": [
            {**item, "source_name": item.get("name", "")}
            for item in device_data.get("camera_data", []) if isinstance(item, dict)
        ],
        "relays": [
            {**item, "source_name": item.get("name", "")}
            for item in device_data.get("door_relay_data", []) if isinstance(item, dict)
        ],
        "temporary_keys": device_data.get("door_keys_data", []),
    }
    visible = filter_disabled_panel_devices(hass, entry, panel_data)
    return {
        **device_data,
        "camera_data": [
            {key: value for key, value in item.items() if key != "source_name"}
            for item in visible["cameras"]
        ],
        "door_relay_data": [
            {key: value for key, value in item.items() if key != "source_name"}
            for item in visible["relays"]
        ],
        "door_keys_data": visible["temporary_keys"],
    }
