"""Camera platform for akuvox."""
from homeassistant.components.generic.camera import GenericCamera
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.const import (
    CONF_NAME,
    CONF_VERIFY_SSL,
)

from .const import (DOMAIN,
                    LOGGER,
                    NAME,
                    VERSION)


async def async_setup_entry(hass, entry, async_add_devices):
    """Set up the camera platform."""
    entry.data.get("devices", [])

    cameras_data = entry.data.get("camera_data", [])
    entities = []

    for camera_data in cameras_data:
        name = camera_data["name"]
        rtsp_url = camera_data["video_url"]
        entities.append(AkuvoxCameraEntity(name=name, rtsp_url=rtsp_url))

    async_add_devices(entities)


class AkuvoxCameraEntity(GenericCamera):
    """Akuvox camera class."""

    def __init__(
        self,
        name: str,
        rtsp_url: str,
    ) -> None:
        """Initialize the Akuvox camera class."""
        super().__init__(
            hass=self.hass,
            device_info={
                CONF_NAME: name,
                "stream_source": rtsp_url,
                "limit_refetch_to_url_change": True,
                "framerate": 2,
                "content_type": "",
                CONF_VERIFY_SSL: False,
            },
            identifier=name,
            title=name,
        )

        self._name = name
        self._rtsp_url = rtsp_url
        self._rtsp_to_webrtc = True

        self._attr_unique_id = name
        self._attr_name = name

        LOGGER.debug("Adding Akuvox camera '%s'", self._attr_unique_id)
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, name)},  # type: ignore
            name=name,
            model=VERSION,
            manufacturer=NAME,
        )
