"""Camera platform for akuvox."""

from collections.abc import Callable, Awaitable
from contextvars import ContextVar
import asyncio

from haffmpeg.tools import IMAGE_JPEG, ImageFrame
from homeassistant.components.ffmpeg import get_ffmpeg_manager
from homeassistant.helpers import storage
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.const import ATTR_IDENTIFIERS, CONF_NAME, CONF_VERIFY_SSL
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.components.camera import CameraCapabilities
from homeassistant.components.camera.const import StreamType
from homeassistant.components.generic.camera import GenericCamera

from .const import DOMAIN, LOGGER, NAME, VERSION, account_storage_key
from .camera_snapshot import CameraSnapshotCache
from .camera_stream import called_from_homekit as _called_from_homekit, stream_name, managed_restream_url

# Set while HA's own stream worker asks for the source, which needs the plain
# RTSP URL rather than the go2rtc ffmpeg form.
_GO2RTC_TIMEOUT = 3
_DIRECT_SOURCE: ContextVar[bool] = ContextVar("akuvox_direct_source", default=False)


async def async_setup_entry(hass: HomeAssistant,
                            entry,
                            async_add_devices: Callable[[list], Awaitable[None]]):
    """Set up the camera platform."""
    store = storage.Store(hass, 1, account_storage_key(entry.entry_id, "cache"))
    device_data = await store.async_load()
    if not isinstance(device_data, dict):
        device_data = dict(entry.data)

    if not device_data:
        LOGGER.error("No device data found")
        return

    cameras_data = device_data.get("camera_data")
    if not cameras_data:
        LOGGER.error("No camera data found in device data")
        return

    entities = []
    for camera_data in cameras_data:
        name = str(camera_data["name"]).strip()
        rtsp_url = str(camera_data["video_url"]).strip()
        entities.append(AkuvoxCameraEntity(
            hass=hass,
            entry=entry,
            name=name,
            rtsp_url=rtsp_url
        ))

    if async_add_devices is None:
        LOGGER.error("async_add_devices is None")
        return

    async_add_devices(entities)
    return True

class AkuvoxCameraEntity(GenericCamera):
    """Akuvox camera class."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry | str,
        name: str,
        rtsp_url: str | None = None,
    ) -> None:
        """Initialize the Akuvox camera class."""
        # Preserve the legacy public constructor used by existing custom
        # automations and tests: ``(hass, name, rtsp_url)``.
        if rtsp_url is None:
            rtsp_url = name
            name = str(entry)
            entry = None
        entry_id = str(getattr(entry, "entry_id", ""))
        identity = f"{entry_id}:{name}" if entry_id else name
        LOGGER.debug("Adding Akuvox camera '%s'", name)

        super().__init__(
            hass=hass,
            device_info={
                ATTR_IDENTIFIERS: {(DOMAIN, identity)},
                CONF_NAME: name,
                "stream_source": rtsp_url,
                "content_type": "image/jpeg",
                # HA's generic camera moved these options into a nested
                # "advanced" section (SECTION_ADVANCED). Passing them flat
                # raises KeyError: 'advanced' on current HA versions.
                "advanced": {
                    "limit_refetch_to_url_change": True,
                    "framerate": 2,
                    CONF_VERIFY_SSL: False,
                    "rtsp_transport": "udp",
                },
            },
            identifier=identity,
            title=name,
        )

        self._name = name
        self._rtsp_url = rtsp_url
        self._attr_unique_id = identity
        self._attr_name = name
        self._snapshot_cache = CameraSnapshotCache(hass, self._async_capture_snapshot, name)
        self._go2rtc_lock = asyncio.Lock()
        self._go2rtc_clients: list = []
        self._go2rtc_stopped = False


        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, identity)},
            name=name,
            model=VERSION,
            manufacturer=NAME,
        )

    @property
    def camera_capabilities(self) -> CameraCapabilities:
        """Offer HLS only because the cloud RTSP audio path is malformed.

        Home Assistant's go2rtc provider otherwise offers WebRTC and starts a
        second FFmpeg audio producer. Akuvox's virtual cloud RTSP endpoint
        rejects that producer's transport negotiation after the video starts.
        """
        return CameraCapabilities({StreamType.HLS})

    @property
    def use_stream_for_stills(self) -> bool:
        """Use the direct FFmpeg snapshot implementation below."""
        return False

    async def async_added_to_hass(self) -> None:
        """Warm the snapshot cache after Home Assistant registers the camera."""
        await super().async_added_to_hass()
        self._snapshot_cache.start()

    async def async_will_remove_from_hass(self) -> None:
        """Cancel captures and remove this camera's private go2rtc aliases."""
        self._go2rtc_stopped = True
        await self._snapshot_cache.stop()
        async with self._go2rtc_lock:
            for client in self._go2rtc_clients:
                try:
                    async with asyncio.timeout(8):
                        response = await client._client.request(
                            "DELETE", "/api/streams", params={"src": self._go2rtc_stream_name}
                        )
                        response.release()
                except Exception as error:
                    LOGGER.debug("Unable to remove Akuvox go2rtc stream: %s", error)
            self._go2rtc_clients.clear()
        await super().async_will_remove_from_hass()

    async def async_camera_image(
        self, width: int | None = None, height: int | None = None
    ) -> bytes | None:
        """Return a bounded-age full-resolution snapshot for any camera caller."""
        return await self._snapshot_cache.get()

    def _go2rtc_client(self):
        """REST client of HA's built-in go2rtc, if go2rtc serves this camera."""
        provider = getattr(self, "webrtc_provider", None) or getattr(self, "_webrtc_provider", None)
        client = getattr(provider, "_rest_client", None)  # pylint: disable=protected-access
        if client is not None and hasattr(client, "streams") and hasattr(client, "get_jpeg_snapshot"):
            return client
        return None

    @property
    def _go2rtc_stream_name(self) -> str:
        """A URL-safe go2rtc stream name for HomeKit and snapshots."""
        return stream_name(self.unique_id)

    async def _async_ensure_go2rtc_stream(self, client) -> str | None:
        """Register a video-only go2rtc stream (once) and return its name.

        Video only: the cloud relay rejects the extra audio producer HA's own
        go2rtc registration adds. HomeKit gets audio disabled anyway.
        """
        if not self._rtsp_url or self._go2rtc_stopped:
            return None
        async with self._go2rtc_lock:
            if self._go2rtc_stopped:
                return None
            name = self._go2rtc_stream_name
            source = f"ffmpeg:{self._rtsp_url}#input=rtsp/udp"
            streams = await client.streams.list()
            stream = streams.get(name)
            if not any(existing is client for existing in self._go2rtc_clients):
                self._go2rtc_clients.append(client)
            if stream is None or not any(source == producer.url for producer in stream.producers):
                await client.streams.add(name, [source])
            return name

    async def _async_capture_snapshot(self) -> bytes | None:
        """Prefer the provider's snapshot endpoint, with a direct UDP fallback."""
        if client := self._go2rtc_client():
            try:
                # Reserve time for direct capture if an unavailable provider stalls.
                async with asyncio.timeout(_GO2RTC_TIMEOUT):
                    if name := await self._async_ensure_go2rtc_stream(client):
                        if image := await client.get_jpeg_snapshot(name, None, None):
                            return image
            except Exception as error:
                LOGGER.debug("Akuvox snapshot via go2rtc failed for %s: %s", self._name, error)
        return await self._async_direct_snapshot()

    async def _async_direct_snapshot(self) -> bytes | None:
        """Capture a JPEG directly from Akuvox's RTSP endpoint.

        The stream proxy's MJPEG path cannot negotiate the cloud endpoint's
        transport response. Home Assistant's FFmpeg helper can capture a
        frame directly with the same UDP transport that succeeds for Akuvox.
        """
        try:
            ffmpeg = ImageFrame(get_ffmpeg_manager(self.hass).binary)
            return await ffmpeg.get_image(
                f"-rtsp_transport udp -i {self._rtsp_url}",
                output_format=IMAGE_JPEG,
                timeout=8,
            )
        except Exception as error:  # The camera proxy requires None on failure.
            LOGGER.debug("Unable to capture Akuvox camera snapshot: %s", error)
            return None

    async def _async_homekit_source(self, source: str) -> str:
        """Point HomeKit at go2rtc's restream so it shares one working connection."""
        provider = getattr(self, "webrtc_provider", None) or getattr(self, "_webrtc_provider", None)
        # An external server's RTSP port and credentials cannot be inferred from its API URL.
        restream = managed_restream_url(provider, self._go2rtc_stream_name)
        client = self._go2rtc_client()
        if client is None or restream is None:
            return source
        try:
            async with asyncio.timeout(_GO2RTC_TIMEOUT):
                name = await self._async_ensure_go2rtc_stream(client)
        except Exception as error:  # pylint: disable=broad-except
            LOGGER.warning("Akuvox: couldn't register stream with go2rtc, HomeKit uses the relay directly: %s", error)
            return source
        return restream if name else source

    async def async_create_stream(self):
        """Create the HA stream worker from the plain RTSP source."""
        token = _DIRECT_SOURCE.set(True)
        try:
            return await super().async_create_stream()
        finally:
            _DIRECT_SOURCE.reset(token)

    async def stream_source(self) -> str | None:
        """Return the stream source."""
        source = await super().stream_source()
        if (source and not _DIRECT_SOURCE.get()
                and "go2rtc" in self.hass.config.components
                and _called_from_homekit()):
            return await self._async_homekit_source(source)
        if (source and not _DIRECT_SOURCE.get()
                and "go2rtc" in self.hass.config.components):
            # The SmartPlus RTSP relay only offers UDP transport, which
            # go2rtc's native RTSP client cannot use; have go2rtc pull it
            # through ffmpeg over UDP instead.
            return f"ffmpeg:{source}#input=rtsp/udp"
        return source
