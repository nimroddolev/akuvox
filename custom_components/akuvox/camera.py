"""Camera platform for akuvox."""

from collections.abc import Callable, Awaitable
from contextvars import ContextVar

from homeassistant.helpers import storage
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.const import ATTR_IDENTIFIERS, CONF_NAME, CONF_VERIFY_SSL
from homeassistant.core import HomeAssistant
from homeassistant.components.generic.camera import GenericCamera

from .const import DOMAIN, LOGGER, NAME, VERSION, DATA_STORAGE_KEY

# Set while HA's own stream worker asks for the source, which needs the plain
# RTSP URL rather than the go2rtc ffmpeg form.
_DIRECT_SOURCE: ContextVar[bool] = ContextVar("akuvox_direct_source", default=False)


async def async_setup_entry(hass: HomeAssistant,
                            _entry,
                            async_add_devices: Callable[[list], Awaitable[None]]):
    """Set up the camera platform."""
    store = storage.Store(hass, 1, DATA_STORAGE_KEY)
    device_data = await store.async_load()

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
        name: str,
        rtsp_url: str) -> None:
        """Initialize the Akuvox camera class."""
        LOGGER.debug("Adding Akuvox camera '%s'", name)

        super().__init__(
            hass=hass,
            device_info={
                ATTR_IDENTIFIERS: {(DOMAIN, name)},
                CONF_NAME: name,
                "stream_source": rtsp_url,
                "content_type": "",
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
            identifier=name,
            title=name,
        )

        self._name = name
        self._rtsp_url = rtsp_url
        self._attr_unique_id = name
        self._attr_name = name

        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, name)},
            name=name,
            model=VERSION,
            manufacturer=NAME,
        )

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
                and "go2rtc" in self.hass.config.components):
            # The SmartPlus RTSP relay only offers UDP transport, which
            # go2rtc's native RTSP client cannot use; have go2rtc pull it
            # through ffmpeg over UDP instead.
            return f"ffmpeg:{source}#input=rtsp/udp"
        return source
