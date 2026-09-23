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
from homeassistant.helpers.storage import Store

from .const import DOMAIN, LOGGER, account_storage_key
from .credentials import async_get_credentials, async_get_remote_share_secret, async_store_credentials
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


def _store(hass: HomeAssistant) -> Store[dict[str, Any]]:
    return Store(hass, SHARE_STORE_VERSION, SHARE_STORE_KEY, private=True, atomic_writes=True)


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def is_remote_entry(entry: ConfigEntry) -> bool:
    return entry.data.get(SHARED_MODE) == SHARED_MODE_REMOTE


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


def _filter_shared_activity(
    activity_data: list[dict[str, Any]], activity_device_names: list[str]
) -> list[dict[str, Any]]:
    """Return activity records associated with the selected device names."""
    allowed = {str(name).strip() for name in activity_device_names if str(name).strip()}
    return [
        item
        for item in activity_data
        if str(item.get("Location", "")).strip() in allowed
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
    allow_activity: bool = True,
    activity_device_names: list[str] | None = None,
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
    entry_data = entry.data if isinstance(entry.data, dict) else {}
    shared_activity_devices = {
        item.removeprefix("camera:")
        for item in device_ids
        if isinstance(item, str) and item.startswith("camera:")
    }
    shared_activity_devices.update(
        str(item.get("source_name") or item.get("name") or "").strip()
        for item in entry_data.get("door_relay_data", [])
        if f"relay:{item.get('mac', '')}:{item.get('relay_id', '')}" in shared_relays
    )
    shared_activity_devices.discard("")
    activity_device_names = [
        name.strip()
        for name in (activity_device_names or [])
        if isinstance(name, str) and name.strip() in shared_activity_devices
    ]
    shares[share_id] = {
        "entry_id": entry.entry_id,
        "receiver_name": receiver_name.strip() or "Unnamed receiver",
        "secret_hash": _digest(secret),
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
        "allow_activity": bool(allow_activity and activity_device_names),
        "activity_device_names": activity_device_names,
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
            "activity_device_names": share.get("activity_device_names", []),
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
        if response.status in (401, 403, 404, 410):
            raise PermissionError("The credential share is unavailable or has been revoked")
        response.raise_for_status()
        payload = await response.json()
        if not isinstance(payload, dict) or not isinstance(payload.get("credentials"), dict):
            raise TypeError("The credential source returned an invalid response")
        return payload, response.headers.get("ETag")


class CredentialShareView(HomeAssistantView):
    """Return a credential snapshot only to a paired receiver."""

    url = "/api/akuvox/credential-share/{share_id}"
    name = "api:akuvox:credential_share"
    requires_auth = False

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def get(self, request: web.Request, share_id: str) -> web.Response:
        shares = await _store(self.hass).async_load() or {}
        share = shares.get(share_id)
        supplied = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        expired = False
        try:
            expired = datetime.fromisoformat(share.get("expires_at", "")).astimezone(timezone.utc) < datetime.now(timezone.utc)
        except (AttributeError, TypeError, ValueError):
            expired = True
        if not share or share.get("revoked") or not supplied or not secrets.compare_digest(
            str(share.get("secret_hash", "")), _digest(supplied)
        ):
            return web.Response(status=403)
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
        device_data = (
            source_client.get_devices_json() if source_client is not None else {
                key: entry.data.get(key, [])
                for key in ("camera_data", "door_relay_data", "door_keys_data")
            }
        )
        temporary_key_relays = _permission_relay_ids(
            share, "view_key_relay_ids", "allow_view_keys"
        )
        device_data = _filter_shared_devices(
            device_data, share.get("device_ids"), temporary_key_relays
        )
        activity_data = _filter_shared_activity(
            source_client.get_panel_data().get("activity", []) if source_client is not None else [],
            share.get("activity_device_names", []),
        ) if share.get("allow_activity", True) else []
        # Activity preview URLs are cloud credentials in practice.  The
        # receiver receives event metadata only; its panel never exposes the
        # host's image URLs.
        activity_data = [
            {key: value for key, value in item.items() if key not in {"PicUrl", "LocalPreview"}}
            for item in activity_data
        ]
        revision = '"' + _digest(
            credentials["auth_token"] + "\0" + credentials["token"] + "\0"
            + repr((share.get("device_ids"), share.get("allow_create_keys"),
                    share.get("allow_edit_keys"), share.get("create_key_relay_ids"),
                    share.get("edit_key_relay_ids"), share.get("allow_view_keys"),
                    share.get("view_key_relay_ids"), share.get("allow_activity"),
                    share.get("activity_device_names"), share.get("access_expires_at"),
                    device_data, activity_data))
        ) + '"'
        # A conditional request is still a successful contact from this
        # receiver. Record it before returning 304 so the source UI reflects
        # the last time it checked in, rather than only token rotations.
        share["activated"] = True
        share["last_sync"] = datetime.now(timezone.utc).isoformat()
        await _store(self.hass).async_save(shares)
        if request.headers.get("If-None-Match") == revision:
            return web.Response(status=304, headers={"ETag": revision, "Cache-Control": "no-store"})
        connection = {key: entry.data.get(key, "") for key in ("host", "subdomain", "country_code", "phone_number")}
        return web.json_response({
            "schema_version": 1,
            "account_label": entry.title,
            "share_id": share_id,
            "connection": connection,
            "device_data": device_data,
            "activity_data": activity_data,
            "permissions": {
                "allow_create_keys": share.get("allow_create_keys", True),
                "allow_edit_keys": share.get("allow_edit_keys", True),
                "create_key_relay_ids": _permission_relay_ids(share, "create_key_relay_ids", "allow_create_keys"),
                "edit_key_relay_ids": _permission_relay_ids(share, "edit_key_relay_ids", "allow_edit_keys"),
                "allow_view_keys": share.get("allow_view_keys", True),
                "view_key_relay_ids": _permission_relay_ids(share, "view_key_relay_ids", "allow_view_keys"),
                "allow_activity": share.get("allow_activity", True),
                "activity_device_names": share.get("activity_device_names", []),
            },
            "credentials": credentials,
        }, headers={"ETag": revision, "Cache-Control": "no-store"})


def async_register_share_view(hass: HomeAssistant) -> None:
    runtime = hass.data.setdefault(RUNTIME_KEY, {})
    if runtime.get("_credential_share_view_registered"):
        return
    hass.http.register_view(CredentialShareView(hass))
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
        credentials = snapshot["credentials"]
        await async_store_credentials(self.hass, self.entry.entry_id, credentials["auth_token"], credentials["token"])
        self.client.async_apply_shared_credentials(credentials["auth_token"], credentials["token"])
        device_data = snapshot.get("device_data")
        if isinstance(device_data, dict):
            data = dict(self.entry.data)
            data.update({key: device_data.get(key, []) for key in ("camera_data", "door_relay_data", "door_keys_data")})
            data["activity_data"] = snapshot.get("activity_data", [])
            data["shared_permissions"] = snapshot.get("permissions", {})
            await storage.Store(
                self.hass, 1, account_storage_key(self.entry.entry_id, "cache")
            ).async_save(device_data)
            self.client.skip_next_entry_reload()
            self.hass.config_entries.async_update_entry(self.entry, data=data)
        async_update_credential_source_issue(self.hass, self.entry, None)
        return True

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
