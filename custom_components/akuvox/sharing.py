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
from homeassistant.helpers.storage import Store

from .const import DOMAIN, LOGGER
from .credentials import async_get_credentials, async_get_remote_share_secret, async_store_credentials
from .repairs import async_update_credential_source_issue

SHARED_MODE = "credential_mode"
SHARED_MODE_REMOTE = "remote"
SHARED_SECRET = "remote_share_secret"
SHARE_STORE_KEY = f"{DOMAIN}.credential_shares"
SHARE_STORE_VERSION = 1
DEFAULT_SYNC_INTERVAL = 15
RUNTIME_KEY = f"{DOMAIN}_credential_sharing"


def _store(hass: HomeAssistant) -> Store[dict[str, Any]]:
    return Store(hass, SHARE_STORE_VERSION, SHARE_STORE_KEY, private=True, atomic_writes=True)


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def is_remote_entry(entry: ConfigEntry) -> bool:
    return entry.data.get(SHARED_MODE) == SHARED_MODE_REMOTE


async def async_create_share(
    hass: HomeAssistant, entry: ConfigEntry, external_url: str, receiver_name: str
) -> str:
    """Create a ten-minute, one-time pairing URI for one receiving instance."""
    parsed = urlsplit(external_url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValueError("A valid HTTPS Home Assistant external URL is required")
    share_id = secrets.token_urlsafe(18)
    secret = secrets.token_urlsafe(32)
    shares = await _store(hass).async_load() or {}
    shares[share_id] = {
        "entry_id": entry.entry_id,
        "receiver_name": receiver_name.strip() or "Unnamed receiver",
        "secret_hash": _digest(secret),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
        "activated": False,
        "revoked": False,
        "last_sync": None,
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
    return [
        {
            "share_id": share_id,
            "receiver_name": share.get("receiver_name", "Unnamed receiver"),
            "expires_at": share.get("expires_at"),
            "activated": bool(share.get("activated")),
            "revoked": bool(share.get("revoked")),
            "last_sync": share.get("last_sync"),
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
        entry = self.hass.config_entries.async_get_entry(share["entry_id"])
        if entry is None:
            return web.Response(status=404)
        stored_credentials = await async_get_credentials(self.hass, entry.entry_id)
        credentials = {
            key: stored_credentials.get(key, "") for key in ("auth_token", "token")
        }
        if not credentials.get("auth_token") or not credentials.get("token"):
            return web.Response(status=503)
        revision = '"' + _digest(credentials["auth_token"] + "\0" + credentials["token"]) + '"'
        if request.headers.get("If-None-Match") == revision:
            return web.Response(status=304, headers={"ETag": revision, "Cache-Control": "no-store"})
        share["activated"] = True
        share["last_sync"] = datetime.now(timezone.utc).isoformat()
        await _store(self.hass).async_save(shares)
        connection = {key: entry.data.get(key, "") for key in ("host", "subdomain", "country_code", "phone_number")}
        source_client = getattr(
            self.hass.data.get(DOMAIN, {}).get(entry.entry_id), "client", None
        )
        device_data = (
            source_client.get_devices_json() if source_client is not None else {
                key: entry.data.get(key, [])
                for key in ("camera_data", "door_relay_data", "door_keys_data")
            }
        )
        return web.json_response({
            "schema_version": 1,
            "account_label": entry.title,
            "share_id": share_id,
            "connection": connection,
            "device_data": device_data,
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

    async def async_sync(self) -> bool:
        secret = await async_get_remote_share_secret(self.hass, self.entry.entry_id)
        if not isinstance(secret, str) or not secret:
            raise PermissionError("The pairing secret is missing")
        snapshot, self._etag = await async_fetch_shared_snapshot(
            self.hass, str(self.entry.data["remote_source_url"]), str(self.entry.data["remote_share_id"]), secret, self._etag
        )
        if snapshot is None:
            return False
        credentials = snapshot["credentials"]
        await async_store_credentials(self.hass, self.entry.entry_id, credentials["auth_token"], credentials["token"])
        self.client.async_apply_shared_credentials(credentials["auth_token"], credentials["token"])
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
