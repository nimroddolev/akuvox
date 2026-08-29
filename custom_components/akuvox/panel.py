"""SmartPlus sidebar panel registration and authenticated WebSocket API."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any
from datetime import datetime

import voluptuous as vol
from homeassistant.components import panel_custom, websocket_api
from homeassistant.components.frontend import (
    add_extra_js_url,
    async_panel_exists,
    async_remove_panel,
)
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.logger.helpers import (
    DATA_LOGGER,
    LogPersistance,
    LogSettingsType,
    LoggerSetting,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.util import dt as dt_util

from .api import AkuvoxApiClient, AkuvoxApiClientError
from .const import (
    DOMAIN,
    LOGGER,
    NAME,
    CUSTOM_CAMERA_STREAM_ORIENTATIONS,
    CAMERA_STREAM_ORIENTATIONS,
    CUSTOM_ACTIVITY_IMAGE_ORIENTATIONS,
    ACTIVITY_IMAGE_ORIENTATIONS,
    STORE_ACTIVITY_HISTORY,
    ACTIVITY_HISTORY_MAX_STORAGE_MB,
    ACTIVITY_HISTORY_DEFAULT_STORAGE_MB,
    DEBUG_LOGGING,
    PANEL_RUNTIME_KEY,
    PANEL_RUNTIME_DOMAIN,
    PANEL_STATIC_URL,
    PANEL_URL_PATH,
)
from .coordinator import AkuvoxDataUpdateCoordinator
from .repairs import authentication_failed

_PANEL_MODULE = "akuvox-panel.js"
_PANEL_ICONSET = "akuvox-iconset.js"


def _panel_module_url() -> str:
    """Return a cache-busted panel module URL for the installed asset."""
    module_path = Path(__file__).parent / "panel" / _PANEL_MODULE
    return f"{PANEL_STATIC_URL}/{_PANEL_MODULE}?v={module_path.stat().st_mtime_ns}"


def _panel_iconset_url() -> str:
    """Return a cache-busted URL for the custom SmartPlus icon set."""
    iconset_path = Path(__file__).parent / "panel" / _PANEL_ICONSET
    return f"{PANEL_STATIC_URL}/{_PANEL_ICONSET}?v={iconset_path.stat().st_mtime_ns}"


def _panel_entries(hass: HomeAssistant) -> list[ConfigEntry]:
    """Return active config entries without coupling the panel to one account."""
    return hass.config_entries.async_entries(DOMAIN)


async def async_refresh_panel(hass: HomeAssistant) -> None:
    """Register the sidebar panel whenever at least one account exists."""
    entries = _panel_entries(hass)
    runtime = hass.data.setdefault(PANEL_RUNTIME_DOMAIN, {})
    panel_exists = async_panel_exists(hass, PANEL_URL_PATH)

    if not entries:
        if panel_exists:
            async_remove_panel(hass, PANEL_URL_PATH)
        runtime.pop(PANEL_RUNTIME_KEY, None)
        return

    if panel_exists:
        async_remove_panel(hass, PANEL_URL_PATH)

    if not runtime.get(PANEL_RUNTIME_KEY):
        await hass.http.async_register_static_paths(
            [
                StaticPathConfig(
                    PANEL_STATIC_URL,
                    str(Path(__file__).parent / "panel"),
                    cache_headers=False,
                )
            ]
        )
        add_extra_js_url(hass, _panel_iconset_url())
        runtime[PANEL_RUNTIME_KEY] = True

    await panel_custom.async_register_panel(
        hass=hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name="akuvox-smartplus-panel",
        sidebar_title=NAME,
        sidebar_icon="akuvox:smartplus",
        module_url=_panel_module_url(),
        embed_iframe=False,
        require_admin=False,
        # Associate this panel with the integration so Home Assistant's
        # built-in Settings action routes straight to it, as Chime TTS does.
        config_panel_domain=DOMAIN,
    )


def async_register_websocket_api(hass: HomeAssistant) -> None:
    """Register the panel's WebSocket commands once per Home Assistant instance."""
    runtime = hass.data.setdefault(PANEL_RUNTIME_DOMAIN, {})
    if runtime.get("_panel_websocket_registered"):
        return
    websocket_api.async_register_command(hass, websocket_panel_data)
    websocket_api.async_register_command(hass, websocket_panel_settings)
    websocket_api.async_register_command(hass, websocket_panel_save_settings)
    websocket_api.async_register_command(hass, websocket_panel_stream)
    websocket_api.async_register_command(hass, websocket_panel_activity_image)
    websocket_api.async_register_command(hass, websocket_panel_clear_activity_storage)
    websocket_api.async_register_command(hass, websocket_panel_export_activity_storage)
    websocket_api.async_register_command(hass, websocket_panel_import_activity_storage)
    websocket_api.async_register_command(hass, websocket_panel_export_sip_accounts_pdf)
    websocket_api.async_register_command(hass, websocket_panel_call_image)
    websocket_api.async_register_command(hass, websocket_panel_temp_key_qr)
    websocket_api.async_register_command(hass, websocket_panel_open_relay)
    websocket_api.async_register_command(hass, websocket_panel_create_temp_key)
    websocket_api.async_register_command(hass, websocket_panel_edit_temp_key)
    websocket_api.async_register_command(hass, websocket_panel_delete_temp_key)
    runtime["_panel_websocket_registered"] = True


def _require_admin(
    connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> bool:
    """Reject sensitive panel commands from non-administrators."""
    if connection.user.is_admin:
        return True
    connection.send_error(msg["id"], "unauthorized", "Administrator access is required")
    return False


def _client_for_entry(hass: HomeAssistant, entry_id: str) -> AkuvoxApiClient | None:
    """Resolve an active account client by config entry id."""
    coordinator = hass.data.get(DOMAIN, {}).get(entry_id)
    if isinstance(coordinator, AkuvoxDataUpdateCoordinator):
        return coordinator.client
    return None


@websocket_api.websocket_command({vol.Required("type"): "akuvox/panel_data"})
@websocket_api.async_response
async def websocket_panel_data(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return currently available, non-secret data for every active account."""
    if not _require_admin(connection, msg):
        return
    device_registry = dr.async_get(hass)
    accounts = []
    for entry in _panel_entries(hass):
        client = _client_for_entry(hass, entry.entry_id)
        if client is None:
            continue
        panel_data = client.get_panel_data()
        panel_data["activity"] = [
            {
                **{
                    key: value
                    for key, value in activity.items()
                    if key not in {"PicUrl", "LocalPreview"}
                },
                "has_image": bool(activity.get("PicUrl") or activity.get("LocalPreview")),
            }
            for activity in panel_data["activity"]
        ]
        panel_data["calls"] = [
            {**{key: value for key, value in call.items() if key not in {"picUrl", "smallPicUrl"}}, "has_image": bool(call.get("picUrl") or call.get("smallPicUrl"))}
            for call in panel_data["calls"]
        ]
        panel_data["temporary_keys"] = [
            {
                **{key: value for key, value in temp_key.items() if key != "qr_code_url"},
                "has_qr_code": bool(temp_key.get("qr_code_url")),
            }
            for temp_key in panel_data["temporary_keys"]
        ]
        for item in [*panel_data["cameras"], *panel_data["relays"]]:
            name = str(item.get("name", ""))
            device = device_registry.async_get_device(
                identifiers={(DOMAIN, f"{entry.entry_id}:{name}")}
            )
            # Existing installations used the device name as the identifier.
            # Retain that lookup while requiring ownership by this entry, so it
            # remains safe when multiple SmartPlus accounts share a device name.
            if device is None:
                legacy_device = device_registry.async_get_device(
                    identifiers={(DOMAIN, name)}
                )
                if legacy_device is not None and entry.entry_id in legacy_device.config_entries:
                    device = legacy_device
            if device is not None:
                item["device_id"] = device.id
        accounts.append(
            {
                "entry_id": entry.entry_id,
                "title": entry.title,
                "requires_reauthentication": authentication_failed(hass, entry.entry_id),
                **panel_data,
            }
        )
    connection.send_result(msg["id"], {"accounts": accounts})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "akuvox/panel_activity_image",
        vol.Required("entry_id"): str,
        vol.Required("capture_time"): str,
    }
)
@websocket_api.async_response
async def websocket_panel_activity_image(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return a known activity image only to an authorised panel user."""
    if not _require_admin(connection, msg):
        return
    client = _client_for_entry(hass, msg["entry_id"])
    if client is None:
        connection.send_error(msg["id"], "not_found", "Akuvox account was not found")
        return
    try:
        image = await client.async_get_panel_activity_image(msg["capture_time"])
    except AkuvoxApiClientError as error:
        connection.send_error(msg["id"], "not_found", str(error))
        return
    connection.send_result(msg["id"], image)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "akuvox/panel_clear_activity_storage",
        vol.Required("entry_id"): str,
    }
)
@websocket_api.async_response
async def websocket_panel_clear_activity_storage(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Clear an account's locally stored panel activity after admin confirmation."""
    if not _require_admin(connection, msg):
        return
    client = _client_for_entry(hass, msg["entry_id"])
    if client is None:
        connection.send_error(msg["id"], "not_found", "Akuvox account was not found")
        return
    await client.async_clear_panel_activity_storage()
    connection.send_result(msg["id"], {"cleared": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "akuvox/panel_export_activity_storage",
        vol.Required("entry_id"): str,
    }
)
@websocket_api.async_response
async def websocket_panel_export_activity_storage(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return an admin-only ZIP archive of locally stored panel activity."""
    if not _require_admin(connection, msg):
        return
    client = _client_for_entry(hass, msg["entry_id"])
    if client is None:
        connection.send_error(msg["id"], "not_found", "Akuvox account was not found")
        return
    connection.send_result(msg["id"], await client.async_export_panel_activity_storage())


@websocket_api.websocket_command(
    {
        vol.Required("type"): "akuvox/panel_import_activity_storage",
        vol.Required("entry_id"): str,
        vol.Required("archive"): str,
    }
)
@websocket_api.async_response
async def websocket_panel_import_activity_storage(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Merge an administrator-selected local-data export into one account."""
    if not _require_admin(connection, msg):
        return
    client = _client_for_entry(hass, msg["entry_id"])
    if client is None:
        connection.send_error(msg["id"], "not_found", "Akuvox account was not found")
        return
    try:
        result = await client.async_import_panel_data(msg["archive"])
    except AkuvoxApiClientError as error:
        connection.send_error(msg["id"], "invalid_archive", str(error))
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command({vol.Required("type"): "akuvox/panel_call_image", vol.Required("entry_id"): str, vol.Required("call_id"): str})
@websocket_api.async_response
async def websocket_panel_call_image(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Return an authorised call image to the panel."""
    if not _require_admin(connection, msg): return
    client = _client_for_entry(hass, msg["entry_id"])
    if client is None:
        connection.send_error(msg["id"], "not_found", "Akuvox account was not found"); return
    try:
        connection.send_result(msg["id"], await client.async_get_panel_call_image(msg["call_id"]))
    except AkuvoxApiClientError as error:
        connection.send_error(msg["id"], "not_found", str(error))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "akuvox/panel_temp_key_qr",
        vol.Required("entry_id"): str,
        vol.Required("key_id"): str,
    }
)
@websocket_api.async_response
async def websocket_panel_temp_key_qr(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return a temporary key QR image to an authorised panel user."""
    if not _require_admin(connection, msg):
        return
    client = _client_for_entry(hass, msg["entry_id"])
    if client is None:
        connection.send_error(msg["id"], "not_found", "Akuvox account was not found")
        return
    try:
        image = await client.async_get_panel_temp_key_qr(msg["key_id"])
    except AkuvoxApiClientError as error:
        connection.send_error(msg["id"], "not_found", str(error))
        return
    connection.send_result(msg["id"], image)


def _entry_value(entry: ConfigEntry, key: str, default: Any = None) -> Any:
    """Read a setting with the same options-first precedence as the options flow."""
    return entry.options.get(key, entry.data.get(key, default))


@websocket_api.websocket_command(
    {vol.Required("type"): "akuvox/panel_settings", vol.Required("entry_id"): str}
)
@websocket_api.async_response
async def websocket_panel_settings(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return the editable settings for one administrator-authorised account."""
    if not _require_admin(connection, msg):
        return
    entry = next(
        (item for item in _panel_entries(hass) if item.entry_id == msg["entry_id"]),
        None,
    )
    if entry is None:
        connection.send_error(msg["id"], "not_found", "Akuvox account was not found")
        return
    client = _client_for_entry(hass, entry.entry_id)
    connection.send_result(
        msg["id"],
        {
            "settings": {
                "event_screenshot_options": str(
                    _entry_value(entry, "event_screenshot_options", "asap")
                ),
                PANEL_ENABLED: bool(_entry_value(entry, PANEL_ENABLED, True)),
                PANEL_ADMIN_ONLY: bool(_entry_value(entry, PANEL_ADMIN_ONLY, True)),
                CUSTOM_CAMERA_STREAM_ORIENTATIONS: bool(
                    _entry_value(entry, CUSTOM_CAMERA_STREAM_ORIENTATIONS, False)
                ),
                CAMERA_STREAM_ORIENTATIONS: _entry_value(
                    entry, CAMERA_STREAM_ORIENTATIONS, {}
                ),
                CUSTOM_ACTIVITY_IMAGE_ORIENTATIONS: bool(
                    _entry_value(entry, CUSTOM_ACTIVITY_IMAGE_ORIENTATIONS, False)
                ),
                ACTIVITY_IMAGE_ORIENTATIONS: _entry_value(
                    entry, ACTIVITY_IMAGE_ORIENTATIONS, {}
                ),
                STORE_ACTIVITY_HISTORY: bool(_entry_value(entry, STORE_ACTIVITY_HISTORY, True)),
                ACTIVITY_HISTORY_MAX_STORAGE_MB: int(
                    _entry_value(
                        entry,
                        ACTIVITY_HISTORY_MAX_STORAGE_MB,
                        ACTIVITY_HISTORY_DEFAULT_STORAGE_MB,
                    )
                ),
                "activity_history_storage_bytes": (
                    client.get_activity_storage_usage_bytes() if client else 0
                ),
                # The Home Assistant logger is the source of truth because it
                # can be changed outside this panel.
                DEBUG_LOGGING: LOGGER.isEnabledFor(logging.DEBUG),
                "sip_accounts": client.get_sip_accounts() if client else {},
            },
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "akuvox/panel_export_sip_accounts_pdf",
        vol.Required("entry_id"): str,
        vol.Required("password"): str,
        vol.Required("password_confirmation"): str,
    }
)
@websocket_api.async_response
async def websocket_panel_export_sip_accounts_pdf(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Create a password-protected SIP accounts PDF for an administrator."""
    if not _require_admin(connection, msg):
        return
    client = _client_for_entry(hass, msg["entry_id"])
    if client is None:
        connection.send_error(msg["id"], "not_found", "Akuvox account was not found")
        return
    if msg["password"] != msg["password_confirmation"]:
        connection.send_error(msg["id"], "invalid_password", "Passwords must match")
        return
    try:
        result = await client.async_export_sip_accounts_pdf(msg["password"])
    except AkuvoxApiClientError as error:
        connection.send_error(msg["id"], "export_failed", str(error))
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "akuvox/panel_save_settings",
        vol.Required("entry_id"): str,
        vol.Required(CUSTOM_CAMERA_STREAM_ORIENTATIONS): bool,
        vol.Required(CAMERA_STREAM_ORIENTATIONS): dict,
        vol.Required(CUSTOM_ACTIVITY_IMAGE_ORIENTATIONS): bool,
        vol.Required(ACTIVITY_IMAGE_ORIENTATIONS): dict,
        vol.Required(STORE_ACTIVITY_HISTORY): bool,
        vol.Required(ACTIVITY_HISTORY_MAX_STORAGE_MB): vol.All(vol.Coerce(int), vol.Range(min=0)),
        vol.Required(DEBUG_LOGGING): bool,
    }
)
@websocket_api.async_response
async def websocket_panel_save_settings(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Persist panel-edited integration options."""
    if not _require_admin(connection, msg):
        return
    entry = next(
        (item for item in _panel_entries(hass) if item.entry_id == msg["entry_id"]),
        None,
    )
    if entry is None:
        connection.send_error(msg["id"], "not_found", "Akuvox account was not found")
        return
    options = dict(entry.options)
    options.pop("panel_enabled", None)
    options.pop("panel_admin_only", None)
    options.pop("event_screenshot_options", None)
    # Per-camera activity orientations supersede this legacy global transform.
    options.pop("mirror_activity_images", None)
    valid_orientations = {
        "none", "rotate_90", "rotate_180", "rotate_270", "flip_horizontal",
        "flip_vertical", "flip_horizontal_and_rotate_90", "flip_vertical_and_rotate_90",
    }
    client = _client_for_entry(hass, entry.entry_id)
    camera_names = {
        str(camera.get("name", ""))
        for camera in (client.get_panel_data().get("cameras", []) if client else [])
    }
    def _orientations(value: dict[str, Any], enabled: bool) -> dict[str, str]:
        if not enabled:
            return {}
        return {
            name: orientation
            for name, orientation in value.items()
            if name in camera_names and isinstance(orientation, str)
            and orientation in valid_orientations
        }
    options.update(
        {
            "override": True,
            "event_screenshot_options": msg["event_screenshot_options"],
            PANEL_ENABLED: msg[PANEL_ENABLED],
            PANEL_ADMIN_ONLY: msg[PANEL_ADMIN_ONLY],
            CUSTOM_CAMERA_STREAM_ORIENTATIONS: msg[CUSTOM_CAMERA_STREAM_ORIENTATIONS],
            CAMERA_STREAM_ORIENTATIONS: _orientations(
                msg[CAMERA_STREAM_ORIENTATIONS], msg[CUSTOM_CAMERA_STREAM_ORIENTATIONS]
            ),
            CUSTOM_ACTIVITY_IMAGE_ORIENTATIONS: msg[CUSTOM_ACTIVITY_IMAGE_ORIENTATIONS],
            ACTIVITY_IMAGE_ORIENTATIONS: _orientations(
                msg[ACTIVITY_IMAGE_ORIENTATIONS], msg[CUSTOM_ACTIVITY_IMAGE_ORIENTATIONS]
            ),
            STORE_ACTIVITY_HISTORY: msg[STORE_ACTIVITY_HISTORY],
            ACTIVITY_HISTORY_MAX_STORAGE_MB: msg[ACTIVITY_HISTORY_MAX_STORAGE_MB],
            DEBUG_LOGGING: msg[DEBUG_LOGGING],
        }
    )
    if client is not None:
        client.skip_next_entry_reload()
    hass.config_entries.async_update_entry(entry, options=options)
    try:
        await async_refresh_panel(hass)
    except Exception:  # noqa: BLE001 - the settings have already persisted.
        LOGGER.exception("Unable to refresh the SmartPlus panel after saving settings")
    # The logger UI maintains a persisted override separate from the config
    # entry option. Keep it in sync, otherwise an existing DEBUG override can
    # prevent this panel setting from changing the effective integration level.
    try:
        await hass.data[DATA_LOGGER].settings.async_update(
            hass,
            DOMAIN,
            LoggerSetting(
                level="DEBUG" if msg[DEBUG_LOGGING] else "INFO",
                persistence=LogPersistance.PERMANENT,
                type=LogSettingsType.INTEGRATION,
            ),
        )
    except Exception:  # noqa: BLE001 - logger preferences must not fail a save.
        LOGGER.exception("Unable to update SmartPlus logger preferences")
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "akuvox/panel_stream",
        vol.Required("entry_id"): str,
        vol.Required("camera_name"): str,
        vol.Required("confirmed"): True,
    }
)
@websocket_api.async_response
async def websocket_panel_stream(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return a stream link after explicit user confirmation."""
    if not _require_admin(connection, msg):
        return
    client = _client_for_entry(hass, msg["entry_id"])
    stream_url = client.get_stream_url(msg["camera_name"]) if client else None
    if not stream_url:
        connection.send_error(msg["id"], "not_found", "Camera stream was not found")
        return
    connection.send_result(msg["id"], {"stream_url": stream_url})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "akuvox/panel_open_relay",
        vol.Required("entry_id"): str,
        vol.Required("mac"): str,
        vol.Required("relay_id"): str,
        vol.Required("confirmed"): True,
    }
)
@websocket_api.async_response
async def websocket_panel_open_relay(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Open a configured relay after explicit user confirmation."""
    if not _require_admin(connection, msg):
        return
    client = _client_for_entry(hass, msg["entry_id"])
    if client is None:
        connection.send_error(msg["id"], "not_found", "Akuvox account was not found")
        return
    try:
        await client.async_open_panel_relay(msg["mac"], msg["relay_id"])
    except AkuvoxApiClientError as error:
        LOGGER.warning("Sidebar relay action failed: %s", error)
        connection.send_error(msg["id"], "operation_failed", "Unable to open relay")
        return
    connection.send_result(msg["id"])


def _validated_panel_devices(
    client: AkuvoxApiClient, requested_devices: list[dict[str, Any]]
) -> list[dict[str, str]] | None:
    """Ensure a key can only be granted for relays the account actually owns."""
    allowed_relays = {
        (str(relay.get("mac")), str(relay.get("relay_id")))
        for relay in client.get_panel_data()["relays"]
    }
    devices: list[dict[str, str]] = []
    for device in requested_devices:
        if not isinstance(device, dict):
            return None
        mac = str(device.get("mac", ""))
        relay_ids = str(device.get("relay", "")).split(";")
        valid_ids = [relay_id for relay_id in relay_ids if (mac, relay_id) in allowed_relays]
        if not valid_ids:
            return None
        devices.append({"mac": mac, "relay": ";".join(valid_ids)})
    return devices or None


def _preserved_temp_key_devices(
    key: dict[str, Any], requested_devices: list[dict[str, Any]]
) -> list[dict[str, str]] | None:
    """Validate that an edit retains the temporary key's existing relays.

    The edit dialog intentionally makes relay assignment read-only.  Cloud relay
    inventory can temporarily omit a relay that is nevertheless present on an
    existing key, so validating this request against today's inventory prevents
    metadata-only edits from ever reaching SmartPlus.  Validate against the
    persisted key assignments instead, and return them in their stored order.
    """
    stored_pairs = [
        (str(door.get("mac", "")), str(door.get("relay", "")))
        for door in key.get("doors", [])
        if isinstance(door, dict) and door.get("mac") is not None and door.get("relay") is not None
    ]
    if not stored_pairs:
        return None

    requested_pairs: set[tuple[str, str]] = set()
    for device in requested_devices:
        if not isinstance(device, dict):
            return None
        mac = str(device.get("mac", ""))
        for relay in str(device.get("relay", "")).split(";"):
            if not mac or not relay:
                return None
            requested_pairs.add((mac, relay))
    if requested_pairs != set(stored_pairs):
        return None

    grouped: dict[str, list[str]] = {}
    for mac, relay in stored_pairs:
        grouped.setdefault(mac, []).append(relay)
    return [{"mac": mac, "relay": ";".join(relays)} for mac, relays in grouped.items()]


@websocket_api.websocket_command(
    {
        vol.Required("type"): "akuvox/panel_create_temp_key",
        vol.Required("entry_id"): str,
        vol.Required("description"): vol.All(str, vol.Length(min=1, max=100)),
        vol.Required("begin_time"): str,
        vol.Required("end_time"): str,
        vol.Required("counts"): vol.All(vol.Coerce(int), vol.Range(min=1, max=100000)),
        vol.Required("dev_list"): list,
        vol.Optional("id_number", default=""): vol.All(str, vol.Length(max=100)),
        vol.Optional("license_plate", default=""): vol.All(str, vol.Length(max=100)),
        vol.Optional("uhf_card", default=""): vol.All(str, vol.Length(max=100)),
        vol.Required("confirmed"): True,
    }
)
@websocket_api.async_response
async def websocket_panel_create_temp_key(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Create a temporary key only after a reviewed and confirmed request."""
    if not _require_admin(connection, msg):
        return
    client = _client_for_entry(hass, msg["entry_id"])
    devices = _validated_panel_devices(client, msg["dev_list"]) if client else None
    if devices is None:
        connection.send_error(msg["id"], "invalid_format", "Select at least one valid relay")
        return
    try:
        begin_time = datetime.strptime(msg["begin_time"], "%Y-%m-%d %H:%M:%S")
        end_time = datetime.strptime(msg["end_time"], "%Y-%m-%d %H:%M:%S")
    except ValueError:
        connection.send_error(msg["id"], "invalid_format", "Use valid local date and time values")
        return
    if end_time <= begin_time:
        connection.send_error(msg["id"], "invalid_format", "End time must be after start time")
        return
    time_zone = dt_util.get_time_zone(str(hass.config.time_zone))
    current_time = dt_util.now(time_zone).replace(tzinfo=None)
    if begin_time < current_time:
        begin_time = current_time
        msg["begin_time"] = begin_time.strftime("%Y-%m-%d %H:%M:%S")
    if end_time <= begin_time:
        connection.send_error(
            msg["id"],
            "invalid_format",
            "End time must be after the current local time",
        )
        return
    try:
        await client.async_create_panel_temp_key(
            msg["description"],
            msg["begin_time"],
            msg["end_time"],
            msg["counts"],
            devices,
            msg["id_number"],
            msg["license_plate"],
            msg["uhf_card"],
        )
    except AkuvoxApiClientError as error:
        LOGGER.warning("Sidebar temporary-key creation failed: %s", error)
        connection.send_error(msg["id"], "operation_failed", "Unable to create temporary key")
        return
    connection.send_result(msg["id"])


@websocket_api.websocket_command({vol.Required("type"): "akuvox/panel_edit_temp_key", vol.Required("entry_id"): str, vol.Required("key_id"): str, vol.Required("description"): vol.All(str, vol.Length(min=1, max=100)), vol.Required("begin_time"): str, vol.Required("end_time"): str, vol.Required("counts"): vol.All(vol.Coerce(int), vol.Range(min=1, max=100000)), vol.Required("dev_list"): list, vol.Optional("id_number", default=""): vol.All(str, vol.Length(max=100)), vol.Optional("license_plate", default=""): vol.All(str, vol.Length(max=100)), vol.Optional("uhf_card", default=""): vol.All(str, vol.Length(max=100))})
@websocket_api.async_response
async def websocket_panel_edit_temp_key(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Update a known temporary key after validating requested relays."""
    if not _require_admin(connection, msg): return
    client = _client_for_entry(hass, msg["entry_id"])
    key = next(
        (
            item
            for item in client.get_panel_data()["temporary_keys"]
            if str(item.get("key_id", "")) == msg["key_id"]
        ),
        None,
    ) if client else None
    devices = _preserved_temp_key_devices(key, msg["dev_list"]) if key else None
    if devices is None or key is None:
        LOGGER.warning(
            "Sidebar temporary-key update rejected before API request: key ID %s, "
            "key found=%s, relay selection valid=%s",
            msg["key_id"],
            key is not None,
            devices is not None,
        )
        connection.send_error(
            msg["id"],
            "invalid_format",
            "Select a valid key and at least one relay",
        )
        return
    try:
        begin = datetime.strptime(msg["begin_time"], "%Y-%m-%d %H:%M:%S")
        end = datetime.strptime(msg["end_time"], "%Y-%m-%d %H:%M:%S")
        if end <= begin: raise ValueError
        if bool(key.get("expired", False)):
            LOGGER.info("Rejected update for expired temporary key ID %s", msg["key_id"])
            connection.send_error(
                msg["id"],
                "expired_key",
                "This temporary key has expired and can no longer be edited",
            )
            return
        await client.async_edit_panel_temp_key(msg["key_id"], msg["description"], msg["begin_time"], msg["end_time"], msg["counts"], devices, msg["id_number"], msg["license_plate"], msg["uhf_card"])
    except (ValueError, AkuvoxApiClientError) as error:
        LOGGER.warning("Sidebar temporary-key update failed: %s", error)
        connection.send_error(msg["id"], "operation_failed", str(error) or "Unable to update temporary key"); return
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): "akuvox/panel_delete_temp_key",
        vol.Required("entry_id"): str,
        vol.Required("temp_key"): str,
        vol.Required("confirmed"): True,
    }
)
@websocket_api.async_response
async def websocket_panel_delete_temp_key(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Permanently delete a temporary key after explicit confirmation."""
    if not _require_admin(connection, msg):
        return
    client = _client_for_entry(hass, msg["entry_id"])
    if client is None:
        connection.send_error(msg["id"], "not_found", "Akuvox account was not found")
        return
    if msg["temp_key"] not in {
        str(key.get("key_id", "")) for key in client.get_panel_data()["temporary_keys"]
    }:
        connection.send_error(msg["id"], "not_found", "Temporary key was not found")
        return
    try:
        await client.async_delete_panel_temp_key(msg["temp_key"])
    except AkuvoxApiClientError as error:
        LOGGER.warning("Sidebar temporary-key deletion failed: %s", error)
        connection.send_error(msg["id"], "operation_failed", "Unable to delete temporary key")
        return
    connection.send_result(msg["id"])
