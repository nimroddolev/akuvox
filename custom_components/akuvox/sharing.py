"""Secure, opt-in sharing of SmartPlus credentials between HA instances."""
# ruff: noqa: D102, D103, D107
from __future__ import annotations

import asyncio
from contextlib import suppress
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import parse_qs, quote, urlencode, urlsplit

import aiohttp
from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers import storage
from homeassistant.helpers.network import NoURLAvailableError, get_url
from homeassistant.helpers.storage import Store

from .const import DOMAIN, LOGGER, account_storage_key
from .credentials import (
    async_get_credentials,
    async_get_remote_share_secret,
    async_store_credentials,
    async_store_remote_share_secret,
)
from .device_visibility import filter_disabled_device_data, filter_disabled_panel_devices
from .repairs import async_update_credential_source_issue

SHARED_MODE = "credential_mode"
SHARED_MODE_REMOTE = "remote"
SHARED_SECRET = "remote_share_secret"
SHARE_STORE_KEY = f"{DOMAIN}.credential_shares"
SHARE_STORE_VERSION = 1
DEFAULT_SYNC_INTERVAL = 15
# A receiver normally checks in every 15 seconds. Allow enough missed checks
# for a brief restart or network hiccup before presenting it as disconnected.
REMOTE_RECEIVER_CONNECTED_WINDOW = timedelta(minutes=2)
RUNTIME_KEY = f"{DOMAIN}_credential_sharing"
_CREDENTIAL_SHARE_RESPONSE_HEADER = "X-Akuvox-Credential-Share"
_CREDENTIAL_SHARE_REVOKED = "revoked"


def _store(hass: HomeAssistant) -> Store[dict[str, Any]]:
    return Store(hass, SHARE_STORE_VERSION, SHARE_STORE_KEY, private=True, atomic_writes=True)


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def get_external_url(hass: HomeAssistant) -> str:
    """Return Home Assistant's current, HTTPS-reachable public URL."""
    try:
        return get_url(
            hass,
            allow_internal=False,
            prefer_external=True,
            require_ssl=True,
        )
    except NoURLAvailableError as error:
        raise ValueError(
            "Set a valid HTTPS external URL in Home Assistant before creating a pairing link"
        ) from error


def is_remote_entry(entry: ConfigEntry) -> bool:
    return entry.data.get(SHARED_MODE) == SHARED_MODE_REMOTE


def _source_account_label(entry: ConfigEntry, source_client: Any | None) -> str:
    """Return the source hub's display name, with a safe entry-title fallback."""
    if source_client is not None:
        project_name = source_client.get_panel_data().get("project_name")
        if isinstance(project_name, str) and project_name.strip():
            return project_name.strip()
    return entry.title


def _source_device_data(entry: ConfigEntry, source_client: Any | None) -> dict[str, Any]:
    """Return current source devices, retaining a usable cached inventory.

    SmartPlus can briefly return an account payload without its device lists.
    The source panel already treats its saved entry data as a fallback in that
    case.  A remote share must do the same, otherwise one transient response
    clears every device and temporary key on its receivers.
    """
    current = source_client.get_devices_json() if source_client is not None else {}
    current = dict(current) if isinstance(current, dict) else {}
    for key in ("camera_data", "door_relay_data", "door_keys_data"):
        if not current.get(key):
            current[key] = entry.data.get(key, [])
    return current


def _filter_shared_devices(
    device_data: dict[str, Any],
    device_ids: list[str],
    temporary_key_relay_ids: list[str] | None = None,
) -> dict[str, Any]:
    """Return only scoped devices and keys permitted for temporary-key access."""
    allowed = set(device_ids)
    cameras = [item for item in device_data.get("camera_data", []) if f"camera:{item.get('name', '')}" in allowed]
    relays = [item for item in device_data.get("door_relay_data", []) if f"relay:{item.get('mac', '')}:{item.get('relay_id', '')}" in allowed]
    allowed_relays = {f"{item.get('mac', '')}:{item.get('relay_id', '')}" for item in relays}
    if temporary_key_relay_ids is not None:
        allowed_relays.intersection_update(
            item.removeprefix("relay:")
            for item in temporary_key_relay_ids
            if isinstance(item, str) and item.startswith("relay:")
        )
    keys = [
        item for item in device_data.get("door_keys_data", [])
        if item.get("doors") and all(f"{door.get('mac', '')}:{door.get('relay', '')}" in allowed_relays for door in item["doors"])
    ]
    return {**device_data, "camera_data": cameras, "door_relay_data": relays, "door_keys_data": keys}


def _filter_shared_sip_accounts(
    sip_accounts: dict[str, Any], device_data: dict[str, Any]
) -> dict[str, Any]:
    """Return SIP details only for the devices included in a share snapshot."""
    if not isinstance(sip_accounts, dict):
        return {}
    allowed_macs = {
        str(relay.get("mac", "")).strip()
        for relay in device_data.get("door_relay_data", [])
        if isinstance(relay, dict) and str(relay.get("mac", "")).strip()
    }
    allowed_names = {
        str(item.get("name", "")).strip()
        for collection in ("camera_data", "door_relay_data")
        for item in device_data.get(collection, [])
        if isinstance(item, dict) and str(item.get("name", "")).strip()
    }
    devices = [
        {
            key: device.get(key, "")
            for key in ("name", "mac", "account", "password")
        }
        for device in sip_accounts.get("devices", [])
        if isinstance(device, dict)
        and (
            str(device.get("mac", "")).strip() in allowed_macs
            or str(device.get("name", "")).strip() in allowed_names
        )
    ]
    if not devices:
        return {}
    main = sip_accounts.get("main", {})
    return {
        "server": str(sip_accounts.get("server", "")),
        "transport": str(sip_accounts.get("transport", "")),
        "main": {
            "account": str(main.get("account", "")) if isinstance(main, dict) else "",
            "password": str(main.get("password", "")) if isinstance(main, dict) else "",
        },
        "devices": devices,
    }


def _filter_shared_activity(
    activity_data: list[dict[str, Any]], member_names: list[str]
) -> list[dict[str, Any]]:
    """Return activity records initiated by selected family members."""
    allowed = {str(name).strip() for name in member_names if str(name).strip()}
    return [
        item
        for item in activity_data
        if str(item.get("Initiator", "")).strip() in allowed
    ]


def _filter_shared_calls(
    call_data: list[dict[str, Any]], member_names: list[str]
) -> list[dict[str, Any]]:
    """Return calls where a selected family member is caller or callee."""
    allowed = {str(name).strip() for name in member_names if str(name).strip()}
    return [
        item
        for item in call_data
        if str(item.get("callerName", "")).strip() in allowed
        or str(item.get("calleeName", "")).strip() in allowed
    ]


def _permission_relay_ids(share: dict[str, Any], key: str, legacy_flag: str) -> list[str]:
    """Return relay IDs granted for a key operation, including old shares."""
    configured = share.get(key)
    if isinstance(configured, list):
        return [item for item in configured if isinstance(item, str)]
    if not share.get(legacy_flag, True):
        return []
    return [item for item in share.get("device_ids", []) if isinstance(item, str) and item.startswith("relay:")]


async def async_create_share(
    hass: HomeAssistant, entry: ConfigEntry, external_url: str, receiver_name: str,
    device_ids: list[str], allow_create_keys: bool = True,
    allow_edit_keys: bool = True, access_expires_at: str | None = None,
    create_key_relay_ids: list[str] | None = None,
    edit_key_relay_ids: list[str] | None = None,
    view_key_relay_ids: list[str] | None = None,
    activity_member_names: list[str] | None = None,
    call_member_names: list[str] | None = None,
) -> str:
    """Create a ten-minute, one-time pairing URI for one receiving instance."""
    parsed = urlsplit(external_url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValueError("A valid HTTPS Home Assistant external URL is required")
    share_id = secrets.token_urlsafe(18)
    secret = secrets.token_urlsafe(32)
    shares = await _store(hass).async_load() or {}
    normalized_name = receiver_name.strip().casefold()
    if not normalized_name:
        raise ValueError("Enter a receiver name")
    if any(
        share.get("entry_id") == entry.entry_id
        and str(share.get("receiver_name", "")).strip().casefold() == normalized_name
        for share in shares.values()
    ):
        raise ValueError("A paired Home Assistant already uses this receiver name")
    source_client = getattr(hass.data.get(DOMAIN, {}).get(entry.entry_id), "client", None)
    # Persist concrete, scoped relay permissions.  This keeps the receiver
    # fail-closed and avoids accidentally granting a newly added relay.
    shared_relays = {
        item for item in device_ids if isinstance(item, str) and item.startswith("relay:")
    }
    if create_key_relay_ids is None:
        create_key_relay_ids = list(shared_relays) if allow_create_keys else []
    else:
        create_key_relay_ids = [
            item for item in create_key_relay_ids if isinstance(item, str) and item in shared_relays
        ]
    if edit_key_relay_ids is None:
        edit_key_relay_ids = list(shared_relays) if allow_edit_keys else []
    else:
        edit_key_relay_ids = [
            item for item in edit_key_relay_ids if isinstance(item, str) and item in shared_relays
        ]
    if view_key_relay_ids is None:
        view_key_relay_ids = list(shared_relays)
    else:
        view_key_relay_ids = [
            item for item in view_key_relay_ids if isinstance(item, str) and item in shared_relays
        ]
    default_members = (
        source_client.get_panel_data().get("family_members", [])
        if source_client is not None else []
    )
    activity_member_names = sorted({
        name.strip() for name in (default_members if activity_member_names is None else activity_member_names)
        if isinstance(name, str) and name.strip()
    })
    call_member_names = sorted({
        name.strip() for name in (default_members if call_member_names is None else call_member_names)
        if isinstance(name, str) and name.strip()
    })
    shares[share_id] = {
        "entry_id": entry.entry_id,
        "receiver_name": receiver_name.strip() or "Unnamed receiver",
        # The secret embedded in the link is a bootstrap credential only.
        # Its first successful exchange creates a separate receiver secret.
        "pairing_secret_hash": _digest(secret),
        "receiver_secret_hash": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
        "activated": False,
        "revoked": False,
        "last_sync": None,
        "device_ids": device_ids,
        "allow_create_keys": bool(create_key_relay_ids),
        "allow_edit_keys": bool(edit_key_relay_ids),
        "create_key_relay_ids": create_key_relay_ids,
        "edit_key_relay_ids": edit_key_relay_ids,
        "allow_view_keys": bool(view_key_relay_ids),
        "view_key_relay_ids": view_key_relay_ids,
        "allow_activity": bool(activity_member_names),
        "activity_member_names": activity_member_names,
        "allow_call_history": bool(call_member_names),
        "call_member_names": call_member_names,
        "access_expires_at": access_expires_at,
    }
    await _store(hass).async_save(shares)
    return "akuvox-share://v1?" + urlencode({
        "url": external_url.rstrip("/"), "id": share_id, "secret": secret,
    })


async def async_revoke_share(hass: HomeAssistant, share_id: str) -> bool:
    shares = await _store(hass).async_load() or {}
    if share_id not in shares:
        return False
    shares[share_id]["revoked"] = True
    await _store(hass).async_save(shares)
    return True


async def async_delete_share(hass: HomeAssistant, share_id: str) -> bool:
    """Permanently remove a revoked pairing record."""
    shares = await _store(hass).async_load() or {}
    share = shares.get(share_id)
    if not share or not share.get("revoked"):
        return False
    del shares[share_id]
    await _store(hass).async_save(shares)
    return True


async def async_list_shares(hass: HomeAssistant, entry_id: str) -> list[dict[str, Any]]:
    """Return non-secret share status records for one source account."""
    shares = await _store(hass).async_load() or {}
    now = datetime.now(timezone.utc)
    changed = False
    for share in shares.values():
        if share.get("activated") or share.get("revoked"):
            continue
        try:
            expired = datetime.fromisoformat(str(share.get("expires_at", ""))).astimezone(
                timezone.utc
            ) <= now
        except (TypeError, ValueError):
            expired = True
        if expired:
            share["revoked"] = True
            changed = True
    if changed:
        await _store(hass).async_save(shares)

    def connected(share: dict[str, Any]) -> bool:
        if not share.get("activated") or share.get("revoked"):
            return False
        try:
            last_contact = datetime.fromisoformat(str(share.get("last_sync", ""))).astimezone(
                timezone.utc
            )
        except (TypeError, ValueError):
            return False
        return now - last_contact <= REMOTE_RECEIVER_CONNECTED_WINDOW

    return [
        {
            "share_id": share_id,
            "receiver_name": share.get("receiver_name", "Unnamed receiver"),
            "created_at": share.get("created_at"),
            "expires_at": share.get("expires_at"),
            "activated": bool(share.get("activated")),
            "revoked": bool(share.get("revoked")),
            "last_sync": share.get("last_sync"),
            "device_ids": share.get("device_ids"),
            "allow_create_keys": share.get("allow_create_keys", True),
            "allow_edit_keys": share.get("allow_edit_keys", True),
            "create_key_relay_ids": _permission_relay_ids(share, "create_key_relay_ids", "allow_create_keys"),
            "edit_key_relay_ids": _permission_relay_ids(share, "edit_key_relay_ids", "allow_edit_keys"),
            "allow_view_keys": share.get("allow_view_keys", True),
            "view_key_relay_ids": _permission_relay_ids(share, "view_key_relay_ids", "allow_view_keys"),
            "allow_activity": share.get("allow_activity", True),
            "activity_member_names": share.get("activity_member_names", []),
            "allow_call_history": share.get("allow_call_history", False),
            "call_member_names": share.get("call_member_names", []),
            "access_expires_at": share.get("access_expires_at"),
            "connected": connected(share),
        }
        for share_id, share in shares.items()
        if share.get("entry_id") == entry_id
    ]


def parse_pairing_uri(value: str) -> tuple[str, str, str]:
    parsed = urlsplit(value.strip())
    if parsed.scheme != "akuvox-share" or parsed.netloc != "v1":
        raise ValueError("Invalid pairing link")
    query = parse_qs(parsed.query)
    url, share_id, secret = (query.get(key, [""])[0] for key in ("url", "id", "secret"))
    url_parts = urlsplit(url)
    if url_parts.scheme != "https" or not url_parts.netloc or not share_id or not secret:
        raise ValueError("Invalid pairing link")
    return url.rstrip("/"), share_id, secret


async def async_fetch_shared_snapshot(
    hass: HomeAssistant, source_url: str, share_id: str, secret: str, etag: str | None = None
) -> tuple[dict[str, Any] | None, str | None]:
    """Fetch a source snapshot. ``None`` means that the snapshot is unchanged."""
    headers = {"Authorization": f"Bearer {secret}", "Accept": "application/json"}
    if etag:
        headers["If-None-Match"] = etag
    url = f"{source_url}/api/akuvox/credential-share/{quote(share_id, safe='')}"
    timeout = aiohttp.ClientTimeout(total=10)
    async with async_get_clientsession(hass).get(
        url, headers=headers, timeout=timeout, allow_redirects=False
    ) as response:
        if response.status == 304:
            return None, response.headers.get("ETag", etag)
        if response.status == 410:
            raise PermissionError("The pairing link has expired. Generate a new link from the host Home Assistant.")
        if (
            response.status == 403
            and response.headers.get(_CREDENTIAL_SHARE_RESPONSE_HEADER)
            == _CREDENTIAL_SHARE_REVOKED
        ):
            raise PermissionError("The credential share is unavailable or has been revoked")
        if response.status in (401, 403, 404):
            raise OSError("The credential source could not be reached")
        response.raise_for_status()
        payload = await response.json()
        if not isinstance(payload, dict) or not isinstance(payload.get("credentials"), dict):
            raise TypeError("The credential source returned an invalid response")
        return payload, response.headers.get("ETag")


async def async_fetch_shared_image(
    hass: HomeAssistant, source_url: str, share_id: str, secret: str,
    image_type: str, image_id: str,
) -> dict[str, str]:
    """Fetch a host-proxied image without exposing a SmartPlus URL."""
    url = (
        f"{source_url}/api/akuvox/credential-share/{quote(share_id, safe='')}"
        f"/image/{quote(image_type, safe='')}/{quote(image_id, safe='')}"
    )
    timeout = aiohttp.ClientTimeout(total=15)
    async with async_get_clientsession(hass).get(
        url,
        headers={"Authorization": f"Bearer {secret}", "Accept": "application/json"},
        timeout=timeout,
        allow_redirects=False,
    ) as response:
        if response.status in (401, 403, 404, 410):
            raise PermissionError("The shared image is unavailable")
        response.raise_for_status()
        image = await response.json()
        if not isinstance(image, dict) or not isinstance(image.get("data"), str):
            raise TypeError("The credential source returned an invalid image")
        return image


async def async_apply_remote_share_link(
    hass: HomeAssistant, entry: ConfigEntry, pairing_link: str
) -> None:
    """Verify and save a replacement share link without discarding cached data."""
    source_url, share_id, secret = parse_pairing_uri(pairing_link)
    snapshot, _etag = await async_fetch_shared_snapshot(hass, source_url, share_id, secret)
    if snapshot is None:
        raise ValueError("The credential source returned no data for the pairing link")
    receiver_secret = snapshot.get("receiver_secret")
    if receiver_secret is not None and (not isinstance(receiver_secret, str) or not receiver_secret):
        raise ValueError("The credential source returned an invalid receiver secret")
    await async_store_remote_share_secret(hass, entry.entry_id, receiver_secret or secret)
    data = dict(entry.data)
    data.update({"remote_source_url": source_url, "remote_share_id": share_id})
    hass.config_entries.async_update_entry(entry, data=data)
    async_update_credential_source_issue(hass, entry, None)
    synchronizer = hass.data.get(RUNTIME_KEY, {}).get(entry.entry_id)
    if synchronizer is not None:
        await synchronizer.async_replace_share_link(snapshot)


class CredentialShareView(HomeAssistantView):
    """Return a credential snapshot only to a paired receiver."""

    url = "/api/akuvox/credential-share/{share_id}"
    name = "api:akuvox:credential_share"
    requires_auth = False

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._share_locks: dict[str, asyncio.Lock] = {}

    async def get(self, request: web.Request, share_id: str) -> web.Response:
        """Serialize requests for a share while its bootstrap secret is redeemed."""
        lock = self._share_locks.setdefault(share_id, asyncio.Lock())
        async with lock:
            return await self._async_get(request, share_id)

    async def _async_get(self, request: web.Request, share_id: str) -> web.Response:
        """Return the current credential snapshot for one serialized request."""
        shares = await _store(self.hass).async_load() or {}
        share = shares.get(share_id)
        supplied = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        expired = False
        try:
            expired = datetime.fromisoformat(share.get("expires_at", "")).astimezone(timezone.utc) < datetime.now(timezone.utc)
        except (AttributeError, TypeError, ValueError):
            expired = True
        if not share or share.get("revoked") or not supplied:
            return web.Response(
                status=403,
                headers={_CREDENTIAL_SHARE_RESPONSE_HEADER: _CREDENTIAL_SHARE_REVOKED},
            )
        supplied_hash = _digest(supplied)
        # Shares created before one-time links were introduced retain their
        # original receiver secret. New shares exchange their pairing secret
        # exactly once for a private receiver secret.
        legacy_share = "pairing_secret_hash" not in share
        using_receiver_secret = bool(share.get("receiver_secret_hash")) and (
            secrets.compare_digest(
                str(share.get("receiver_secret_hash", "")), supplied_hash
            )
        )
        using_legacy_secret = legacy_share and secrets.compare_digest(
            str(share.get("secret_hash", "")), supplied_hash
        )
        using_pairing_secret = (
            not legacy_share
            and secrets.compare_digest(
                str(share.get("pairing_secret_hash", "")), supplied_hash
            )
        )
        if not (using_receiver_secret or using_legacy_secret or using_pairing_secret):
            return web.Response(
                status=403,
                headers={_CREDENTIAL_SHARE_RESPONSE_HEADER: _CREDENTIAL_SHARE_REVOKED},
            )
        if using_pairing_secret and share.get("activated"):
            # The pairing URI has already exchanged its one-time secret.
            return web.Response(
                status=403,
                headers={_CREDENTIAL_SHARE_RESPONSE_HEADER: _CREDENTIAL_SHARE_REVOKED},
            )
        if expired and not share.get("activated"):
            return web.Response(status=410)
        try:
            access_expired = (
                share.get("access_expires_at")
                and datetime.fromisoformat(share["access_expires_at"]).astimezone(timezone.utc)
                < datetime.now(timezone.utc)
            )
        except (TypeError, ValueError):
            access_expired = False
        if access_expired:
            return web.Response(status=410)
        entry = self.hass.config_entries.async_get_entry(share["entry_id"])
        if entry is None:
            return web.Response(status=404)
        stored_credentials = await async_get_credentials(self.hass, entry.entry_id)
        credentials = {
            key: stored_credentials.get(key, "") for key in ("auth_token", "token")
        }
        if not credentials.get("auth_token") or not credentials.get("token"):
            return web.Response(status=503)
        source_client = getattr(
            self.hass.data.get(DOMAIN, {}).get(entry.entry_id), "client", None
        )
        # The SmartPlus project name is the name shown by the integration hub.
        # Preserve it in each share snapshot so a receiver can keep the right
        # account label even while the source is temporarily unreachable.
        account_label = _source_account_label(entry, source_client)
        device_data = _source_device_data(entry, source_client)
        device_data = filter_disabled_device_data(self.hass, entry, device_data)
        temporary_key_relays = _permission_relay_ids(
            share, "view_key_relay_ids", "allow_view_keys"
        )
        device_data = _filter_shared_devices(
            device_data, share.get("device_ids"), temporary_key_relays
        )
        sip_accounts = _filter_shared_sip_accounts(
            source_client.get_sip_accounts() if source_client is not None else {},
            device_data,
        )
        source_panel_data = (
            filter_disabled_panel_devices(self.hass, entry, source_client.get_panel_data())
            if source_client is not None else {}
        )
        activity_data = _filter_shared_activity(
            source_panel_data.get("activity", []),
            share.get("activity_member_names", []),
        ) if share.get("allow_activity", True) else []
        # Activity preview URLs are cloud credentials in practice.  The
        # receiver receives event metadata only; its panel never exposes the
        # host's image URLs.
        activity_data = [
            {
                **{key: value for key, value in item.items() if key not in {"PicUrl", "LocalPreview"}},
                "has_image": bool(item.get("PicUrl") or item.get("LocalPreview")),
            }
            for item in activity_data
        ]
        call_data = [
            {
                **{
                    key: value
                    for key, value in item.items()
                    if key not in {"picUrl", "smallPicUrl"}
                },
                "has_image": bool(item.get("picUrl") or item.get("smallPicUrl")),
            }
            for item in _filter_shared_calls(
                source_panel_data.get("calls", []),
                share.get("call_member_names", []),
            ) if share.get("allow_call_history", False)
            if isinstance(item, dict)
        ]
        revision = '"' + _digest(
            credentials["auth_token"] + "\0" + credentials["token"] + "\0"
            + repr((share.get("device_ids"), share.get("allow_create_keys"),
                    share.get("allow_edit_keys"), share.get("create_key_relay_ids"),
                    share.get("edit_key_relay_ids"), share.get("allow_view_keys"),
                    share.get("view_key_relay_ids"), share.get("allow_activity"),
                    share.get("activity_member_names"), share.get("allow_call_history"),
                    share.get("call_member_names"), share.get("access_expires_at"),
                    account_label, device_data, sip_accounts, activity_data, call_data))
        ) + '"'
        # A conditional request is still a successful contact from this
        # receiver. Record it before returning 304 so the source UI reflects
        # the last time it checked in, rather than only token rotations.
        receiver_secret: str | None = None
        if using_pairing_secret:
            receiver_secret = secrets.token_urlsafe(32)
            share["receiver_secret_hash"] = _digest(receiver_secret)
        share["activated"] = True
        share["last_sync"] = datetime.now(timezone.utc).isoformat()
        await _store(self.hass).async_save(shares)
        if request.headers.get("If-None-Match") == revision:
            return web.Response(status=304, headers={"ETag": revision, "Cache-Control": "no-store"})
        connection = {key: entry.data.get(key, "") for key in ("host", "subdomain", "country_code", "phone_number")}
        return web.json_response({
            "schema_version": 1,
            "account_label": account_label,
            "share_id": share_id,
            # Sent only on the one-time bootstrap response. The receiver
            # immediately moves this credential to private storage.
            **({"receiver_secret": receiver_secret} if receiver_secret else {}),
            "connection": connection,
            "device_data": device_data,
            "sip_accounts": sip_accounts,
            "activity_data": activity_data,
            "call_data": call_data,
            "permissions": {
                "allow_create_keys": share.get("allow_create_keys", True),
                "allow_edit_keys": share.get("allow_edit_keys", True),
                "create_key_relay_ids": _permission_relay_ids(share, "create_key_relay_ids", "allow_create_keys"),
                "edit_key_relay_ids": _permission_relay_ids(share, "edit_key_relay_ids", "allow_edit_keys"),
                "allow_view_keys": share.get("allow_view_keys", True),
                "view_key_relay_ids": _permission_relay_ids(share, "view_key_relay_ids", "allow_view_keys"),
                "allow_activity": share.get("allow_activity", True),
                "activity_member_names": share.get("activity_member_names", []),
                "allow_call_history": share.get("allow_call_history", False),
                "call_member_names": share.get("call_member_names", []),
            },
            "credentials": credentials,
        }, headers={"ETag": revision, "Cache-Control": "no-store"})


class CredentialShareImageView(HomeAssistantView):
    """Proxy authorised images and temporary-key QR codes for a paired receiver."""

    url = "/api/akuvox/credential-share/{share_id}/image/{image_type}/{image_id}"
    name = "api:akuvox:credential_share_image"
    requires_auth = False

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def get(
        self, request: web.Request, share_id: str, image_type: str, image_id: str
    ) -> web.Response:
        shares = await _store(self.hass).async_load() or {}
        share = shares.get(share_id)
        supplied = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        if not share or share.get("revoked") or not supplied:
            return web.Response(status=403)
        supplied_hash = _digest(supplied)
        legacy_share = "pairing_secret_hash" not in share
        authorised = (
            legacy_share and secrets.compare_digest(str(share.get("secret_hash", "")), supplied_hash)
        ) or (
            bool(share.get("receiver_secret_hash"))
            and secrets.compare_digest(str(share.get("receiver_secret_hash", "")), supplied_hash)
        )
        if not authorised:
            return web.Response(status=403)
        entry = self.hass.config_entries.async_get_entry(share.get("entry_id"))
        source_client = getattr(
            self.hass.data.get(DOMAIN, {}).get(getattr(entry, "entry_id", "")), "client", None
        )
        if entry is None or source_client is None:
            return web.Response(status=404)
        try:
            if image_type == "activity":
                if not share.get("allow_activity", True):
                    return web.Response(status=403)
                activity = next(
                    (
                        item for item in filter_disabled_panel_devices(
                            self.hass, entry, source_client.get_panel_data()
                        ).get("activity", [])
                        if str(item.get("CaptureTime", "")) == image_id
                    ),
                    None,
                )
                if (
                    activity is None
                    or str(activity.get("Initiator", "")).strip()
                    not in share.get("activity_member_names", [])
                ):
                    return web.Response(status=404)
                image = await source_client.async_get_panel_activity_image(image_id)
            elif image_type == "call":
                if not share.get("allow_call_history", False):
                    return web.Response(status=403)
                calls = _filter_shared_calls(
                    filter_disabled_panel_devices(
                        self.hass, entry, source_client.get_panel_data()
                    ).get("calls", []),
                    share.get("call_member_names", []),
                )
                if not any(str(item.get("id", "")) == image_id for item in calls):
                    return web.Response(status=404)
                image = await source_client.async_get_panel_call_image(image_id)
            elif image_type == "temp_key_qr":
                if not share.get("allow_view_keys", True):
                    return web.Response(status=403)
                if not any(
                    str(item.get("key_id", "")) == image_id
                    for item in filter_disabled_panel_devices(
                        self.hass, entry, source_client.get_panel_data()
                    ).get("temporary_keys", [])
                ):
                    return web.Response(status=404)
                image = await source_client.async_get_panel_temp_key_qr(image_id)
            else:
                return web.Response(status=404)
        except Exception as error:
            LOGGER.debug("Unable to retrieve shared %s image: %s", image_type, error)
            return web.Response(status=404)
        return web.json_response(image, headers={"Cache-Control": "no-store"})


def async_register_share_view(hass: HomeAssistant) -> None:
    runtime = hass.data.setdefault(RUNTIME_KEY, {})
    if runtime.get("_credential_share_view_registered"):
        return
    hass.http.register_view(CredentialShareView(hass))
    hass.http.register_view(CredentialShareImageView(hass))
    runtime["_credential_share_view_registered"] = True


def async_register_remote_synchronizer(hass: HomeAssistant, entry: ConfigEntry, client: Any) -> RemoteCredentialSynchronizer:
    synchronizer = RemoteCredentialSynchronizer(hass, entry, client)
    hass.data.setdefault(RUNTIME_KEY, {})[entry.entry_id] = synchronizer
    return synchronizer


async def async_sync_remote_entry(hass: HomeAssistant, entry_id: str) -> bool:
    synchronizer = hass.data.get(RUNTIME_KEY, {}).get(entry_id)
    if synchronizer is None:
        raise PermissionError("The shared credential source is not configured")
    return await synchronizer.async_sync()


async def async_remove_remote_synchronizer(hass: HomeAssistant, entry_id: str) -> None:
    synchronizer = hass.data.get(RUNTIME_KEY, {}).pop(entry_id, None)
    if synchronizer is not None:
        await synchronizer.async_stop()


class RemoteCredentialSynchronizer:
    """Keep a remote-mode entry current without ever refreshing SmartPlus itself."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, client: Any) -> None:
        self.hass, self.entry, self.client = hass, entry, client
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()
        self._etag: str | None = None
        self.last_successful_sync: datetime | None = None

    async def async_sync(self) -> bool:
        secret = await async_get_remote_share_secret(self.hass, self.entry.entry_id)
        if not isinstance(secret, str) or not secret:
            raise PermissionError("The pairing secret is missing")
        snapshot, self._etag = await async_fetch_shared_snapshot(
            self.hass, str(self.entry.data["remote_source_url"]), str(self.entry.data["remote_share_id"]), secret, self._etag
        )
        # A 304 response is still a successful connection to the host.
        self.last_successful_sync = datetime.now(timezone.utc)
        if snapshot is None:
            async_update_credential_source_issue(self.hass, self.entry, None)
            return False
        return await self._async_apply_snapshot(snapshot)

    async def _async_apply_snapshot(self, snapshot: dict[str, Any]) -> bool:
        """Apply one validated snapshot to the remote account and panel cache."""
        credentials = snapshot["credentials"]
        receiver_secret = snapshot.get("receiver_secret")
        if receiver_secret is not None and (
            not isinstance(receiver_secret, str) or not receiver_secret
        ):
            raise PermissionError("The credential source returned an invalid receiver secret")
        if receiver_secret:
            await async_store_remote_share_secret(
                self.hass, self.entry.entry_id, receiver_secret
            )
        await async_store_credentials(self.hass, self.entry.entry_id, credentials["auth_token"], credentials["token"])
        self.client.async_apply_shared_credentials(credentials["auth_token"], credentials["token"])
        self.client.async_apply_shared_sip_accounts(snapshot.get("sip_accounts", {}))
        device_data = snapshot.get("device_data")
        if isinstance(device_data, dict):
            data = dict(self.entry.data)
            data.update({key: device_data.get(key, []) for key in ("camera_data", "door_relay_data", "door_keys_data")})
            data["activity_data"] = snapshot.get("activity_data", [])
            data["call_data"] = snapshot.get("call_data", [])
            data["shared_permissions"] = snapshot.get("permissions", {})
            account_label = snapshot.get("account_label")
            if isinstance(account_label, str) and account_label.strip():
                data["hub_name"] = account_label.strip()
            await storage.Store(
                self.hass, 1, account_storage_key(self.entry.entry_id, "cache")
            ).async_save(device_data)
            self.client.skip_next_entry_reload()
            self.hass.config_entries.async_update_entry(self.entry, data=data)
        async_update_credential_source_issue(self.hass, self.entry, None)
        return True

    async def async_replace_share_link(self, snapshot: dict[str, Any]) -> None:
        """Apply a replacement link's verified snapshot before resuming syncs."""
        self._etag = None
        if self._task is not None and not self._task.done():
            self._task.cancel()
            with suppress(asyncio.CancelledError):
                await self._task
            self._task = None
        await self._async_apply_snapshot(snapshot)
        self.async_start()

    def async_start(self) -> None:
        if self._task is None or self._task.done():
            self._stop.clear()
            self._task = self.hass.async_create_task(self._run())

    async def async_stop(self) -> None:
        self._stop.set()
        if self._task:
            self._task.cancel()
            with suppress(asyncio.CancelledError):
                await self._task

    async def _run(self) -> None:
        while not self._stop.is_set():
            try:
                await self.async_sync()
            except PermissionError as error:
                async_update_credential_source_issue(self.hass, self.entry, "revoked")
                self.client.async_disable_shared_credentials()
                LOGGER.warning("Shared Akuvox credential access was revoked: %s", error)
                return
            except Exception as error:  # The cached session remains usable.
                async_update_credential_source_issue(self.hass, self.entry, "unreachable")
                LOGGER.warning("Unable to synchronize shared Akuvox credentials: %s", error)
            with suppress(asyncio.TimeoutError):
                await asyncio.wait_for(self._stop.wait(), DEFAULT_SYNC_INTERVAL)
