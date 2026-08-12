"""Akuvox API Client."""
from __future__ import annotations

import asyncio
import json
import socket
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from homeassistant.core import HomeAssistant

import aiohttp
import async_timeout

from .data import AkuvoxData

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
    USER_AGENT,
    SMARTPLUS_USER_AGENT,
    SMARTPLUS_USER_AGENT_ALT,
)


class AkuvoxApiClientError(Exception):
    """Exception to indicate a general API error."""


class AkuvoxApiClientCommunicationError(AkuvoxApiClientError):
    """Exception to indicate a communication error."""


class AkuvoxApiClientAuthenticationError(AkuvoxApiClientError):
    """Exception to indicate an authentication error."""

class AkuvoxApiClient:
    """Sample API Client."""

    _data: AkuvoxData | None = None
    hass: HomeAssistant
    _polling_task: asyncio.Task | None = None
    _polling_task_stop_event: asyncio.Event | None = None

    def __init__(
        self,
        session: aiohttp.ClientSession,
        hass: HomeAssistant,
        entry,
    ) -> None:
        """Akuvox API Client."""
        self._session = session
        self.hass = hass
        if entry:
            LOGGER.debug("▶️ Initializing AkuvoxData from API client init")
            self._data = AkuvoxData(
                entry=entry,
                hass=hass) # type: ignore

    async def async_init_api(self) -> bool:
        """Initialize API configuration data."""
        if not await self._async_ensure_rest_server():
            return False

        if not self._data.rtsp_ip:
            if not await self.async_make_servers_list_request(
                hass=self.hass,
                auth_token=self._data.auth_token,
                token=self._data.token,
                country_code=self.hass.config.country,
                phone_number=self._data.phone_number,
            ):
                LOGGER.error("❌ API request for servers list failed.")
                return False
        return bool(self._data.rtsp_ip)

    async def _async_ensure_rest_server(self) -> bool:
        """Resolve the SmartPlus REST server before making account requests."""
        if self._data is None:
            raise AkuvoxApiClientError("API client data has not been initialized")
        if self._data.host:
            return True
        return await self.async_fetch_rest_server()

    async def async_start_polling(self):
        """Start polling the personal door log API."""
        if self._polling_task_stop_event is None:
            self._polling_task_stop_event = asyncio.Event()
        if self._polling_task is not None and not self._polling_task.done():
            LOGGER.debug("Polling already running, not restarting.")
            return
        self._polling_task_stop_event.clear()
        self._polling_task = self.hass.async_create_task(self._poll_personal_door_log())

    async def async_stop_polling(self):
        """Stop polling the personal door log API."""
        if self._polling_task_stop_event is not None:
            self._polling_task_stop_event.set()
        if self._polling_task is None:
            return
        if asyncio.current_task() is self._polling_task:
            return
        self._polling_task.cancel()
        try:
            await self._polling_task
        except asyncio.CancelledError:
            pass
        finally:
            self._polling_task = None

    async def _poll_personal_door_log(self):
        """Poll the server continuously for the latest personal door log, can be stopped."""
        assert self._polling_task_stop_event is not None
        while not self._polling_task_stop_event.is_set():
            poll_interval = 2
            try:
                if not await self.async_retrieve_personal_door_log():
                    poll_interval = 30
            except AkuvoxApiClientError as error:
                LOGGER.error("Unable to retrieve personal door log: %s", error)
                poll_interval = 30
            try:
                await asyncio.wait_for(
                    self._polling_task_stop_event.wait(), timeout=poll_interval
                )
            except asyncio.TimeoutError:
                continue

    def init_api_with_data(self,
                           hass: HomeAssistant,
                           host=None,
                           subdomain=None,
                           auth_token=None,
                           token=None,
                           phone_number=None,
                           country_code=None):
        """"Initialize values from saved data/options."""
        if not self._data:
            LOGGER.debug("▶️ Initializing AkuvoxData from API client init_api_with_data")
            self._data = AkuvoxData(
                entry=None, # type: ignore
                hass=hass,
                host=host, # type: ignore
                subdomain=subdomain, # type: ignore
                auth_token=auth_token, # type: ignore
                token=token, # type: ignore
                phone_number=phone_number, # type: ignore
                country_code=country_code) # type: ignore
        self.hass = self.hass if self.hass else hass

    ####################
    # API Call Methods #
    ####################

    async def async_fetch_rest_server(self) -> bool:
        """Retrieve the Akuvox REST server addresses and data."""
        LOGGER.debug("📡 Fetching REST server data...")
        json_data = await self._async_api_wrapper(
            method="get",
            url=f"https://{REST_SERVER_ADDR}:{REST_SERVER_PORT}/{API_REST_SERVER_DATA}",
            data=None,
            headers={
                'api-version': REST_SERVER_API_VERSION
            }
        )
        if json_data is not None:
            LOGGER.debug("✅ REST server data received successfully")
            if self._data.parse_rest_server_response(json_data):
                return True
            LOGGER.error("❌ Unable to parse Akuvox server rest API data.")
        else:
            LOGGER.error("❌ Unable to fetch Akuvox server rest API data.")
        return False

    async def async_send_sms(self, hass: HomeAssistant, country_code: str, phone_number: str, subdomain: str) -> bool:
        """Request SMS code to user's device."""
        self.init_api_with_data(
            hass=hass,
            subdomain=subdomain,
            country_code=country_code,
            phone_number=phone_number)
        if await self._async_ensure_rest_server():
            url = f"https://{self._data.host}/{API_SEND_SMS}".replace(".subdomain", f".{subdomain}")
            headers = {
                "Host": self._data.host,
                "Content-Type": "application/x-www-form-urlencoded",
                "X-AUTH-TOKEN": "",
                "Connection": "keep-alive",
                "Accept": "*/*",
                "User-Agent": USER_AGENT,
                "Accept-Language": "en-AU;q=1, he-AU;q=0.9, ru-RU;q=0.8",
                "x-cloud-lang": "en"
            }
            data = {
                "AreaCode": country_code,
                "MobileNumber": phone_number,
                "Type": 0
            }
            LOGGER.debug("📡 Requesting SMS code from subdomain %s...", subdomain)
            response = await self._async_api_wrapper(
                method="post",
                url=url,
                headers=headers,
                data=data,
            )
            if isinstance(response, dict) and response.get("result") == 0:
                LOGGER.debug("✅ SMS code request successful")
                return True

            LOGGER.error("❌ SMS code request unsuccessful")
        else:
            LOGGER.error("❌ Unable to initialize API. Did you login again from your device? Try logging in/adding tokens again.")
        return False

    async def async_make_servers_list_request(
        self,
        hass: HomeAssistant,
        auth_token: str,
        token: str,
        country_code: str,
        phone_number: str,
        subdomain: str = ""
    ) -> bool:
        """Request server list data."""
        self.init_api_with_data(
            hass=hass,
            subdomain=subdomain,
            auth_token=auth_token,
            token=token,
            country_code=country_code,
            phone_number=phone_number)
        if not auth_token or not token or not phone_number:
            LOGGER.error("SmartPlus account tokens and phone number are required")
            return False
        if not await self._async_ensure_rest_server():
            return False


        url = f"https://{REST_SERVER_ADDR}:{REST_SERVER_PORT}/{API_SERVERS_LIST}"
        headers = {
            "accept": "*/*",
            "content-type": "application/json",
            "x-auth-token": token,
            "api-version": "6.8",
            "x-cloud-lang": "en",
            "user-agent": "VBell/7.36.2 (iPhone; iOS 26.3.1; Scale/3.00)",
            "accept-language": "en-US;q=1"
        }

        # Try GET first (used by US/ucloud API)
        LOGGER.debug("📡 Requesting server list (GET)...")
        json_data = await self._async_api_wrapper(
            method="get",
            url=url,
            headers=headers,
            data=None,
        )
        if json_data is not None:
            LOGGER.debug("✅ Server list retrieved successfully (GET)")
            self._data.parse_sms_login_response(json_data)
            if self._data.rtsp_ip:
                return True

        # Fall back to POST (used by other regional APIs)
        LOGGER.debug("📡 Requesting server list (POST fallback)...")
        obfuscated_number = str(self.get_obfuscated_phone_number(phone_number))
        data = json.dumps({
            "auth_token": auth_token,
            "passwd": auth_token,
            "token": token,
            "user": obfuscated_number,
        })
        json_data = await self._async_api_wrapper(
            method="post",
            url=url,
            headers=headers,
            data=data,
        )
        if json_data is not None:
            LOGGER.debug("✅ Server list retrieved successfully (POST)")
            self._data.parse_sms_login_response(json_data)
            return bool(self._data.rtsp_ip)

        LOGGER.error("❌ Unable to retrieve server list. Try sigining in again / check that your tokens are valid.")
        return False

    async def async_sms_sign_in(self, phone_number, country_code, sms_code) -> bool:
        """Sign user in with their phone number and SMS code."""

        login_data = await self.async_validate_sms_code(phone_number, country_code, sms_code)
        if login_data is not None:
            self._data.parse_sms_login_response(login_data)
            if not self._data.rtsp_ip:
                return await self.async_retrieve_user_data()
            device_data_loaded = await self.async_retrieve_device_data()
            await self.async_retrieve_temp_keys_data()
            if device_data_loaded:
                await self.async_start_polling()
            return device_data_loaded

        return False

    async def async_validate_sms_code(self, phone_number: str, country_code: str, sms_code: str) -> dict | None:
        """Validate the SMS code received by the user."""
        LOGGER.debug("📡 Logging in user with phone number and SMS code...")

        obfuscated_number = self.get_obfuscated_phone_number(phone_number)
        params = f"phone={obfuscated_number}&code={sms_code}&area_code={country_code}"
        url = f"https://{REST_SERVER_ADDR}:{REST_SERVER_PORT}/{API_SMS_LOGIN}?{params}"
        data = {}
        headers = {
            'api-version': SMS_LOGIN_API_VERSION,
            'User-Agent': USER_AGENT
        }
        response = await self._async_api_wrapper(method="get", url=url, headers=headers, data=data)

        if response is not None:
            LOGGER.debug("✅ Login successful")
            return response

        LOGGER.error("❌ Unable to log in with SMS code.")
        return None

    async def async_retrieve_user_data(self) -> bool:
        """Retrieve user devices and temp keys data."""
        if await self.async_make_servers_list_request(
            hass=self.hass,
            auth_token=self._data.auth_token,
            token=self._data.token,
            country_code=self.hass.config.country,
            phone_number=self._data.phone_number):
            device_data_loaded = await self.async_retrieve_device_data()
            temp_keys_loaded = await self.async_retrieve_temp_keys_data()
            if device_data_loaded:
                await self.async_start_polling()
            if not temp_keys_loaded:
                LOGGER.warning("Temporary keys could not be loaded")
            return device_data_loaded
        return False

    async def async_retrieve_device_data(self) -> bool:
        """Request and parse the user's device data."""
        user_conf_data = await self.async_user_conf()
        if user_conf_data is not None:
            self._data.parse_userconf_data(user_conf_data) # type: ignore
            return True
        return False

    async def async_retrieve_user_data_with_tokens(self, auth_token, token) -> bool:
        """Retrieve user devices and temp keys data with an alternate token string."""
        self._data.auth_token = auth_token
        self._data.token = token
        return await self.async_retrieve_user_data()

    async def async_user_conf(self) -> dict | None:
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
            "User-Agent": USER_AGENT,
            "Accept-Language": "en-AU;q=1, he-AU;q=0.9, ru-RU;q=0.8",
            "x-cloud-lang": "en"
        }
        json_data = await self._async_api_wrapper(method="get", url=url, headers=headers, data=data)

        if json_data is not None:
            LOGGER.debug("✅ User's device list retrieved successfully")
            return json_data

        LOGGER.error("❌ Unable to retrieve user's device list.")
        return None

    async def async_make_opendoor_request(
        self, name: str, host: str, token: str, data: str
    ) -> dict | list | None:
        """Send an asynchronous request to open a door relay."""
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
            "User-Agent": USER_AGENT,
            "Accept-Language": "en-AU;q=1, he-AU;q=0.9, ru-RU;q=0.8",
            "x-cloud-lang": "en",
        }
        json_data = await self._async_api_wrapper(
            method="post", url=url, headers=headers, data=data
        )
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
        subdomain = self._data.subdomain # await self._data.async_get_stored_data_for_key("subdomain")
        url = f"https://{host}/{API_GET_PERSONAL_TEMP_KEY_LIST}"
        data = {}
        headers = {
            "x-cloud-version": "6.4",
            "accept": "application/json, text/plain, */*",
            "sec-fetch-site": "same-origin",
            "accept-language": "en-AU,en;q=0.9",
            "sec-fetch-mode": "cors",
            "x-cloud-lang": "en",
            "user-agent": SMARTPLUS_USER_AGENT,
            "referer": f"https://{subdomain}.akuvox.com/smartplus/TmpKey.html?TOKEN={self._data.token}&USERTYPE=20&VERSION=6.6",
            "x-auth-token": self._data.token,
            "sec-fetch-dest": "empty"
        }

        json_data = await self._async_api_wrapper(method="get", url=url, headers=headers, data=data)

        if json_data is not None:
            LOGGER.debug("✅ User's temporary keys list retrieved successfully")
            return json_data

        LOGGER.error("❌ Unable to retrieve user's temporary key list.")
        return None

    async def async_start_polling_personal_door_log(self):
        """Poll the server continuously for the latest personal door log (calls improved polling)."""
        await self.async_start_polling()

    async def async_retrieve_personal_door_log(self) -> bool:
        """Fetch, parse, and publish one personal-door-log update."""
        json_data = await self.async_get_personal_door_log()
        if json_data is None:
            return False
        new_door_log = await self._data.async_parse_personal_door_log(json_data)
        if new_door_log is not None:
            LOGGER.debug("🚪 New door open event occurred. Firing akuvox_door_update event")
            self.hass.bus.async_fire("akuvox_door_update", new_door_log)
        return True

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
            "user-agent": SMARTPLUS_USER_AGENT_ALT,
            "referer": f"https://{self._data.subdomain}.akuvox.com/smartplus/Activities.html?TOKEN={self._data.token}",
            "x-auth-token": self._data.token,
            "sec-fetch-dest": "empty"
        }

        json_data = await self._async_api_wrapper(
            method="get", url=url, headers=headers, data=data
        )

        # Response empty, try changing app type "single" <--> "community"
        if isinstance(json_data, list) and not json_data:
            self.switch_activities_host()
            host = self.get_activities_host()
            url = f"https://{host}/{API_GET_PERSONAL_DOOR_LOG}"
            json_data = await self._async_api_wrapper(
                method="get", url=url, headers=headers, data=data
            )

        if isinstance(json_data, list) and json_data:
            return json_data
        LOGGER.debug("No personal door log data returned")
        return None

    ###################
    # Request Methods #
    ###################

    async def _async_api_wrapper(
        self,
        method: str,
        url: str,
        data,
        headers: dict | None = None,
    ):
        """Get information from the API with aiohttp (fully async)."""
        try:
            async with async_timeout.timeout(10):
                subdomain = self._data.subdomain
                url = url.replace("subdomain.", f"{subdomain}.")
                redacted_url = self._redact_url(url)
                if not url.endswith(API_GET_PERSONAL_DOOR_LOG):
                    LOGGER.debug("⏳ Sending request to: %s", redacted_url)
                async with self._session.request(
                    method, url, headers=headers, data=data
                ) as response:
                    return await self._async_process_async_response(response, url)

        except asyncio.TimeoutError as exception:
            # Fix for accounts which use the "single" endpoint instead of "community"
            app_type_1 = "community"
            app_type_2 = "single"
            if f"app/{app_type_1}/" in url:
                LOGGER.warning("Request 'app/%s' API %s request timed out; retrying '%s' endpoint",
                               app_type_1,
                               method,
                               app_type_2)
                self._data.app_type = app_type_2
                url = url.replace("app/"+app_type_1+"/", "app/"+app_type_2+"/")
                return await self._async_api_wrapper(method, url, data, headers)
            if f"app/{app_type_2}/" in url:
                LOGGER.error("Timeout occured for 'app/%s' API %s request: %s",
                             app_type_2,
                             method,
                             url)
                self._data.app_type = app_type_1
            raise AkuvoxApiClientCommunicationError("Timed out fetching SmartPlus API data") from exception
        except (aiohttp.ClientError, socket.gaierror) as exception:
            raise AkuvoxApiClientCommunicationError(
                f"Error fetching SmartPlus API data: {type(exception).__name__}",
            ) from exception
        except Exception as exception:  # Final fallback
            LOGGER.exception("❌ Unexpected error during SmartPlus API call")
            raise AkuvoxApiClientError(
                f"Unexpected SmartPlus API error: {type(exception).__name__}"
            ) from exception
        return None

    @staticmethod
    def _redact_url(url: str) -> str:
        """Return a URL suitable for logging without exposing credentials or tokens."""
        parsed = urlsplit(url)
        netloc = parsed.hostname or ""
        if parsed.port:
            netloc = f"{netloc}:{parsed.port}"
        query = urlencode([(key, "***") for key, _value in parse_qsl(parsed.query)])
        return urlunsplit((parsed.scheme, netloc, parsed.path, query, ""))

    async def _async_process_async_response(self, response: aiohttp.ClientResponse, url: str):
        """Process aiohttp response and return dict with data (non-blocking)."""
        if response.status == 200:
            try:
                json_data = await response.json()
            except (aiohttp.ContentTypeError, ValueError):
                try:
                    text = await response.text()
                    json_data = json.loads(text)
                except (TypeError, ValueError) as error:
                    LOGGER.error("❌ Error parsing JSON response: %s", error)
                    return None

            if not isinstance(json_data, dict):
                LOGGER.warning("🤨 Unexpected SmartPlus API response type")
                return None

            # Standard requests
            if json_data and "result" in json_data and json_data["result"] == 0:
                if "datas" in json_data:
                    return json_data["datas"]
                return json_data

            # US API format (err_code instead of result)
            if "err_code" in json_data and str(json_data["err_code"]) == "0":
                if "datas" in json_data:
                    return json_data["datas"]
                return json_data

            # Temp key requests
            if "code" in json_data:
                if json_data["code"] == 0:
                    if "data" in json_data:
                        return json_data["data"]
                    return json_data

                # Request returned an error

                # Invalid identity information error
                elif json_data["code"] == 2:
                    LOGGER.error("❌ SmartPlus returned invalid identity information")
                    await self.async_stop_polling()

                else:
                    LOGGER.error("❌ SmartPlus API returned error code %s", json_data["code"])

                return []

            LOGGER.warning("🤨 Unexpected SmartPlus API response schema")
        else:
            LOGGER.debug("❌ Error: HTTP status code = %s for request to %s",
                         response.status,
                         url)
        return None

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
        if (phone_number is None or len(phone_number) == 0):
            LOGGER.error("No phone number provided for obfuscation")
        # Mask phone number
        try:
            num_str = str(phone_number)
        except Exception as error:
            LOGGER.error("Unable to get obfuscated phone number from %s: %s",
                         str(phone_number),
                         str(error))
            return False
        transformed_str = ""
        # Iterate through each digit in the input number
        for digit_char in num_str:
            digit = int(digit_char)
            # Add 3 to the digit and take the result modulo 10
            transformed_digit = (digit + 3) % 10
            transformed_str += str(transformed_digit)
        return transformed_str

    def get_activities_host(self):
        """Get the host address string for activities API requests."""
        if self._data.app_type == "single":
            return API_APP_HOST + "single"
        return API_APP_HOST + "community"

    def switch_activities_host(self):
        """Switch the activities host from single <--> community."""
        if self._data.app_type == "single":
            LOGGER.debug("Switching API address from 'single' to 'community'")
            self._data.app_type = "community"
        else:
            self._data.app_type = "single"
            LOGGER.debug("Switching API address from 'community' to 'single'")

    def update_data(self, key, value):
        """Update the data model."""
        self._data.subdomain = value if key == "subdomain" else self._data.subdomain
        self._data.auth_token = value if key == "auth_token" else self._data.auth_token
        self._data.token = value if key == "token" else self._data.token
        self._data.wait_for_image_url = value if key == "wait_for_image_url" else self._data.wait_for_image_url
