"""HomeKit caller and go2rtc stream identity helpers."""
from __future__ import annotations

import hashlib
import sys
from urllib.parse import urlsplit


def called_from_homekit() -> bool:
    """Recognise direct HomeKit callers without changing other stream consumers."""
    frame = sys._getframe(1)
    while frame is not None:
        module = frame.f_globals.get("__name__", "")
        if module == "homeassistant.components.homekit" or module.startswith("homeassistant.components.homekit."):
            return True
        frame = frame.f_back
    return False


def stream_name(identity: str) -> str:
    """Keep names stable, URL-safe, and isolated across accounts and Unicode names."""
    return "akuvox_hk_" + hashlib.sha256(identity.encode("utf-8")).hexdigest()[:32]


def managed_restream_url(provider, name: str) -> str | None:
    """Use the known RTSP port only for Home Assistant's managed go2rtc server."""
    try:
        url = urlsplit(str(getattr(provider, "_url", "")))
        port = url.port
    except ValueError:
        return None
    if (url.scheme == "http" and url.hostname == "localhost" and port == 11984
            and url.path in ("", "/") and not url.username and not url.query):
        return f"rtsp://127.0.0.1:18554/{name}"
    return None
