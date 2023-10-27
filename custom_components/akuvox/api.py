"""Akuvox API Client."""
from __future__ import annotations
from dataclasses import dataclass

import asyncio
import socket
import json

from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry


import aiohttp
import async_timeout
import requests

from .const import (
    LOGGER,
    REST_SERVER_ADDR,
    REST_SERVER_PORT,
    API_SEND_SMS,
    SMS_LOGIN_API_VERSION,
    API_SMS_LOGIN,
    API_SERVERS_LIST,
    REST_SERVER_API_VERSION,
    API_REST_SERVER_DATA,
    USERCONF_API_VERSION,
    API_USERCONF,
    OPENDOOR_API_VERSION,
    API_OPENDOOR,
    API_APP_HOST,
    API_GET_PERSONAL_TEMP_KEY_LIST,
    API_GET_PERSONAL_DOOR_LOG,
    TEMP_KEY_QR_HOST,
)


class AkuvoxApiClientError(Exception):
    """Exception to indicate a general API error."""


class AkuvoxApiClientCommunicationError(AkuvoxApiClientError):
    """Exception to indicate a communication error."""


class AkuvoxApiClientAuthenticationError(AkuvoxApiClientError):
    """Exception to indicate an authentication error."""


@dataclass
class AkuvoxData:
    """Data class holding key data from API requests."""

    host: str = ""
    app_type: str = ""
    auth_token: str = ""
    token: str = ""
    phone_number: str = ""
    rtsp_ip: str = ""
    project_name: str = ""
    camera_data = []
    door_relay_data = []
    door_keys_data = []
    latest_door_log = {}


    def __init__(self, entry: ConfigEntry):
        """Initialize the Akuvox API client."""
        self.host = self.get_value_for_key(entry, "host") # type: ignore
        self.auth_token = self.get_value_for_key(entry, "auth_token") # type: ignore
        self.token = self.get_value_for_key(entry, "token") # type: ignore
        self.phone_number = self.get_value_for_key(entry, "phone_number") # type: ignore

    def get_value_for_key(self, entry: ConfigEntry, key: str):
        """Get the value for a given key. 1st check: options, 2nd check: data."""
        if entry is not None:
            override = entry.options.get("override", False)
            return entry.options.get(key, entry.data[key]) if override is True else entry.data[key]
        return None

    def parse_rest_server_response(self, json_data: dict):
        """Parse the rest_server API response."""
        if json_data is not None and json_data is not {}:
            self.host = json_data["rest_server_https"]

    def parse_sms_login_response(self, json_data: dict):
        """Parse the sms_login API response."""
        LOGGER.debug("parse_sms_login_response = %s", json.dumps(json_data, indent=4))
        if json_data is not None:
            if "auth_token" in json_data:
                self.auth_token = json_data["auth_token"]
            if "token" in json_data:
                self.token = json_data["token"]
            if "access_server" in json_data:
                self.rtsp_ip = json_data["access_server"].split(':')[0]

    def parse_userconf_data(self, json_data: dict):
        """Parse the userconf API response."""
        self.door_relay_data = []
        self.camera_data = []
        if json_data is not None:
            if "app_conf" in json_data:
                self.project_name = json_data["app_conf"]["project_name"].strip()
            if "dev_list" in json_data:
                for dev_data in json_data["dev_list"]:
                    name = dev_data["location"].strip()
                    mac = dev_data["mac"]

                    # Camera
                    if "location" in dev_data and "rtsp_pwd" in dev_data and "mac" in dev_data:
                        password = dev_data["rtsp_pwd"]
                        self.camera_data.append({
                            "name": name,
                            "video_url": f"rtsp://ak:{password}@{self.rtsp_ip}:554/{mac}"
                        })
                        LOGGER.debug("🎥 Camera parsed: %s", name)

                    # Door Relay
                    if "relay" in dev_data:
                        for relay in dev_data["relay"]:
                            relay_id = relay["relay_id"]
                            door_name = relay["door_name"].strip()
                            self.door_relay_data.append({
                                "name": name,
                                "door_name": door_name,
                                "relay_id": relay_id,
                                "mac": mac
                            })

                            LOGGER.debug("🚪 Door relay parsed: %s-%s",
                                         name, door_name)

    def parse_temp_keys_data(self, json_data: list):
        """Parse the getPersonalTempKeyList API response."""
        self.door_keys_data = []
        for door_keys_json in json_data:
            door_keys_data = {}
            door_keys_data["key_id"] = door_keys_json["ID"]
            door_keys_data["description"] = door_keys_json["Description"]
            door_keys_data["key_code"] = door_keys_json["TmpKey"]
            door_keys_data["begin_time"] = door_keys_json["BeginTime"]
            door_keys_data["end_time"] = door_keys_json["EndTime"]
            door_keys_data["access_times"] = door_keys_json["AccessTimes"]
            door_keys_data["allowed_times"] = door_keys_json["AllowedTimes"]
            door_keys_data["each_allowed_times"] = door_keys_json["EachAllowedTimes"]
            door_keys_data["qr_code_url"] = f"https://{TEMP_KEY_QR_HOST}{door_keys_json['QrCodeUrl']}"
            door_keys_data["expired"] = False if door_keys_json["Expired"] else True

            door_keys_data["doors"] = []
            if "Doors" in door_keys_json:
                for door_key_json in door_keys_json["Doors"]:
                    door_keys_data["doors"].append({
                        "door_id": door_key_json["ID"],
                        "key_id": door_key_json["KeyID"],  # Reference to key
                        "relay": door_key_json["Relay"],
                        "mac": door_key_json["MAC"]
                    })

            self.door_keys_data.append(door_keys_data)


            LOGGER.debug("🔑 %s parsed, opening %s door%s",
                         door_keys_data["description"],
                         str(len(door_keys_data["doors"])),
                         "" if len(door_keys_data["doors"]) == 1 else "s")


    def parse_personal_door_log(self, json_data: list):
        """Parse the getDoorLog API response."""
        ret_value = None
        if json_data is not None and len(json_data) > 0:
            new_door_log = json_data[0]
            if self.latest_door_log is not None and "CaptureTime" in self.latest_door_log:
                if new_door_log is not None and "CaptureTime" in new_door_log:
                    # New door event detected
                    if str(self.latest_door_log["CaptureTime"]) != str(new_door_log["CaptureTime"]):
                        LOGGER.debug("New personal door log entry detected:")
                        LOGGER.debug(" - Initiator: %s", new_door_log["Initiator"])
                        LOGGER.debug(" - Location: %s", new_door_log["Location"])
                        LOGGER.debug(" - Door MAC: %s", new_door_log["MAC"])
                        LOGGER.debug(" - Door Relay: %s", new_door_log["Relay"])
                        ret_value = new_door_log
            self.latest_door_log = new_door_log
        return ret_value

    ###################

    def get_device_data(self) -> dict:
        """Device data dictionary."""
        return {
            "host": self.host,
            "token": self.token,
            "auth_token": self.auth_token,
            "camera_data": self.camera_data,
            "door_relay_data": self.door_relay_data,
            "door_keys_data": self.door_keys_data,
            "latest_door_log": self.latest_door_log
        }


class AkuvoxApiClient:
    """Sample API Client."""

    _data: AkuvoxData

    def __init__(
        self,
        session: aiohttp.ClientSession,
        hass: HomeAssistant,
        entry,
    ) -> None:
        """Akuvox API Client."""
        self._session = session
        self.hass = hass
        self._data = AkuvoxData(entry)

    async def async_init_api_data(self) -> None:
        """Initialize API configuration data."""
        if self._data.host is None or len(self._data.host) == 0:
            self._data.host = "...request in process"
            json_data = await self.async_make_rest_server_request()
            self._data.parse_rest_server_response(json_data)
        if self._data.rtsp_ip is None:
            await self.async_make_servers_list_request(
                self._data.auth_token,
                self._data.token,
                self._data.phone_number)
        # Begin polling personal door log
        await self.start_polling_personal_door_log()

    def init_api_with_tokens(self, host=None, auth_token=None, token=None, phone_number=None):
        """"Initialize values from saved data/options."""
        if host is not None:
            self._data.host = host # type: ignore
        if auth_token is not None:
            self._data.auth_token = auth_token
        if token is not None:
            self._data.auth_token = token
        if phone_number is not None:
            self._data.phone_number = phone_number

    ####################
    # API Call Methods #
    ####################

    async def async_make_rest_server_request(self) -> dict:
        """Retrieve the Akuvox REST server addresses and data."""
        LOGGER.debug("📡 Fetching REST server data...")
        json_data = await self._api_wrapper(
            method="get",
            url=f"https://{REST_SERVER_ADDR}:{REST_SERVER_PORT}/{API_REST_SERVER_DATA}",
            data=None,
            headers={
                'api-version': REST_SERVER_API_VERSION
            }
        )
        if json_data is not None:
            LOGGER.debug("✅ REST server data received successfully")
            return json_data

        LOGGER.error("❌ Unable to reach Akuvox server.")
        return {}

    async def send_sms(self, country_code, phone_number):
        """Request SMS code to user's device."""
        url = f"https://{self._data.host}/{API_SEND_SMS}"
        headers = {
            "Host": self._data.host,
            "Content-Type": "application/x-www-form-urlencoded",
            "X-AUTH-TOKEN": "",
            "Connection": "keep-alive",
            "Accept": "*/*",
            "User-Agent": "VBell/6.61.2 (iPhone; iOS 16.6; Scale/3.00)",
            "Accept-Language": "en-AU;q=1, he-AU;q=0.9, ru-RU;q=0.8",
            "x-cloud-lang": "en"
        }
        data = {
            "AreaCode": country_code,
            "MobileNumber": phone_number,
            "Type": 0
        }
        LOGGER.debug("📡 Requesting SMS code...")
        response = await self._api_wrapper(
            method="post",
            url=url,
            headers=headers,
            data=data,
        )
        if response is not None:
            if response["result"] == 0:
                LOGGER.debug("✅ SMS code request successful")
                return True

        LOGGER.debug("❌ SMS code request unsuccessful")
        return False

    async def async_make_servers_list_request(self,
                                              auth_token: str,
                                              token: str,
                                              phone_number: str) -> bool:
        """Request server list data."""

        # Store tokens
        self._data.auth_token = auth_token
        self._data.token = token
        self._data.phone_number = phone_number

        url = f"https://{REST_SERVER_ADDR}:{REST_SERVER_PORT}/{API_SERVERS_LIST}"
        headers = {
            "accept": "*/*",
            "content-type": "application/json",
            "x-auth-token": token,
            "api-version": "6.6",
            "x-cloud-lang": "en",
            "user-agent": "VBell/6.61.2 (iPhone; iOS 16.6; Scale/3.00)",
            "accept-language": "en-AU;q=1, he-AU;q=0.9, ru-RU;q=0.8"
        }
        obfuscated_number = str(self.get_obfuscated_phone_number(phone_number))
        data = json.dumps({
            "auth_token": auth_token,
            "passwd": auth_token,
            "token": token,
            "user": obfuscated_number,
        })
        LOGGER.debug("📡 Requesting server list...")
        json_data = await self._api_wrapper(
            method="post",
            url=url,
            headers=headers,
            data=data,
        )
        if json_data is not None:
            LOGGER.debug("✅ Server list retrieved successfully")
            self._data.parse_sms_login_response(json_data)
            return True

        LOGGER.error("❌ Unable to retrieve server list.")
        return False

    async def async_sms_sign_in(self, phone_number, country_code, sms_code) -> bool:
        """Sign user in with their phone number and SMS code."""

        login_data = await self.async_validate_sms_code(phone_number, country_code, sms_code)
        if login_data is not None:
            self._data.parse_sms_login_response(login_data)

            # Retrieve connected device data
            await self.async_retrieve_device_data()
            await self.async_retrieve_temp_keys_data()

            return True

        return False

    async def async_validate_sms_code(self, phone_number, country_code, sms_code):
        """Validate the SMS code received by the user."""
        LOGGER.debug("📡 Logging in user with phone number and SMS code...")

        obfuscated_number = self.get_obfuscated_phone_number(phone_number)
        params = f"phone={obfuscated_number}&code={sms_code}&area_code={country_code}"
        url = f"https://{REST_SERVER_ADDR}:{REST_SERVER_PORT}/{API_SMS_LOGIN}?{params}"
        data = {}
        headers = {
            'api-version': SMS_LOGIN_API_VERSION,
            'User-Agent': 'VBell/6.61.2 (iPhone; iOS 16.6; Scale/3.00)'
        }
        response = await self._api_wrapper(method="get", url=url, headers=headers, data=data)

        if response is not None:
            LOGGER.debug("✅ Login successful")
            return response

        LOGGER.error("❌ Unable to log in with SMS code.")
        return None

    async def async_retrieve_user_data(self) -> bool:
        """Retrieve user devices and temp keys data."""
        await self.async_make_servers_list_request(
                self._data.auth_token,
                self._data.token,
                self._data.phone_number)

        await self.async_retrieve_device_data()
        await self.async_retrieve_temp_keys_data()
        return True

    async def async_retrieve_device_data(self) -> bool:
        """Request and parse the user's device data."""
        user_conf_data = await self.async_user_conf()
        if user_conf_data is not None:
            self._data.parse_userconf_data(user_conf_data)
            return True
        return False

    async def async_retrieve_user_data_with_tokens(self, auth_token, token) -> bool:
        """Retrieve user devices and temp keys data with an alternate token string."""
        self._data.auth_token = auth_token
        self._data.token = token
        return await self.async_retrieve_user_data()

    async def async_user_conf(self):
        """Request the user's configuration data."""
        LOGGER.debug("📡 Retrieving list of user's devices...")
        url = f"https://{self._data.host}/{API_USERCONF}?token={self._data.token}"
        data = {}
        headers = {
            "Host": self._data.host,
            "X-AUTH-TOKEN": self._data.token,
            "Connection": "keep-alive",
            "api-version": USERCONF_API_VERSION,
            "Accept": "*/*",
            "User-Agent": "VBell/6.61.2 (iPhone; iOS 16.6; Scale/3.00)",
            "Accept-Language": "en-AU;q=1, he-AU;q=0.9, ru-RU;q=0.8",
            "x-cloud-lang": "en"
        }
        json_data = await self._api_wrapper(method="get", url=url, headers=headers, data=data)

        if json_data is not None:
            LOGGER.debug("✅ User's device list retrieved successfully")
            return json_data

        LOGGER.error("❌ Unable to retrieve user's device list.")
        return None

    def make_opendoor_request(self, name: str, host: str, token: str, data: str):
        """Request the user's configuration data."""
        LOGGER.debug("📡 Sending request to open door '%s'...", name)
        LOGGER.debug("Request data = %s", str(data))
        url = f"https://{host}/{API_OPENDOOR}?token={token}"
        headers = {
            "Host": host,
            "Content-Type": "application/x-www-form-urlencoded",
            "X-AUTH-TOKEN": token,
            "api-version": OPENDOOR_API_VERSION,
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
            "Accept": "*/*",
            "User-Agent": "VBell/6.61.2 (iPhone; iOS 16.6; Scale/3.00)",
            "Accept-Language": "en-AU;q=1, he-AU;q=0.9, ru-RU;q=0.8",
            "Content-Length": "24",
            "x-cloud-lang": "en",
        }
        response = self.post_request(url=url, headers=headers, data=data)
        json_data = self.process_response(response)
        if json_data is not None:
            LOGGER.debug("✅ Door open request sent successfully.")
            return json_data

        LOGGER.error("❌ Request to open door failed.")
        return None

    async def async_retrieve_temp_keys_data(self) -> bool:
        """Request and parse the user's temporary keys."""
        json_data = await self.async_get_temp_key_list()
        if json_data is not None:
            self._data.parse_temp_keys_data(json_data)
            return True
        return False

    async def async_get_temp_key_list(self):
        """Request the user's configuration data."""
        LOGGER.debug("📡 Retrieving list of user's temporary keys...")
        host = self.get_activities_host()
        url = f"https://{host}/{API_GET_PERSONAL_TEMP_KEY_LIST}"
        data = {}
        headers = {
            "x-cloud-version": "6.4",
            "accept": "application/json, text/plain, */*",
            "sec-fetch-site": "same-origin",
            "accept-language": "en-AU,en;q=0.9",
            "sec-fetch-mode": "cors",
            "x-cloud-lang": "en",
            "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) SmartPlus/6.2",
            "referer": f"https://ecloud.akuvox.com/smartplus/TmpKey.html?TOKEN={self._data.token}&USERTYPE=20&VERSION=6.6",
            "x-auth-token": self._data.token,
            "sec-fetch-dest": "empty"
        }

        json_data = await self._api_wrapper(method="get", url=url, headers=headers, data=data)

        if json_data is not None:
            LOGGER.debug("✅ User's temporary keys list retrieved successfully")
            return json_data

        LOGGER.error("❌ Unable to retrieve user's temporary key list.")
        return None

    async def start_polling_personal_door_log(self):
        """Poll the server contineously for the latest personal door log."""
        LOGGER.debug("🔄 Poll user's personal door log every 2 seconds..")
        self.hass.async_create_task(self.async_retrieve_personal_door_log())

    async def async_retrieve_personal_door_log(self) -> bool:
        """Request and parse the user's door log every 2 seconds."""
        while True:
            json_data = await self.async_get_personal_door_log()
            if json_data is not None:
                new_door_log = self._data.parse_personal_door_log(json_data)
                if new_door_log is not None:
                    # Fire HA event
                    LOGGER.debug("🚪 New door open event occurred. Firing akuvox_door_update event")
                    event_name = "akuvox_door_update"
                    self.hass.bus.async_fire(event_name, new_door_log)
            await asyncio.sleep(2)  # Wait for 2 seconds before calling again

    async def async_get_personal_door_log(self):
        """Request the user's personal door log data."""
        # LOGGER.debug("📡 Retrieving list of user's personal door log...")
        host = self.get_activities_host()
        url = f"https://{host}/{API_GET_PERSONAL_DOOR_LOG}"
        data = {}
        headers = {
            "x-cloud-version": "6.4",
            "accept": "application/json, text/plain, */*",
            "sec-fetch-site": "same-origin",
            "accept-language": "en-AU,en;q=0.9",
            "sec-fetch-mode": "cors",
            "x-cloud-lang": "en",
            "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) SmartPlus/6.2",
            "referer": f"https://ecloud.akuvox.com/smartplus/Activities.html?TOKEN={self._data.token}",
            "x-auth-token": self._data.token,
            "sec-fetch-dest": "empty"
        }
        json_data = await self._api_wrapper(method="get", url=url, headers=headers, data=data)

        if json_data is not None:
            # LOGGER.debug("✅ User's personal door log retrieved successfully")
            return json_data

        # LOGGER.error("❌ Unable to retrieve user's personal door log")
        return None

    ###################
    # Request Methods #
    ###################

    async def _api_wrapper(
        self,
        method: str,
        url: str,
        data,
        headers: dict | None = None,
    ):
        """Get information from the API."""
        try:
            async with async_timeout.timeout(10):
                func = self.post_request if method == "post" else self.get_request
                response = await self.hass.async_add_executor_job(func, url, headers, data, 10)
                return self.process_response(response)

        except asyncio.TimeoutError as exception:
            # Fix for accounts which use the "single" endpoint instead of "community"
            if "app/community/" in url:
                self._data.app_type = "single"
                url = url.replace("app/community/", "app/single/")
                return self._api_wrapper(method, url, data, headers)
            raise AkuvoxApiClientCommunicationError(
                f"Timeout error fetching information: {exception}",
            ) from exception
        except (aiohttp.ClientError, socket.gaierror) as exception:
            raise AkuvoxApiClientCommunicationError(
                f"Error fetching information: {exception}",
            ) from exception
        except Exception as exception:  # pylint: disable=broad-except
            raise AkuvoxApiClientError(
                f"Something really wrong happened! {exception}"
            ) from exception
        return None

    def process_response(self, response):
        """Process response and return dict with data."""
        if response.status_code == 200:
            # Assuming the response is valid JSON, parse it
            try:
                json_data = response.json()

                # Standard requests
                if "result" in json_data and json_data["result"] == 0:
                    if "datas" in json_data:
                        return json_data["datas"]
                    return json_data

                # Temp key requests
                if "code" in json_data:
                    if json_data["code"] == 0:
                        if "data" in json_data:
                            return json_data["data"]
                        return json_data
                    return []

                LOGGER.warning("🤨 Response: %s", str(json_data))
            except Exception as error:
                LOGGER.error("❌ Error occurred when parsing JSON: %s",
                             error)
        else:
            LOGGER.debug("❌ Error: HTTP status code %s",
                         response.status_code)
        return None

    async def async_make_get_request(self, url, headers, data=None):
        """Make an HTTP get request."""
        return await self.async_make_request("get", url, headers, data)

    async def async_make_post_request(self, url, headers, data=None):
        """Make an HTTP post request."""
        return await self.async_make_request("post", url, headers, data)

    async def async_make_request(self, request_type, url, headers, data=None):
        """Make an HTTP request."""
        func = self._session.post if request_type == "post" else self._session.get

        response = await func(url=url, headers=headers, data=data)
        if response is not None:
            if response.status == 200:
                # Assuming the response is valid JSON, parse it
                try:
                    json_data = response.json()
                    return json_data
                except Exception as error:
                    LOGGER.warning(
                        "❌ Error occurred when parsing JSON: %s", error)
            else:
                LOGGER.debug("❌ Error: HTTP status code %s",
                             response.status)
                return None

    def post_request(self, url, headers, data="", timeout=10):
        """Make a synchronous post request."""
        return requests.post(url, headers=headers, data=data, timeout=timeout)

    def get_request(self, url, headers, data, timeout=10):
        """Make a synchronous post request."""
        return requests.get(url, headers=headers, data=data, timeout=timeout)

    ###########
    # Getters #
    ###########

    def get_title(self) -> str:
        """Title of Akuvox account."""
        return self._data.project_name

    def get_devices_json(self) -> dict:
        """Device data dictionary."""
        return self._data.get_device_data()

    def get_obfuscated_phone_number(self, phone_number):
        """Obfuscate the user's phone number for API requests."""
        # Mask phone number
        num_str = str(phone_number)
        transformed_str = ""
        # Iterate through each digit in the input number
        for digit_char in num_str:
            digit = int(digit_char)
            # Add 3 to the digit and take the result modulo 10
            transformed_digit = (digit + 3) % 10
            transformed_str += str(transformed_digit)
        return int(transformed_str)

    def get_activities_host(self):
        """Get the host address string for activities API requests."""
        if self._data.app_type == "single":
            return API_APP_HOST + "single"
        return API_APP_HOST + "community"

