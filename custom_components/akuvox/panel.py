"""SmartPlus sidebar panel registration and authenticated WebSocket API."""
from __future__ import annotations

import base64
import asyncio
import hmac
import logging
from pathlib import Path
from typing import Any
from datetime import datetime
from urllib.parse import quote

import aiohttp
import voluptuous as vol
from aiohttp import web
from homeassistant.components import panel_custom, websocket_api
from homeassistant.components.camera import get_camera_from_entity_id
from homeassistant.components.frontend import (
    add_extra_js_url,
    async_remove_panel,
)
from homeassistant.components.http import HomeAssistantView, StaticPathConfig
from homeassistant.components.logger.helpers import (
    DATA_LOGGER,
    LogPersistance,
    LogSettingsType,
    LoggerSetting,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util

from .api import AkuvoxApiClient, AkuvoxApiClientError, get_config_entry_device
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
    WAIT_FOR_EVENT_IMAGE,
    CUSTOM_EVENT_IMAGE_WAIT,
    EVENT_IMAGE_WAIT_OVERRIDES,
    PANEL_RUNTIME_KEY,
    PANEL_RUNTIME_DOMAIN,
    PANEL_STATIC_URL,
    PANEL_URL_PATH,
)
from .coordinator import AkuvoxDataUpdateCoordinator
from .device_visibility import filter_disabled_panel_devices
from .repairs import (
    async_update_credential_source_issue,
    authentication_failed,
    credential_source_problem,
)
from .sharing import (
    SHARED_MODE, SHARED_MODE_REMOTE, async_apply_remote_share_link, async_create_share,
    async_fetch_shared_image, async_list_shares, get_external_url,
    async_delete_share, async_revoke_share, async_sync_remote_entry,
)

_PANEL_MODULE = "akuvox-panel.js"
_PANEL_ICONSET = "akuvox-iconset.js"
_PANEL_ASSET_VERSION = "20261004-still-refresh-rebuilt-v154"
DATA_CAMERA_PREVIEW_LOCK = f"{DOMAIN}_panel_camera_preview_lock"


def _panel_module_url() -> str:
    """Return a cache-busted panel module URL for the installed asset."""
    module_path = Path(__file__).parent / "panel" / _PANEL_MODULE
    return f"{PANEL_STATIC_URL}/{_PANEL_MODULE}?v={module_path.stat().st_mtime_ns}&build={_PANEL_ASSET_VERSION}"


def _panel_iconset_url() -> str:
    """Return a cache-busted URL for the custom SmartPlus icon set."""
    iconset_path = Path(__file__).parent / "panel" / _PANEL_ICONSET
    return f"{PANEL_STATIC_URL}/{_PANEL_ICONSET}?v={iconset_path.stat().st_mtime_ns}"


def _panel_entries(hass: HomeAssistant) -> list[ConfigEntry]:
    """Return active config entries without coupling the panel to one account."""
    return hass.config_entries.async_entries(DOMAIN)


def _visible_panel_entries(hass: HomeAssistant) -> list[ConfigEntry]:
    """Return hubs that are enabled and can be selected in the panel header."""
    return [entry for entry in _panel_entries(hass) if entry.disabled_by is None]


async def async_refresh_panel(hass: HomeAssistant) -> None:
    """Register the sidebar panel whenever at least one account exists."""
    entries = _panel_entries(hass)
    runtime = hass.data.setdefault(PANEL_RUNTIME_DOMAIN, {})
    if not entries:
        async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)
        runtime.pop(PANEL_RUNTIME_KEY, None)
        return

    async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)

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
    _async_register_panel_camera_preview_view(hass)

    await panel_custom.async_register_panel(
        hass=hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name="akuvox-smartplus-panel",
        sidebar_title=NAME,
        sidebar_icon="akuvox:smartplus",
        module_url=_panel_module_url(),
        embed_iframe=False,
        require_admin=True,
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
    websocket_api.async_register_command(
        hass, websocket_panel_refresh_shared_credentials
    )
    websocket_api.async_register_command(hass, websocket_panel_apply_remote_share_link)
    websocket_api.async_register_command(hass, websocket_panel_create_credential_share)
    websocket_api.async_register_command(hass, websocket_panel_revoke_credential_share)
    websocket_api.async_register_command(hass, websocket_panel_delete_credential_share)
    websocket_api.async_register_command(hass, websocket_panel_camera_preview)
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


async def _async_capture_panel_camera_preview(
    hass: HomeAssistant, entry_id: str, camera_name: str
) -> bytes | None:
    """Capture one new JPEG frame for a panel camera.

    This deliberately bypasses the generic camera proxy, which is allowed to
    reuse its previous still for a source URL that has not changed.
    """
    entity_id = er.async_get(hass).async_get_entity_id(
        "camera", DOMAIN, f"{entry_id}:{camera_name}"
    )
    if not entity_id:
        return None
    # SmartPlus's cloud RTSP service permits one frame extraction at a time.
    # This also makes captures deterministic when several panel cards refresh.
    lock = hass.data.setdefault(DATA_CAMERA_PREVIEW_LOCK, asyncio.Lock())
    async with lock:
        try:
            camera = get_camera_from_entity_id(hass, entity_id)
            return await camera.async_camera_image()
        except Exception as error:
            LOGGER.debug("Unable to capture panel camera preview: %s", error)
            return None


class PanelCameraPreviewView(HomeAssistantView):
    """Return a newly captured, authenticated camera still for the panel."""

    url = "/api/akuvox/panel-camera-preview/{entry_id}/{camera_name}"
    name = "api:akuvox:panel_camera_preview"
    # Camera stills are rendered by <img>, which does not reliably attach the
    # panel's authentication context. Authorize with the entity's existing
    # Home Assistant camera token, exactly as camera_proxy does.
    requires_auth = False

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the view with its Home Assistant instance."""
        self.hass = hass

    async def get(
        self, request: web.Request, entry_id: str, camera_name: str
    ) -> web.Response:
        """Return a fresh camera still after validating its access token."""
        entity_id = er.async_get(self.hass).async_get_entity_id(
            "camera", DOMAIN, f"{entry_id}:{camera_name}"
        )
        state = self.hass.states.get(entity_id) if entity_id else None
        expected_token = state.attributes.get("access_token") if state else None
        supplied_token = request.query.get("token", "")
        if not expected_token or not hmac.compare_digest(
            str(expected_token), supplied_token
        ):
            return web.Response(status=403)
        image = await _async_capture_panel_camera_preview(
            self.hass, entry_id, camera_name
        )
        if not image:
            return web.Response(status=404)
        return web.Response(
            body=image,
            content_type="image/jpeg",
            headers={"Cache-Control": "no-store, no-cache, max-age=0"},
        )


def _async_register_panel_camera_preview_view(hass: HomeAssistant) -> None:
    """Register the panel's cache-free camera-still endpoint once."""
    runtime = hass.data.setdefault(PANEL_RUNTIME_DOMAIN, {})
    if runtime.get("_panel_camera_preview_view_registered"):
        return
    hass.http.register_view(PanelCameraPreviewView(hass))
    runtime["_panel_camera_preview_view_registered"] = True


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
    accounts = []
    for entry in _visible_panel_entries(hass):
        client = _client_for_entry(hass, entry.entry_id)
        # Keep every configured hub selectable, including an entry still
        # starting up or temporarily unavailable. Its saved entry title is a
        # useful fallback until SmartPlus supplies the project (hub) name.
        panel_data = client.get_panel_data() if client else {
            "project_name": entry.title,
            "cameras": [],
            "relays": [],
            "temporary_keys": [],
            "activity": [],
            "calls": [],
        }
        # A remote client may receive broader cloud responses after pairing;
        # the source-approved entry snapshot remains the authority for panel UI.
        if entry.data.get(SHARED_MODE) == SHARED_MODE_REMOTE:
            panel_data["cameras"] = [
                {"name": item.get("name", ""), "source_name": item.get("name", "")}
                for item in entry.data.get("camera_data", [])
            ]
            panel_data["relays"] = [
                {"name": item.get("name", ""), "door_name": item.get("door_name", ""),
                 "source_name": item.get("name", ""), "relay_id": item.get("relay_id", ""), "mac": item.get("mac", "")}
                for item in entry.data.get("door_relay_data", [])
            ]
            allowed = {
                (str(item.get("mac", "")), str(item.get("relay_id", "")))
                for item in entry.data.get("door_relay_data", [])
            }
            permissions = entry.data.get("shared_permissions", {})
            permitted_key_relays = {
                tuple(item.removeprefix("relay:").split(":", 1))
                for item in permissions.get("view_key_relay_ids", [])
                if isinstance(item, str) and item.startswith("relay:")
            }
            allowed.intersection_update(permitted_key_relays)
            # The source snapshot is the authority.  Do not expose keys from
            # a broader response returned by the receiver's cloud client, or
            # keys that contain relays with no temporary-key permission.
            panel_data["temporary_keys"] = [
                key
                for key in entry.data.get("door_keys_data", [])
                if key.get("doors")
                and all(
                    (str(door.get("mac", "")), str(door.get("relay", ""))) in allowed
                    for door in key["doors"]
                )
            ]
            panel_data["activity"] = [
                dict(activity)
                for activity in entry.data.get("activity_data", [])
                if isinstance(activity, dict)
            ]
            panel_data["calls"] = [
                dict(call)
                for call in entry.data.get("call_data", [])
                if isinstance(call, dict)
            ]
        panel_data = filter_disabled_panel_devices(hass, entry, panel_data)
        panel_data["activity"] = [
            {
                **{
                    key: value
                    for key, value in activity.items()
                    if key not in {"PicUrl", "LocalPreview"}
                },
                "has_image": bool(
                    activity.get("has_image")
                    or activity.get("PicUrl")
                    or activity.get("LocalPreview")
                ),
            }
            for activity in panel_data["activity"]
        ]
        panel_data["calls"] = [
            {
                **{key: value for key, value in call.items() if key not in {"picUrl", "smallPicUrl"}},
                "has_image": bool(
                    call.get("has_image") or call.get("picUrl") or call.get("smallPicUrl")
                ),
            }
            for call in panel_data["calls"]
        ]
        panel_data["temporary_keys"] = [
            {
                **{key: value for key, value in temp_key.items() if key != "qr_code_url"},
                "has_qr_code": bool(temp_key.get("qr_code_url")),
            }
            for temp_key in panel_data["temporary_keys"]
        ]
        entity_registry = er.async_get(hass)
        device_names: dict[str, str] = {}
        for item in [*panel_data["cameras"], *panel_data["relays"]]:
            source_name = str(item.get("source_name") or item.get("name", ""))
            device = get_config_entry_device(
                hass, entry, (DOMAIN, f"{entry.entry_id}:{source_name}")
            )
            # Existing installations used the device name as the identifier.
            # Retain that lookup while requiring ownership by this entry, so it
            # remains safe when multiple SmartPlus accounts share a device name.
            if device is None:
                device = get_config_entry_device(hass, entry, (DOMAIN, source_name))
            if device is not None:
                item["device_id"] = device.id
                display_name = device.name_by_user or device.name or source_name
                item["name"] = display_name
                if "door_name" in item:
                    item["door_name"] = display_name
                device_names[source_name] = display_name
        for camera in panel_data["cameras"]:
            source_name = str(camera.get("source_name") or camera.get("name", ""))
            entity_id = entity_registry.async_get_entity_id(
                "camera", DOMAIN, f"{entry.entry_id}:{source_name}"
            )
            state = hass.states.get(entity_id) if entity_id else None
            token = state.attributes.get("access_token") if state else None
            if token:
                # The initial image uses Home Assistant's standard proxy so
                # the tile can render normally. Subsequent refreshes use the
                # dedicated capture endpoint: it asks the camera for a new
                # still and is never served from the proxy's stale-frame
                # cache.
                camera["preview_url"] = (
                    f"/api/camera_proxy/{entity_id}?token={quote(str(token), safe='')}"
                )
                camera["refresh_url"] = (
                    f"/api/akuvox/panel-camera-preview/{entry.entry_id}/"
                    f"{quote(source_name, safe='')}?token={quote(str(token), safe='')}"
                )
        for activity in panel_data["activity"]:
            source_name = str(activity.get("Location", "")).strip()
            display_name = device_names.get(source_name)
            if display_name:
                activity["source_location"] = source_name
                activity["Location"] = display_name
        accounts.append(
            {
                "entry_id": entry.entry_id,
                # The configuration-entry title is Home Assistant's hub
                # instance name. Never substitute the cloud project name: it
                # can be identical across otherwise distinct configured hubs.
                "title": entry.title,
                "credential_mode": entry.data.get(SHARED_MODE, "local"),
                "requires_reauthentication": authentication_failed(
                    hass, entry.entry_id
                ),
                "credential_source_problem": credential_source_problem(
                    hass, entry.entry_id
                ),
                "remote_source_url": entry.data.get("remote_source_url", ""),
                "shared_permissions": entry.data.get("shared_permissions", {}),
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
        entry = hass.config_entries.async_get_entry(msg["entry_id"])
        if entry is not None and entry.data.get(SHARED_MODE) == SHARED_MODE_REMOTE:
            from .credentials import async_get_remote_share_secret

            image = await async_fetch_shared_image(
                hass,
                str(entry.data["remote_source_url"]),
                str(entry.data["remote_share_id"]),
                await async_get_remote_share_secret(hass, entry.entry_id),
                "activity",
                msg["capture_time"],
            )
        else:
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
    if not _require_admin(connection, msg):
        return
    client = _client_for_entry(hass, msg["entry_id"])
    if client is None:
        connection.send_error(msg["id"], "not_found", "Akuvox account was not found")
        return
    try:
        entry = hass.config_entries.async_get_entry(msg["entry_id"])
        if entry is not None and entry.data.get(SHARED_MODE) == SHARED_MODE_REMOTE:
            from .credentials import async_get_remote_share_secret

            image = await async_fetch_shared_image(
                hass,
                str(entry.data["remote_source_url"]),
                str(entry.data["remote_share_id"]),
                await async_get_remote_share_secret(hass, entry.entry_id),
                "call",
                msg["call_id"],
            )
        else:
            image = await client.async_get_panel_call_image(msg["call_id"])
        connection.send_result(msg["id"], image)
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
    entry = hass.config_entries.async_get_entry(msg["entry_id"])
    client = _client_for_entry(hass, msg["entry_id"])
    if entry is None or client is None:
        connection.send_error(msg["id"], "not_found", "Akuvox account was not found")
        return
    try:
        if entry.data.get(SHARED_MODE) == SHARED_MODE_REMOTE:
            from .credentials import async_get_remote_share_secret

            image = await async_fetch_shared_image(
                hass,
                str(entry.data["remote_source_url"]),
                str(entry.data["remote_share_id"]),
                await async_get_remote_share_secret(hass, entry.entry_id),
                "temp_key_qr",
                msg["key_id"],
            )
        else:
            image = await client.async_get_panel_temp_key_qr(msg["key_id"])
    except (AkuvoxApiClientError, PermissionError, TypeError, aiohttp.ClientError) as error:
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
    remote_sync = hass.data.get("akuvox_credential_sharing", {}).get(entry.entry_id)
    connection.send_result(
        msg["id"],
        {
            "settings": {
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
                WAIT_FOR_EVENT_IMAGE: bool(_entry_value(entry, WAIT_FOR_EVENT_IMAGE, True)),
                CUSTOM_EVENT_IMAGE_WAIT: bool(
                    _entry_value(entry, CUSTOM_EVENT_IMAGE_WAIT, False)
                ),
                EVENT_IMAGE_WAIT_OVERRIDES: _entry_value(
                    entry, EVENT_IMAGE_WAIT_OVERRIDES, {}
                ),
                "activity_history_storage_bytes": (
                    client.get_activity_storage_usage_bytes() if client else 0
                ),
                # The Home Assistant logger is the source of truth because it
                # can be changed outside this panel.
                DEBUG_LOGGING: LOGGER.isEnabledFor(logging.DEBUG),
                "sip_accounts": client.get_sip_accounts() if client else {},
                "credential_mode": entry.data.get(SHARED_MODE, "local"),
                "credential_shares": await async_list_shares(hass, entry.entry_id),
                "remote_last_sync": (
                    remote_sync.last_successful_sync.isoformat()
                    if remote_sync and remote_sync.last_successful_sync
                    else None
                ),
            },
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "akuvox/panel_export_sip_accounts_pdf",
        vol.Required("entry_id"): str,
        vol.Required("password"): str,
        vol.Required("password_confirmation"): str,
        vol.Optional("language", default="en"): str,
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
        result = await client.async_export_sip_accounts_pdf(
            msg["password"], msg["language"]
        )
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
        vol.Required(WAIT_FOR_EVENT_IMAGE): bool,
        vol.Required(CUSTOM_EVENT_IMAGE_WAIT): bool,
        vol.Required(EVENT_IMAGE_WAIT_OVERRIDES): dict,
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
            WAIT_FOR_EVENT_IMAGE: msg[WAIT_FOR_EVENT_IMAGE],
            CUSTOM_EVENT_IMAGE_WAIT: msg[CUSTOM_EVENT_IMAGE_WAIT],
            EVENT_IMAGE_WAIT_OVERRIDES: {
                name: bool(wait)
                for name, wait in msg[EVENT_IMAGE_WAIT_OVERRIDES].items()
                if name in camera_names and isinstance(wait, bool)
            },
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
        vol.Required("type"): "akuvox/panel_refresh_shared_credentials",
        vol.Required("entry_id"): str,
    }
)
@websocket_api.async_response
async def websocket_panel_refresh_shared_credentials(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Request a fresh credential snapshot from a remote Home Assistant."""
    if not _require_admin(connection, msg):
        return
    entry = next(
        (item for item in _panel_entries(hass) if item.entry_id == msg["entry_id"]),
        None,
    )
    if entry is None or entry.data.get(SHARED_MODE) != SHARED_MODE_REMOTE:
        connection.send_error(
            msg["id"], "not_remote", "This account does not receive shared credentials"
        )
        return
    try:
        updated = await async_sync_remote_entry(hass, entry.entry_id)
    except PermissionError as error:
        async_update_credential_source_issue(hass, entry, "revoked")
        client = _client_for_entry(hass, entry.entry_id)
        if client is not None:
            client.async_disable_shared_credentials()
        connection.send_error(msg["id"], "revoked", str(error))
        return
    except Exception as error:  # noqa: BLE001 - surface a retryable source outage.
        async_update_credential_source_issue(hass, entry, "unreachable")
        connection.send_error(msg["id"], "unreachable", str(error))
        return
    connection.send_result(msg["id"], {"updated": updated})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "akuvox/panel_apply_remote_share_link",
        vol.Required("entry_id"): str,
        vol.Required("pairing_link"): vol.All(str, vol.Length(min=1)),
    }
)
@websocket_api.async_response
async def websocket_panel_apply_remote_share_link(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Apply a replacement pairing link to an existing remote entry."""
    if not _require_admin(connection, msg):
        return
    entry = next((item for item in _panel_entries(hass) if item.entry_id == msg["entry_id"]), None)
    if entry is None or entry.data.get(SHARED_MODE) != SHARED_MODE_REMOTE:
        connection.send_error(msg["id"], "not_remote", "This account does not receive shared credentials")
        return
    try:
        await async_apply_remote_share_link(hass, entry, msg["pairing_link"])
    except (ValueError, PermissionError, aiohttp.ClientError, TypeError) as error:
        connection.send_error(msg["id"], "invalid_share", str(error))
        return
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): "akuvox/panel_create_credential_share",
        vol.Required("entry_id"): str,
        vol.Required("receiver_name"): vol.All(str, vol.Length(min=1, max=100)),
        vol.Optional("source_url", default=""): str,
        vol.Required("device_ids"): [str],
        vol.Optional("activity_member_names", default=[]): [str],
        vol.Optional("call_member_names", default=[]): [str],
        vol.Optional("allow_create_keys", default=True): bool,
        vol.Optional("allow_edit_keys", default=True): bool,
        vol.Optional("create_key_relay_ids", default=[]): [str],
        vol.Optional("edit_key_relay_ids", default=[]): [str],
        vol.Optional("view_key_relay_ids", default=None): vol.Any(None, [str]),
        vol.Optional("access_expires_at", default=None): vol.Any(None, str),
    }
)
@websocket_api.async_response
async def websocket_panel_create_credential_share(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Create a short-lived pairing link from the panel settings page."""
    if not _require_admin(connection, msg):
        return
    entry = next((item for item in _panel_entries(hass) if item.entry_id == msg["entry_id"]), None)
    if entry is None:
        connection.send_error(msg["id"], "not_found", "Akuvox account was not found")
        return
    if entry.data.get(SHARED_MODE) == SHARED_MODE_REMOTE:
        connection.send_error(msg["id"], "not_owner", "Only the credential owner can create pairing links")
        return
    try:
        source_url = str(msg["source_url"]).strip()
        if not source_url.startswith("https://"):
            source_url = get_external_url(hass)
        pairing_link = await async_create_share(
            hass, entry, source_url, msg["receiver_name"],
            msg["device_ids"], msg["allow_create_keys"], msg["allow_edit_keys"],
            msg["access_expires_at"], msg["create_key_relay_ids"],
            msg["edit_key_relay_ids"],
            msg["view_key_relay_ids"], msg["activity_member_names"],
            msg["call_member_names"],
        )
    except ValueError as error:
        connection.send_error(msg["id"], "duplicate_receiver_name", str(error))
        return
    except AttributeError as error:
        connection.send_error(msg["id"], "external_url_required", str(error))
        return
    connection.send_result(msg["id"], {"pairing_link": pairing_link})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "akuvox/panel_revoke_credential_share",
        vol.Required("entry_id"): str,
        vol.Required("share_id"): str,
    }
)
@websocket_api.async_response
async def websocket_panel_revoke_credential_share(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Revoke one receiver's access from the panel."""
    if not _require_admin(connection, msg):
        return
    entry = next((item for item in _panel_entries(hass) if item.entry_id == msg["entry_id"]), None)
    if entry is None or entry.data.get(SHARED_MODE) == SHARED_MODE_REMOTE:
        connection.send_error(msg["id"], "not_found", "Credential source account was not found")
        return
    if not await async_revoke_share(hass, msg["share_id"]):
        connection.send_error(msg["id"], "not_found", "Paired Home Assistant was not found")
        return
    revoked_share = next(
        (
            share
            for share in await async_list_shares(hass, entry.entry_id)
            if share["share_id"] == msg["share_id"]
        ),
        None,
    )
    connection.send_result(msg["id"], {"share": revoked_share})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "akuvox/panel_delete_credential_share",
        vol.Required("entry_id"): str,
        vol.Required("share_id"): str,
    }
)
@websocket_api.async_response
async def websocket_panel_delete_credential_share(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Permanently remove an already-revoked receiver record."""
    if not _require_admin(connection, msg):
        return
    entry = next((item for item in _panel_entries(hass) if item.entry_id == msg["entry_id"]), None)
    if entry is None or entry.data.get(SHARED_MODE) == SHARED_MODE_REMOTE:
        connection.send_error(msg["id"], "not_found", "Credential source account was not found")
        return
    if not await async_delete_share(hass, msg["share_id"]):
        connection.send_error(msg["id"], "not_found", "Revoked receiver was not found")
        return
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "akuvox/panel_camera_preview",
        vol.Required("entry_id"): str,
        vol.Required("camera_name"): str,
    }
)
@websocket_api.async_response
async def websocket_panel_camera_preview(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Capture a still from an authorised panel camera without exposing its URL."""
    if not _require_admin(connection, msg):
        return
    image = await _async_capture_panel_camera_preview(
        hass, msg["entry_id"], msg["camera_name"]
    )
    connection.send_result(
        msg["id"],
        {"image": base64.b64encode(image).decode("ascii") if image else None},
    )


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
    entry = hass.config_entries.async_get_entry(msg["entry_id"])
    client = _client_for_entry(hass, msg["entry_id"])
    devices = _validated_panel_devices(client, msg["dev_list"]) if client else None
    if entry and entry.data.get(SHARED_MODE) == SHARED_MODE_REMOTE:
        permissions = entry.data.get("shared_permissions", {})
        permitted = permissions.get("create_key_relay_ids")
        if isinstance(permitted, list):
            allowed = {
                tuple(item.removeprefix("relay:").split(":", 1))
                for item in permitted if isinstance(item, str) and item.startswith("relay:")
            }
            requested = {
                (str(device["mac"]), relay)
                for device in (devices or []) for relay in str(device["relay"]).split(";")
            }
            if not requested or not requested.issubset(allowed):
                connection.send_error(msg["id"], "not_allowed", "The credential source does not allow creating temporary keys for the selected relay")
                return
        else:
            connection.send_error(msg["id"], "not_allowed", "Refresh shared credentials before creating a temporary key")
            return
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
    if not _require_admin(connection, msg):
        return
    entry = hass.config_entries.async_get_entry(msg["entry_id"])
    client = _client_for_entry(hass, msg["entry_id"])
    key = next(
        (
            item
            for item in client.get_panel_data()["temporary_keys"]
            if str(item.get("key_id", "")) == msg["key_id"]
        ),
        None,
    ) if client else None
    if entry and entry.data.get(SHARED_MODE) == SHARED_MODE_REMOTE:
        permitted = entry.data.get("shared_permissions", {}).get("edit_key_relay_ids")
        allowed = {
            tuple(item.removeprefix("relay:").split(":", 1))
            for item in permitted
            if isinstance(item, str) and item.startswith("relay:")
        } if isinstance(permitted, list) else set()
        key_relays = {
            (str(door.get("mac", "")), str(door.get("relay", "")))
            for door in (key or {}).get("doors", [])
            if isinstance(door, dict)
        }
        if not key_relays or not key_relays.issubset(allowed):
            connection.send_error(
                msg["id"],
                "not_allowed",
                "The credential source does not allow editing every relay in this temporary key",
            )
            return
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
        if end <= begin:
            raise ValueError
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
        connection.send_error(msg["id"], "operation_failed", str(error) or "Unable to update temporary key")
        return
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
