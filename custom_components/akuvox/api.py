"""Akuvox API Client."""
from __future__ import annotations
from dataclasses import dataclass

import asyncio
import socket
import json

from homeassistant.core import HomeAssistant

import aiohttp
import async_timeout
import requests

from .const import (
    LOGGER,
    AKUVOX_REST_SERVER_ADDR,
    AKUVOX_REST_SERVER_PORT,
    AKUVOX_API_SEND_SMS,
    AKUVOV_SMS_LOGIN_API_VERSION,
    AKUVOX_API_SMS_LOGIN,
    AKUVOX_API_SERVERS_LIST,
    AKUVOV_REST_SERVER_API_VERSION,
    AKUVOX_API_REST_SERVER_DATA,
    AKUVOX_USERCONF_API_VERSION,
    AKUVOX_API_USERCONF,
    AKUVOV_OPENDOOR_API_VERSION,
    AKUVOX_API_OPENDOOR,
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
    auth_token: str = ""
    token: str = ""
    rtsp_ip: str = ""
    project_name: str = ""
    camera_data = []
    door_relay_data = []
    responses = {}

    def parse_rest_server_response(self, json_data: dict):
        """Parse the rest_server API response."""
        if json_data is not None and json_data is not {}:
            self.host = json_data["rest_server_https"]

    def parse_sms_login_response(self, json_data: dict):
        """Parse the sms_login API response."""
        if json_data is not None:
            if "auth_token" in json_data:
                self.auth_token = json_data["auth_token"]
            if "token" in json_data:
                self.token = json_data["token"]
            if "access_server" in json_data:
                self.rtsp_ip = json_data["access_server"].split(':')[0]

    def parse_userconf_data(self, json_data: dict):
        """Parse the userconf API response."""
        if json_data is not None:
            if "app_conf" in json_data:
                self.project_name = json_data["app_conf"]["project_name"]
            if "dev_list" in json_data:
                for dev_data in json_data["dev_list"]:
                    name = dev_data["location"]
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
                            door_name = relay["door_name"]
                            self.door_relay_data.append({
                                "name": name,
                                "door_name": door_name,
                                "relay_id": relay_id,
                                "mac": mac
                            })

                            LOGGER.debug("🚪 Door relay parsed: %s-%s",
                                         name, door_name)

    def get_device_data(self) -> dict:
        """Device data dictionary."""
        return {
            "host": self.host,
            "token": self.token,
            "auth_token": self.auth_token,
            "camera_data": self.camera_data,
            "door_relay_data": self.door_relay_data,
        }


class AkuvoxApiClient:
    """Sample API Client."""

    _data: AkuvoxData

    def __init__(
        self,
        session: aiohttp.ClientSession,
        hass: HomeAssistant,
    ) -> None:
        """Akuvox API Client."""
        self._session = session
        self.hass = hass
        self._data = AkuvoxData()
        hass.add_job(self.async_init_api_data)

    async def async_init_api_data(self) -> None:
        """Get data from the API."""
        if self._data.host is None or len(self._data.host) == 0:
            self._data.host = "...request in process"
            json_data = await self.async_make_rest_server_request()
            self._data.parse_rest_server_response(json_data)

    ####################
    # API Call Methods #
    ####################

    async def async_make_rest_server_request(self) -> dict:
        """Retrieve the Akuvox REST server addresses and data."""
        LOGGER.debug("📡 Fetching REST server data...")
        json_data = await self._api_wrapper(
            method="get",
            url=f"https://{AKUVOX_REST_SERVER_ADDR}:{AKUVOX_REST_SERVER_PORT}/{AKUVOX_API_REST_SERVER_DATA}",
            headers={
                'api-version': AKUVOV_REST_SERVER_API_VERSION
            }
        )
        if json_data is not None:
            LOGGER.debug("✅ REST server data received successfully")
            return json_data

        LOGGER.error("❌ Unable to reach Akuvox server.")
        return {}

    async def send_sms(self, country_code, phone_number):
        """Request SMS code to user's device."""
        url = f"https://{self._data.host}/{AKUVOX_API_SEND_SMS}"
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

    async def async_make_servers_list_request(self, auth_token: str, token: str, phone_number: str) -> bool:
        """Request SMS code to user's device."""

        # Store tokens
        self._data.auth_token = auth_token
        self._data.token = token

        url = f"https://{AKUVOX_REST_SERVER_ADDR}:{AKUVOX_REST_SERVER_PORT}/{AKUVOX_API_SERVERS_LIST}"
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
            "token": token,
            "auth_token": auth_token,
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
            LOGGER.debug("✅ User's device list retrieved successfully")

            self._data.parse_sms_login_response(json_data)

            # Retrieve connected device data
            device_data_success = await self.async_retrieve_device_data()
            if device_data_success is True:
                return True

        LOGGER.error("❌ Unable to retrieve user's device list.")
        return False

    async def async_sign_in(self, phone_number, country_code, sms_code) -> bool:
        """Sign user in with their phone number and SMS code."""

        login_data = await self.async_validate_sms_code(phone_number, country_code, sms_code)
        if login_data is not None:
            self._data.parse_sms_login_response(login_data)

            # Retrieve connected device data
            device_data_success = await self.async_retrieve_device_data()
            if device_data_success is True:
                return True

        return False

    async def async_validate_sms_code(self, phone_number, country_code, sms_code):
        """Validate the SMS code received by the user."""
        LOGGER.debug("📡 Logging in user with phone number and SMS code...")

        obfuscated_number = self.get_obfuscated_phone_number(phone_number)

        url = f"https://{AKUVOX_REST_SERVER_ADDR}:{AKUVOX_REST_SERVER_PORT}/{AKUVOX_API_SMS_LOGIN}?phone={obfuscated_number}&code={sms_code}&area_code={country_code}"
        data = {}
        headers = {
            'api-version': AKUVOV_SMS_LOGIN_API_VERSION,
            'User-Agent': 'VBell/6.61.2 (iPhone; iOS 16.6; Scale/3.00)'
        }
        response = await self._api_wrapper(method="get", url=url, headers=headers, data=data)

        if response is not None:
            LOGGER.debug("✅ Login successful")
            return response

        LOGGER.error("❌ Unable to log in with SMS code.")
        return None

    async def async_retrieve_device_data(self) -> bool:
        """Request and parse the user's device data."""
        user_conf_data = await self.async_user_conf()
        if user_conf_data is not None:
            self._data.parse_userconf_data(user_conf_data)
            return True
        return False

    async def asunc_user_conf_with_token(self, token):
        """Request the user's configuration data with an alternate token string."""
        self._data.token = token
        return await self.async_user_conf()

    async def async_user_conf(self):
        """Request the user's configuration data."""
        LOGGER.debug("📡 Retrieving list of user's devices...")
        url = f"https://{self._data.host}/{AKUVOX_API_USERCONF}?token={self._data.token}"
        data = {}
        headers = {
            "Host": self._data.host,
            "X-AUTH-TOKEN": self._data.token,
            "Connection": "keep-alive",
            "api-version": AKUVOX_USERCONF_API_VERSION,
            "Accept": "*/*",
            "User-Agent": "VBell/6.61.2 (iPhone; iOS 16.6; Scale/3.00)",
            "Accept-Language": "en-AU;q=1, he-AU;q=0.9, ru-RU;q=0.8",
            "x-cloud-lang": "en"
        }
        json_data = await self._api_wrapper(method="get", url=url, headers=headers, data=data)

        if json_data is not None:
            LOGGER.debug("✅ User's device list retrieved successfully")
            return json_data

        LOGGER.error("❌ Unable to retrieve user's device list'.")
        return None

    def make_opendoor_request(self, name: str, host: str, token: str, data: str):
        """Request the user's configuration data."""
        LOGGER.debug("📡 Sending request to open door '%s'...", name)
        url = f"https://{host}/{AKUVOX_API_OPENDOOR}?token={token}"
        headers = {
            "Host": host,
            "Content-Type": "application/x-www-form-urlencoded",
            "X-AUTH-TOKEN": token,
            "api-version": AKUVOV_OPENDOOR_API_VERSION,
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

    ###########################

    async def _api_wrapper(
        self,
        method: str,
        url: str,
        data: dict | None = None,
        headers: dict | None = None,
    ):
        """Get information from the API."""
        try:
            async with async_timeout.timeout(10):
                func = self.post_request if method == "post" else self.get_request
                response = await self.hass.async_add_executor_job(func, url, headers, data)
                return self.process_response(response)

        except asyncio.TimeoutError as exception:
            raise AkuvoxApiClientCommunicationError(
                f"Timeout error fetching information {exception}",
            ) from exception
        except (aiohttp.ClientError, socket.gaierror) as exception:
            raise AkuvoxApiClientCommunicationError(
                f"Error fetching information {exception}",
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
                if "result" in json_data and json_data["result"] == 0:
                    if "datas" in json_data:
                        return json_data["datas"]
                    return json_data
                LOGGER.warning("🤨 Response: %s", str(json_data))
            except Exception as error:
                LOGGER.error(
                    "❌ Error occurred when parsing JSON: %s", error)
        else:
            LOGGER.debug("Error: HTTP status code %s",
                         response.status_code)
        return None

    ###################
    # Request Methods #
    ###################

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
                    LOGGER.debug("json_data = %s", str(json_data))
                    return json_data
                except Exception as error:
                    LOGGER.warning(
                        "Error occurred when parsing JSON: %s", error)
            else:
                LOGGER.debug("Error: HTTP status code %s",
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

