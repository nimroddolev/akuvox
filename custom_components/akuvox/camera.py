"""Camera platform for akuvox."""

from collections.abc import Callable, Awaitable

from haffmpeg.tools import IMAGE_JPEG
from homeassistant.components.ffmpeg import async_get_image
from homeassistant.helpers import storage
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.const import ATTR_IDENTIFIERS, CONF_NAME, CONF_VERIFY_SSL
from homeassistant.core import HomeAssistant
from homeassistant.components.camera import CameraCapabilities
from homeassistant.components.camera.const import StreamType
from homeassistant.components.generic.camera import GenericCamera

from .const import DOMAIN, LOGGER, NAME, VERSION, DATA_STORAGE_KEY


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

    async def async_camera_image(
        self, width: int | None = None, height: int | None = None
    ) -> bytes | None:
        """Capture a JPEG directly from Akuvox's RTSP endpoint.

        The stream proxy's MJPEG path cannot negotiate the cloud endpoint's
        transport response. Home Assistant's FFmpeg helper can capture a
        frame directly with the same UDP transport that succeeds for Akuvox.
        """
        try:
            return await async_get_image(
                self.hass,
                self._rtsp_url,
                output_format=IMAGE_JPEG,
                extra_cmd="-rtsp_transport udp",
                width=width,
                height=height,
            )
        except Exception as error:  # The camera proxy requires None on failure.
            LOGGER.debug("Unable to capture Akuvox camera snapshot: %s", error)
            return None
