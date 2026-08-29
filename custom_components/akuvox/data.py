"""Akuvox Data Class."""
from __future__ import annotations
from datetime import datetime
from urllib.parse import quote, urlsplit

from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers import storage

from .const import (
    LOGGER,
    PIC_URL_KEY,
    CAPTURE_TIME_KEY,
    DATA_STORAGE_KEY,
    account_storage_key,
    LOCATIONS_DICT,
    ACTIVITY_ENDPOINT_TYPE,
)
from .helpers import AkuvoxHelpers

helpers = AkuvoxHelpers()

class AkuvoxData:
    """Data class holding key data from API requests."""

    def __init__(self,
                 entry: ConfigEntry | None,
                 hass: HomeAssistant,
                 host: str | None = None,
                 subdomain: str | None = None,
                 auth_token: str | None = None,
                 token: str | None = None,
                 country_code: str | None = None,
                 phone_number: str | None = None,
                 wait_for_image_url: bool | None = None):
        """Initialize the Akuvox API client."""

        self.hass = hass
        self._entry = entry if entry is not None and not isinstance(entry, dict) else None
        self._storage_key = (
            account_storage_key(entry.entry_id, "state")
            if entry is not None and not isinstance(entry, dict)
            else DATA_STORAGE_KEY
        )
        self.location_dict: dict = {}
        self.app_type = self._get_activity_endpoint_type(entry)
        self.rtsp_server = ""
        self.sip_server = ""
        self.sip_account = ""
        self.sip_password = ""
        self.sip_transport = ""
        self.sip_device_accounts: dict[str, str] = {}
        self.project_name = "Akuvox SmartPlus"
        self.camera_data: list[dict] = []
        self.door_relay_data: list[dict] = []
        self.door_keys_data: list[dict] = []
        self.host = host or self.get_value_for_key(entry, "host", "")
        self.auth_token = auth_token or self.get_value_for_key(entry, "auth_token", "")
        self.token = token or self.get_value_for_key(entry, "token", "")
        self.phone_number = phone_number or self.get_value_for_key(entry, "phone_number", "")
        self.country_code = country_code or self.get_value_for_key(entry, "country_code", "")
        self.wait_for_image_url = (
            wait_for_image_url
            if wait_for_image_url is not None
            else self.get_value_for_key(entry, "event_screenshot_options", "") == "wait"
        )
        self.subdomain = subdomain or self.get_value_for_key(entry, "subdomain", "")
        if not self.subdomain:
            if country_code:
                self.location_dict = LOCATIONS_DICT.get(country_code, {})
            elif entry:
                try:
                    country_name_code = str(entry.data.get("country", hass.config.country))
                    self.location_dict = LOCATIONS_DICT.get(country_name_code, {})
                except Exception as error:
                    LOGGER.debug("Unable to use country due to error: %s", error)
            self.subdomain = self.location_dict.get("subdomain", "")
        if not self.subdomain:
            self.subdomain = "ecloud"

        self.hass.add_job(self.async_set_stored_data_for_key, "wait_for_image_url", self.wait_for_image_url)

    def get_value_for_key(self, entry: ConfigEntry | None, key: str, default):
        """Get the value for a given key. 1st check: configured, 2nd check: options, 3rd check: data."""
        if entry is not None:
            if isinstance(entry, dict):
                if key in entry["configured"]:
                    return entry["configured"][key] # type: ignore
                return default
            override = entry.options.get("override", False) or key == "event_screenshot_options"
            placeholder = entry.data.get(key, None)
            if override:
                return entry.options.get(key, placeholder)
            return placeholder
        return default

    @staticmethod
    def _get_positive_option(entry: ConfigEntry | None, key: str, default: int) -> int:
        """Return a positive integer option without changing credential precedence."""
        if entry is None or isinstance(entry, dict):
            return default
        try:
            value = int(entry.options.get(key, entry.data.get(key, default)))
        except (TypeError, ValueError):
            return default
        return value if value > 0 else default

    @staticmethod
    def _get_activity_endpoint_type(entry: ConfigEntry | None) -> str:
        """Restore the previously proven SmartPlus activity endpoint."""
        if entry is None or isinstance(entry, dict):
            return "community"
        value = entry.options.get(
            ACTIVITY_ENDPOINT_TYPE,
            entry.data.get(ACTIVITY_ENDPOINT_TYPE, "community"),
        )
        return value if value in ("community", "single") else "community"

    def parse_rest_server_response(self, json_data: dict) -> bool:
        """Parse the rest_server API response."""
        if not isinstance(json_data, dict):
            return False
        self.host = str(json_data.get("rest_server_https", "")).strip()
        return bool(self.host)

    def parse_sms_login_response(self, json_data: dict) -> None:
        """Parse the sms_login API response."""
        if not isinstance(json_data, dict):
            return
        payload = json_data.get("datas", json_data)
        if not isinstance(payload, dict):
            return
        self.auth_token = str(payload.get("auth_token", self.auth_token))
        self.token = str(payload.get("token", self.token))
        self.rtsp_server = self._normalise_rtsp_server(
            # ``rtsp_server`` is the documented video-monitoring endpoint.
            # The virtual endpoint has returned invalid Transport headers to
            # FFmpeg/go2rtc, leaving snapshots as corrupt downloads.
            payload.get("rtsp_server")
            or payload.get("vrtsp_server")
            or payload.get("rtmp_server")
            or self.rtsp_server
        )
        self.host = str(payload.get("rest_server_https", self.host)).strip()

    @staticmethod
    def _normalise_rtsp_server(value) -> str:
        """Return the advertised RTSP host and port in URL-authority form."""
        server = str(value or "").strip()
        if not server:
            return ""
        parsed = urlsplit(server if "://" in server else f"rtsp://{server}")
        if not parsed.hostname:
            return ""
        return f"{parsed.hostname}:{parsed.port or 554}"

    def parse_userconf_data(self, json_data: dict):
        """Parse the userconf API response."""
        self.door_relay_data = []
        self.camera_data = []
        if isinstance(json_data, dict):
            if isinstance(json_data.get("app_conf"), dict):
                app_conf = json_data["app_conf"]
                self.project_name = str(app_conf.get("project_name", self.project_name)).strip()
                self.sip_server = str(app_conf.get("sip_server", "")).strip()
                self.sip_account = str(
                    app_conf.get("main_sip") or app_conf.get("sip") or ""
                ).strip()
                self.sip_password = str(
                    app_conf.get("main_sip_passwd") or app_conf.get("sip_passwd") or ""
                ).strip()
                self.sip_transport = str(app_conf.get("trans_type", "")).strip()
            if isinstance(json_data.get("dev_list"), list):
                for dev_data in json_data["dev_list"]:
                    if not isinstance(dev_data, dict):
                        continue
                    name = str(dev_data.get("location", "")).strip()
                    mac = str(dev_data.get("mac", "")).strip()
                    if not name or not mac:
                        continue
                    device_sip = str(dev_data.get("sip", "")).strip()
                    if device_sip:
                        self.sip_device_accounts[mac] = device_sip

                    # Camera
                    if dev_data.get("rtsp_pwd") and self.rtsp_server:
                        password = quote(str(dev_data["rtsp_pwd"]), safe="")
                        camera_dict = {
                            "name": name,
                            "video_url": f"rtsp://ak:{password}@{self.rtsp_server}/{mac}"
                        }
                        self.camera_data.append(camera_dict)

                    # Door Relay
                    if isinstance(dev_data.get("relay"), list):
                        for relay in dev_data["relay"]:
                            if not isinstance(relay, dict) or "relay_id" not in relay:
                                continue
                            relay_id = str(relay["relay_id"])
                            door_name = str(relay.get("door_name", name)).strip()
                            self.door_relay_data.append({
                                "name": name,
                                "door_name": door_name,
                                "relay_id": relay_id,
                                "mac": mac
                            })

        # Log parsed entities
        if len(self.camera_data) > 0:
            LOGGER.debug("🎥 Cameras parsed:")
            for camera_dict in self.camera_data:
                LOGGER.debug(" - %s", camera_dict.get("name", ""))
        if len(self.door_relay_data) > 0:
            LOGGER.debug("🚪 Door relays parsed:")
            for relay_dict in self.door_relay_data:
                LOGGER.debug(" - %s", relay_dict.get("name", ""))

    def parse_temp_keys_data(self, json_data: list) -> None:
        """Parse the getPersonalTempKeyList API response."""
        self.door_keys_data = []
        for door_keys_json in json_data:
            if not isinstance(door_keys_json, dict):
                continue
            required_keys = ("ID", "Description", "TmpKey", "BeginTime", "EndTime")
            if any(key not in door_keys_json for key in required_keys):
                LOGGER.warning("Skipping temporary key with incomplete data")
                continue
            door_keys_data = {}
            door_keys_data["key_id"] = door_keys_json["ID"]
            door_keys_data["description"] = door_keys_json["Description"]
            door_keys_data["key_code"] = door_keys_json["TmpKey"]
            door_keys_data["begin_time"] = self._normalise_temp_key_time(
                door_keys_json["BeginTime"]
            )
            door_keys_data["end_time"] = self._normalise_temp_key_time(
                door_keys_json["EndTime"]
            )
            door_keys_data["access_times"] = door_keys_json.get("AccessTimes", 0)
            door_keys_data["allowed_times"] = door_keys_json.get("AllowedTimes", 0)
            door_keys_data["each_allowed_times"] = door_keys_json.get("EachAllowedTimes", 0)
            door_keys_data["date_flag"] = door_keys_json.get("DateFlag", "")
            door_keys_data["scheduler_type"] = door_keys_json.get("SchedulerType", 3)
            door_keys_data["id_number"] = door_keys_json.get("IDNumber", "")
            door_keys_data["license_plate"] = door_keys_json.get("LicensePlate", "")
            door_keys_data["uhf_card"] = door_keys_json.get("UhfCard", "")
            door_keys_data["is_follow_my_access"] = door_keys_json.get(
                "IsFollowMyAccess", 1
            )
            qr_code_url = str(door_keys_json.get("QrCodeUrl", "")).strip()
            # SmartPlus normally returns a complete QR image URL. Older
            # deployments may return only its path instead.
            if qr_code_url and not urlsplit(qr_code_url).scheme:
                qr_code_url = (
                    f"https://{self.subdomain}.akuvox.com/"
                    f"{qr_code_url.lstrip('/')}"
                )
            door_keys_data["qr_code_url"] = qr_code_url
            door_keys_data["expired"] = bool(door_keys_json.get("Expired", False))

            door_keys_data["doors"] = []
            if isinstance(door_keys_json.get("Doors"), list):
                for door_key_json in door_keys_json["Doors"]:
                    if not isinstance(door_key_json, dict):
                        continue
                    if not {"ID", "KeyID", "Relay", "MAC"}.issubset(door_key_json):
                        continue
                    door_keys_data["doors"].append({
                        "door_id": door_key_json["ID"],
                        "key_id": door_key_json["KeyID"],  # Reference to key
                        "relay": self._normalise_temp_key_relay(
                            door_key_json["MAC"], door_key_json["Relay"]
                        ),
                        "mac": door_key_json["MAC"],
                        "security_relay": door_key_json.get("SecurityRelay", "0"),
                    })

            self.door_keys_data.append(door_keys_data)

        if len(self.door_keys_data) > 0:
            LOGGER.debug("🔑 %s Temp key%s parsed:",
                        str(len(self.door_keys_data)),
                        "s" if len(self.door_keys_data) > 1 else "")
            for door_key in self.door_keys_data:
                LOGGER.debug(" - '%s', with access to %s door%s",
                             door_key.get("description", ""),
                             len(door_key["doors"]),
                             "" if len(door_key["doors"]) == 1 else "s")

    @staticmethod
    def _normalise_temp_key_time(value: object) -> str:
        """Return temporary-key timestamps in the browser-safe ISO-like format.

        SmartPlus returns ``DD-MM-YYYY HH:MM:SS`` for temporary keys, while a
        ``datetime-local`` control only accepts the year-first representation.
        Retaining seconds also keeps edits lossless when the value is submitted.
        """
        text = str(value).strip()
        for format_string in (
            "%Y-%m-%d %H:%M:%S",
            "%d-%m-%Y %H:%M:%S",
            "%Y/%m/%d %H:%M:%S",
            "%d/%m/%Y %H:%M:%S",
        ):
            try:
                return datetime.strptime(text, format_string).strftime(
                    "%Y-%m-%d %H:%M:%S"
                )
            except ValueError:
                continue
        return text

    def _normalise_temp_key_relay(self, mac: object, relay: object) -> str:
        """Map SmartPlus's one-based temporary-key relay to the device relay ID."""
        relay_id = str(relay)
        mac_value = str(mac).casefold()
        available = {
            str(item.get("relay_id", ""))
            for item in self.door_relay_data
            if str(item.get("mac", "")).casefold() == mac_value
        }
        try:
            device_relay_id = str(int(relay_id) - 1)
        except ValueError:
            return relay_id
        return device_relay_id if device_relay_id in available else relay_id

    async def async_parse_personal_door_log(self, json_data: list):
        """Parse the getDoorLog API response."""
        ret_value = None
        is_wait = await self.async_get_stored_data_for_key("wait_for_image_url")
        if json_data is not None and len(json_data) > 0:
            new_door_log = json_data[0]
            latest_door_log = await self.async_get_stored_data_for_key("latest_door_log")
            if latest_door_log is not None and CAPTURE_TIME_KEY in latest_door_log:
                if new_door_log is not None and CAPTURE_TIME_KEY in new_door_log:
                    # Ignore previous door open event
                    if str(latest_door_log[CAPTURE_TIME_KEY]) == str(new_door_log[CAPTURE_TIME_KEY]):
                        return None
                    # Screenshot required and currently unavailable
                    if PIC_URL_KEY in new_door_log and new_door_log[PIC_URL_KEY] == "":
                        if is_wait is True:
                            LOGGER.debug("New door entry detected --> Waiting for screenshot URL...")
                            return None
                        else:
                            LOGGER.debug("New door entry detected --> Not waiting for the screenshot URL...")
                    # New door event detected
                    LOGGER.debug("ℹ️ New personal door log entry detected:")
                    LOGGER.debug(" - Initiator: %s", new_door_log["Initiator"])
                    LOGGER.debug(" - CaptureType: %s", new_door_log["CaptureType"])
                    LOGGER.debug(" - Location: %s", new_door_log["Location"])
                    LOGGER.debug(" - Door MAC: %s", new_door_log["MAC"])
                    LOGGER.debug(" - Door Relay: %s", new_door_log["Relay"])
                    ret_value = new_door_log

            await self.async_set_stored_data_for_key("latest_door_log", new_door_log)
        return ret_value

    ###################

    async def async_set_stored_data_for_key(self, key, value):
        """Store key/value pair to integration's storage."""
        store = storage.Store(self.hass, 1, self._storage_key)
        stored_data: dict = await store.async_load() # type: ignore
        if stored_data is None:
            stored_data = {}
        stored_data[key] = value
        await store.async_save(stored_data)

    async def async_get_stored_data_for_key(self, key):
        """Store key/value pair to integration's storage."""
        store = storage.Store(self.hass, 1, self._storage_key)
        stored_data: dict = await store.async_load() # type: ignore
        if stored_data and key in stored_data:
            return stored_data[key]

        # Releases before account-scoped storage kept every hub's runtime
        # state in one file. Migrate only a matching legacy account, and only
        # for a missing value, so no account can overwrite another's history.
        if self._entry is None or self._storage_key == DATA_STORAGE_KEY:
            return None
        legacy_store = storage.Store(self.hass, 1, DATA_STORAGE_KEY)
        legacy_data: dict = await legacy_store.async_load() # type: ignore
        if not isinstance(legacy_data, dict) or key not in legacy_data:
            return None
        legacy_phone = str(legacy_data.get("phone_number", ""))
        legacy_subdomain = str(legacy_data.get("subdomain", ""))
        # Very old shared storage did not record account identity at all. It
        # predates account-scoped files and therefore belonged to the only
        # configured SmartPlus account; allow that data to migrate once.
        if (legacy_phone or legacy_subdomain) and (
            legacy_phone != str(self.phone_number)
            or legacy_subdomain != str(self.subdomain)
        ):
            return None

        account_data = stored_data if isinstance(stored_data, dict) else {}
        account_data[key] = legacy_data[key]
        await store.async_save(account_data)
        LOGGER.info("Migrated legacy Akuvox %s storage for account %s", key, self._entry.entry_id)
        return legacy_data[key]

    ###################

    def get_device_data(self) -> dict:
        """Device data dictionary."""
        return {
            "host": self.host,
            "camera_data": self.camera_data,
            "door_relay_data": self.door_relay_data,
            "door_keys_data": self.door_keys_data
        }
