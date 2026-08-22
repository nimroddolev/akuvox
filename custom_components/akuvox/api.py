"""Akuvox API Client."""
from __future__ import annotations

import asyncio
import base64
import binascii
import csv
import io
import json
import re
import secrets
import socket
import zipfile
from collections.abc import Callable
from pathlib import Path
from typing import Any
from datetime import datetime, timezone
from time import time
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from homeassistant.core import CALLBACK_TYPE, HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.start import async_at_started

import aiohttp
import async_timeout

from .data import AkuvoxData
from .credentials import async_store_credentials, async_store_sip_credentials
from .repairs import (
    async_report_authentication_failure,
    async_update_activity_storage_warning,
)

from .const import (
    LOGGER,
    REST_SERVER_ADDR,
    REST_SERVER_PORT,
    API_SEND_SMS,
    SMS_LOGIN_API_VERSION,
    API_SMS_LOGIN,
    API_SERVERS_LIST,
    API_REFRESH_TOKEN,
    TOKEN_REFRESH_INTERVAL,
    TOKEN_REFRESHED_AT,
    TOKEN_UPDATE_TYPE,
    TOKEN_UPDATE_REFRESHED,
    DOOR_LOG_POLL_INTERVAL,
    ACTIVITY_ENDPOINT_TYPE,
    ACTIVITY_HISTORY_LIMIT,
    STORE_ACTIVITY_HISTORY,
    ACTIVITY_HISTORY_MAX_STORAGE_MB,
    PANEL_DATA_UPDATED_EVENT,
    REST_SERVER_API_VERSION,
    API_REST_SERVER_DATA,
    USERCONF_API_VERSION,
    API_USERCONF,
    OPENDOOR_API_VERSION,
    API_OPENDOOR,
    API_APP_HOST,
    API_GET_PERSONAL_TEMP_KEY_LIST,
    API_CREATE_TEMP_KEY,
    API_EDIT_TEMP_KEY,
    API_DELETE_TEMP_KEY,
    API_GET_PERSONAL_DOOR_LOG,
    API_GET_CALL_LOG,
    API_DOOR_LOG_HOST,
    USER_AGENT,
    SMARTPLUS_USER_AGENT,
    SMARTPLUS_USER_AGENT_ALT,
    SMARTPLUS_REFRESH_USER_AGENT,
)


class AkuvoxApiClientError(Exception):
    """Exception to indicate a general API error."""


class AkuvoxApiClientCommunicationError(AkuvoxApiClientError):
    """Exception to indicate a communication error."""


class AkuvoxApiClientAuthenticationError(AkuvoxApiClientError):
    """Exception to indicate an authentication error."""


class AkuvoxApiClientRateLimitError(AkuvoxApiClientError):
    """Exception to indicate SmartPlus rate limiting."""


class AkuvoxApiClient:
    """Sample API Client."""

    def __init__(
        self,
        session: aiohttp.ClientSession,
        hass: HomeAssistant,
        entry: ConfigEntry | None,
        credentials: dict[str, str] | None = None,
    ) -> None:
        """Akuvox API Client."""
        self._session = session
        self.hass = hass
        self._entry = entry
        self._data: AkuvoxData | None = None
        self._polling_task: asyncio.Task[None] | None = None
        self._polling_task_stop_event: asyncio.Event | None = None
        self._polling_start_unsub: CALLBACK_TYPE | None = None
        self._token_refresh_lock = asyncio.Lock()
        self._door_log_failure_logged = False
        self._door_log_backoff = DOOR_LOG_POLL_INTERVAL
        self._token_refresh_unsub: Callable[[], None] | None = None
        self._skip_next_entry_reload = False
        self._activity_history: list[dict[str, Any]] = []
        self._activity_history_loaded = False
        self._call_history: list[dict[str, Any]] = []
        self._call_history_loaded = False
        if entry:
            LOGGER.debug("▶️ Initializing AkuvoxData from API client init")
            self._data = AkuvoxData(
                entry=entry,
                hass=hass,
                auth_token=(credentials or {}).get("auth_token"),
                token=(credentials or {}).get("token"),
            ) # type: ignore
            self._door_log_backoff = self._data.door_log_poll_interval

    @property
    def config_entry(self) -> ConfigEntry | None:
        """Return the associated Home Assistant configuration entry."""
        return self._entry

    async def async_init_api(self) -> bool:
        """Initialize API configuration data."""
        if not await self._async_ensure_rest_server():
            return False

        if not self._data.rtsp_server:
            if not await self.async_make_servers_list_request(
                hass=self.hass,
                auth_token=self._data.auth_token,
                token=self._data.token,
                country_code=self._data.country_code,
                phone_number=self._data.phone_number,
                subdomain=self._data.subdomain,
            ):
                LOGGER.error("❌ API request for servers list failed.")
                return False
        return bool(self._data.rtsp_server)

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
        if self._polling_start_unsub is not None:
            self._polling_start_unsub()
            self._polling_start_unsub = None
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
            poll_interval = self._data.door_log_poll_interval
            try:
                if not await self.async_retrieve_personal_door_log():
                    self._note_door_log_failure()
                    poll_interval = self._increase_door_log_backoff()
                elif self._door_log_failure_logged:
                    LOGGER.info("Personal door-log polling recovered")
                    self._door_log_failure_logged = False
                    self._door_log_backoff = self._data.door_log_poll_interval
            except AkuvoxApiClientError as error:
                self._note_door_log_failure(error)
                poll_interval = self._increase_door_log_backoff()
            try:
                await asyncio.wait_for(
                    self._polling_task_stop_event.wait(), timeout=poll_interval
                )
            except asyncio.TimeoutError:
                continue

    def _increase_door_log_backoff(self) -> int:
        """Return the next quiet retry interval for a failed activity request."""
        self._door_log_backoff = min(
            self._door_log_backoff * 2, self._data.door_log_max_backoff
        )
        return self._door_log_backoff

    def _note_door_log_failure(
        self, error: AkuvoxApiClientError | None = None
    ) -> None:
        """Log one failed poll cycle, then suppress identical retry failures."""
        if self._door_log_failure_logged:
            return
        if error is None:
            LOGGER.warning(
                "Unable to retrieve personal door log after retry; "
                "further failures will be suppressed until it recovers"
            )
        else:
            LOGGER.warning(
                "Unable to retrieve personal door log after retry: %s; "
                "further failures will be suppressed until it recovers",
                error,
            )
        self._door_log_failure_logged = True

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

        # The GET variant is only served by the US regional endpoint. Calling
        # it first for ecloud and other regions can time out before the POST
        # request they require is ever attempted.
        if self._data.subdomain == "ucloud":
            LOGGER.debug("📡 Requesting server list (GET)...")
            try:
                json_data = await self._async_api_wrapper(
                    method="get",
                    url=url,
                    headers=headers,
                    data=None,
                )
            except AkuvoxApiClientCommunicationError as error:
                LOGGER.debug("US server-list GET failed; trying POST: %s", error)
                json_data = None
            if json_data is not None:
                LOGGER.debug("✅ Server list retrieved successfully (GET)")
                self._data.parse_sms_login_response(json_data)
                if self._data.rtsp_server:
                    return True

        LOGGER.debug("📡 Requesting server list (POST)...")
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
            return bool(self._data.rtsp_server)

        LOGGER.error("❌ Unable to retrieve server list. Try sigining in again / check that your tokens are valid.")
        return False

    async def async_refresh_token(self, failed_token: str) -> bool:
        """Refresh a SmartPlus session token and persist the replacement.

        SmartPlus uses ``auth_token`` as the credential for this private endpoint
        and returns a new short-lived ``token``.  Only one request may refresh at
        a time so concurrent API calls cannot overwrite a newer session.
        """
        if self._data is None or not self._data.auth_token:
            raise AkuvoxApiClientAuthenticationError("No SmartPlus refresh credential is available")

        async with self._token_refresh_lock:
            # Another failed request may already have completed the refresh.
            if self._data.token and self._data.token != failed_token:
                return True

            LOGGER.debug("SmartPlus token refresh starting")
            url = f"https://{REST_SERVER_ADDR}:{REST_SERVER_PORT}/{API_REFRESH_TOKEN}"
            headers = {
                "accept": "*/*",
                "content-type": "application/json",
                "x-auth-token": self._data.token,
                "api-version": "6.8",
                "x-cloud-lang": "en",
                "user-agent": SMARTPLUS_REFRESH_USER_AGENT,
                "accept-language": "en-AU;q=1, he-AU;q=0.9, ru-RU;q=0.8",
            }
            try:
                response = await self._async_api_wrapper(
                    method="post",
                    url=url,
                    headers=headers,
                    data=json.dumps({"auth_token": self._data.auth_token}),
                    allow_token_refresh=False,
                )
                if not isinstance(response, dict) or not response.get("token"):
                    raise AkuvoxApiClientAuthenticationError(
                        "SmartPlus did not return a refreshed session token"
                    )

                self._data.token = str(response["token"])
                if response.get("auth_token"):
                    self._data.auth_token = str(response["auth_token"])
                await self._async_persist_refreshed_credentials()
            except Exception as error:
                LOGGER.debug(
                    "SmartPlus token refresh finished: failed (%s)",
                    type(error).__name__,
                )
                raise
            LOGGER.debug("SmartPlus token refresh finished: succeeded")
            return True

    async def _async_persist_refreshed_credentials(self) -> None:
        """Persist refreshed credentials to the active config entry."""
        if self._entry is None or self._data is None:
            return

        data = dict(self._entry.data)
        options = dict(self._entry.options)
        data.pop("auth_token", None)
        data.pop("token", None)
        options.pop("auth_token", None)
        options.pop("token", None)
        await async_store_credentials(
            self.hass, self._entry.entry_id, self._data.auth_token, self._data.token
        )
        target = options if options.get("override", False) else data
        target[TOKEN_REFRESHED_AT] = datetime.now(timezone.utc).isoformat()
        target[TOKEN_UPDATE_TYPE] = TOKEN_UPDATE_REFRESHED
        self._skip_next_entry_reload = True
        self.hass.config_entries.async_update_entry(
            self._entry,
            data=data,
            options=options,
        )
        self._notify_panel_data_updated()

    def _async_persist_activity_endpoint(self) -> None:
        """Persist the verified activity endpoint without disrupting entities."""
        if self._entry is None or self._data is None:
            return
        data = dict(self._entry.data)
        if data.get(ACTIVITY_ENDPOINT_TYPE) == self._data.app_type:
            return
        data[ACTIVITY_ENDPOINT_TYPE] = self._data.app_type
        self._skip_next_entry_reload = True
        self.hass.config_entries.async_update_entry(
            self._entry,
            data=data,
            options=dict(self._entry.options),
        )

    def consume_entry_reload_skip(self) -> bool:
        """Return whether the next config-entry update needs no reload."""
        if not self._skip_next_entry_reload:
            return False
        self._skip_next_entry_reload = False
        return True

    def async_start_proactive_token_refresh(self) -> None:
        """Keep the SmartPlus session fresh before its undocumented expiry.

        SmartPlus does not return an expiry timestamp, so renewal is scheduled
        conservatively.  The timestamp is persisted to avoid resetting the
        interval whenever Home Assistant restarts.
        """
        if self._entry is None or self._data is None or self._token_refresh_unsub:
            return

        self._token_refresh_unsub = async_track_time_interval(
            self.hass,
            self._async_proactive_token_refresh,
            TOKEN_REFRESH_INTERVAL,
        )
        if self._is_token_refresh_due():
            self.hass.async_create_task(self._async_proactive_token_refresh(None))

    def async_stop_proactive_token_refresh(self) -> None:
        """Cancel the periodic SmartPlus token-refresh callback."""
        if self._token_refresh_unsub:
            self._token_refresh_unsub()
            self._token_refresh_unsub = None

    def _is_token_refresh_due(self) -> bool:
        """Return whether a persisted session has reached its refresh interval."""
        if self._entry is None:
            return False
        source = self._entry.options if self._entry.options.get("override", False) else self._entry.data
        refreshed_at = source.get(TOKEN_REFRESHED_AT)
        if not isinstance(refreshed_at, str):
            return True
        try:
            last_refresh = datetime.fromisoformat(refreshed_at)
            if last_refresh.tzinfo is None:
                return True
        except ValueError:
            return True
        return datetime.now(timezone.utc) - last_refresh >= TOKEN_REFRESH_INTERVAL

    async def _async_proactive_token_refresh(self, _now) -> None:
        """Refresh the session before expiry and surface a non-recoverable failure."""
        if self._data is None or not self._data.token:
            return
        try:
            await self.async_refresh_token(self._data.token)
        except AkuvoxApiClientAuthenticationError:
            LOGGER.error("SmartPlus token refresh failed; reauthentication is required")
            self._report_authentication_failure()
        except AkuvoxApiClientError as error:
            LOGGER.warning("Scheduled SmartPlus token refresh failed: %s", error)

    async def async_sms_sign_in(
        self, phone_number, country_code, sms_code, start_polling: bool = True
    ) -> bool:
        """Sign user in with their phone number and SMS code."""

        login_data = await self.async_validate_sms_code(phone_number, country_code, sms_code)
        if login_data is not None:
            self._data.parse_sms_login_response(login_data)
            if not self._data.rtsp_server:
                return await self.async_retrieve_user_data(start_polling=start_polling)
            device_data_loaded = await self.async_retrieve_device_data()
            await self.async_retrieve_temp_keys_data()
            if device_data_loaded and start_polling:
                await self.async_start_polling_personal_door_log()
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

    async def async_retrieve_user_data(self, start_polling: bool = True) -> bool:
        """Retrieve user devices and temp keys data."""
        if await self.async_make_servers_list_request(
            hass=self.hass,
            auth_token=self._data.auth_token,
            token=self._data.token,
            country_code=self._data.country_code,
            phone_number=self._data.phone_number,
            subdomain=self._data.subdomain,
        ):
            device_data_loaded = await self.async_retrieve_device_data()
            temp_keys_loaded = await self.async_retrieve_temp_keys_data()
            if device_data_loaded and start_polling:
                await self.async_start_polling_personal_door_log()
            if not temp_keys_loaded:
                LOGGER.warning("Temporary keys could not be loaded")
            return device_data_loaded
        return False

    async def async_retrieve_device_data(self) -> bool:
        """Request and parse the user's device data."""
        user_conf_data = await self.async_user_conf()
        if user_conf_data is not None:
            previous_panel_data = self.get_panel_data()
            self._data.parse_userconf_data(user_conf_data) # type: ignore
            if (
                self._entry
                and self._data.sip_server
                and self._data.sip_account
                and self._data.sip_password
            ):
                await async_store_sip_credentials(
                    self.hass,
                    self._entry.entry_id,
                    {
                        "sip_server": self._data.sip_server,
                        "sip_account": self._data.sip_account,
                        "sip_password": self._data.sip_password,
                        "sip_transport": self._data.sip_transport,
                    },
                )
            if self.get_panel_data() != previous_panel_data:
                self._notify_panel_data_updated()
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
            previous_keys = self.get_panel_data()["temporary_keys"]
            self._data.parse_temp_keys_data(json_data)
            if self.get_panel_data()["temporary_keys"] != previous_keys:
                self._notify_panel_data_updated()
            return True
        return False

    async def async_get_temp_key_list(self):
        """Request the user's configuration data."""
        LOGGER.debug("📡 Retrieving list of user's temporary keys...")
        host = self.get_activities_host()
        subdomain = self._data.subdomain # await self._data.async_get_stored_data_for_key("subdomain")
        # SmartPlus can serve a cached key list for the fixed row/page URL,
        # causing a successful edit to appear to revert in the sidebar.
        url = f"https://{host}/{API_GET_PERSONAL_TEMP_KEY_LIST}&_t={int(time() * 1000)}"
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
            "sec-fetch-dest": "empty",
            "cache-control": "no-cache",
        }

        json_data = await self._async_api_wrapper(method="get", url=url, headers=headers, data=data)

        if json_data is not None:
            LOGGER.debug("✅ User's temporary keys list retrieved successfully")
            return json_data

        LOGGER.error("❌ Unable to retrieve user's temporary key list.")
        return None

    async def async_start_polling_personal_door_log(self):
        """Start activity polling only after Home Assistant has finished starting."""
        if self._polling_task is not None and not self._polling_task.done():
            return
        if self._polling_start_unsub is not None:
            return
        self._polling_start_unsub = async_at_started(
            self.hass, self._async_start_polling_after_hass_started
        )

    async def _async_start_polling_after_hass_started(
        self, _hass: HomeAssistant
    ) -> None:
        """Create the long-lived poller after Home Assistant startup."""
        self._polling_start_unsub = None
        await self.async_start_polling()

    async def async_retrieve_personal_door_log(self) -> bool:
        """Fetch, parse, and publish one personal-door-log update."""
        json_data = await self.async_get_personal_door_log()
        if json_data is None:
            return False
        await self._async_record_panel_activity(json_data)
        try:
            await self.async_retrieve_call_history()
        except AkuvoxApiClientError as error:
            LOGGER.debug("Unable to refresh SmartPlus call history: %s", error)
        new_door_log = await self._data.async_parse_personal_door_log(json_data)
        if new_door_log is not None:
            LOGGER.debug("🚪 New door open event occurred. Firing akuvox_door_update event")
            self.hass.bus.async_fire("akuvox_door_update", new_door_log)
        return True

    async def _async_record_panel_activity(self, events: list[dict[str, Any]]) -> None:
        """Restore and persist the latest cloud activity for the sidebar panel."""
        if not self._activity_history_loaded:
            stored_history = await self._data.async_get_stored_data_for_key(
                "panel_activity_history"
            )
            if isinstance(stored_history, list):
                self._activity_history = [
                    dict(event) for event in stored_history if isinstance(event, dict)
                ]
                if not self._activity_storage_enabled():
                    self._activity_history = self._activity_history[:ACTIVITY_HISTORY_LIMIT]
            self._activity_history_loaded = True
        existing = {
            str(item.get("CaptureTime", "")): index
            for index, item in enumerate(self._activity_history)
        }
        changed = False
        for event in reversed(events):
            if not isinstance(event, dict):
                continue
            event_time = str(event.get("CaptureTime", ""))
            if not event_time:
                continue
            existing_index = existing.get(event_time)
            if existing_index is None:
                self._activity_history.insert(0, dict(event))
                existing = {
                    str(item.get("CaptureTime", "")): index
                    for index, item in enumerate(self._activity_history)
                }
                changed = True
            elif self._activity_history[existing_index] != event:
                self._activity_history[existing_index] = dict(event)
                changed = True
        if self._activity_storage_enabled():
            changed = await self._async_store_activity_previews() or changed
            changed = self._prune_activity_storage() or changed
            async_update_activity_storage_warning(
                self.hass,
                self._entry,
                self.get_activity_storage_usage_bytes(),
                self._activity_storage_limit_bytes(),
            )
        else:
            del self._activity_history[ACTIVITY_HISTORY_LIMIT:]
        if changed:
            await self._data.async_set_stored_data_for_key(
                "panel_activity_history", self._activity_history
            )
            self._notify_panel_data_updated(
                activity_storage_usage_bytes=self.get_activity_storage_usage_bytes()
            )

    def _activity_storage_enabled(self) -> bool:
        return bool(self._entry and self._entry.options.get(STORE_ACTIVITY_HISTORY, False))

    def _activity_storage_limit_bytes(self) -> int:
        if not self._entry:
            return 0
        try:
            return max(0, int(self._entry.options.get(ACTIVITY_HISTORY_MAX_STORAGE_MB, 0))) * 1_000_000
        except (TypeError, ValueError):
            return 0

    def get_activity_storage_usage_bytes(self) -> int:
        """Return the space used by the persisted local activity history."""
        return len(
            json.dumps(
                self._activity_history,
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode("utf-8")
        )

    async def _async_store_activity_previews(self) -> bool:
        """Cache activity previews alongside their persisted event metadata."""
        changed = False
        for event in self._activity_history:
            if event.get("LocalPreview") or not event.get("PicUrl"):
                continue
            try:
                event["LocalPreview"] = await self.async_get_panel_activity_image(
                    str(event.get("CaptureTime", ""))
                )
                changed = True
            except AkuvoxApiClientError:
                continue
        return changed

    def _prune_activity_storage(self) -> bool:
        """Discard oldest locally stored events until the configured cap is met."""
        limit = self._activity_storage_limit_bytes()
        if not limit:
            return False
        removed = False
        while self._activity_history and self.get_activity_storage_usage_bytes() > limit:
            self._activity_history.pop()
            removed = True
        return removed

    async def async_clear_panel_activity_storage(self) -> None:
        """Remove every locally persisted activity record and preview image."""
        self._activity_history = []
        self._activity_history_loaded = True
        await self._data.async_set_stored_data_for_key("panel_activity_history", [])
        async_update_activity_storage_warning(
            self.hass, self._entry, 0, self._activity_storage_limit_bytes()
        )
        self._notify_panel_data_updated(activity_storage_usage_bytes=0)

    async def async_export_panel_activity_storage(self) -> dict[str, str]:
        """Build a ZIP archive of locally stored activity and call data."""
        await self._async_load_panel_activity_history()
        await self._async_load_panel_call_history()

        records: list[dict[str, Any]] = []
        images: list[tuple[str, bytes]] = []
        used_image_names: set[str] = set()
        for index, event in enumerate(self._activity_history, start=1):
            record = dict(event)
            preview = record.pop("LocalPreview", None)
            self._remove_cloud_image_urls(record)
            image_name = self._activity_export_image_name(record, index, used_image_names)
            if isinstance(preview, dict) and isinstance(preview.get("data"), str):
                try:
                    images.append(
                        (image_name, base64.b64decode(preview["data"], validate=True))
                    )
                    record["image_filename"] = f"images/{image_name}"
                except (binascii.Error, ValueError):
                    pass
            records.append(record)

        call_records = [dict(call) for call in self._call_history]
        for call in call_records:
            self._remove_cloud_image_urls(call)
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
            self._write_export_records(bundle, "activity", records)
            self._write_export_records(bundle, "call_history", call_records)
            for image_name, image_data in images:
                bundle.writestr(f"images/{image_name}", image_data)

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        return {
            "filename": f"akuvox_activity_{timestamp}.zip",
            "data": base64.b64encode(archive.getvalue()).decode("ascii"),
        }

    async def async_import_panel_data(self, archive_data: str) -> dict[str, int]:
        """Merge an exported local-data archive into this account's storage."""
        try:
            archive_bytes = base64.b64decode(archive_data, validate=True)
        except (binascii.Error, ValueError) as error:
            raise AkuvoxApiClientError("The selected file is not a valid export archive") from error
        if len(archive_bytes) > 100_000_000:
            raise AkuvoxApiClientError("The export archive is too large to import")

        try:
            with zipfile.ZipFile(io.BytesIO(archive_bytes)) as bundle:
                if sum(member.file_size for member in bundle.infolist()) > 100_000_000:
                    raise AkuvoxApiClientError("The export archive is too large to import")
                activity = self._read_import_records(bundle, "activity.json")
                calls = self._read_import_records(bundle, "call_history.json")
                image_names = set(bundle.namelist())
                for event in activity:
                    image_filename = event.pop("image_filename", "")
                    if not self._is_safe_export_image_name(image_filename, image_names):
                        continue
                    image_data = bundle.read(image_filename)
                    if len(image_data) <= 5_000_000:
                        event["LocalPreview"] = {
                            "content_type": "image/jpeg",
                            "data": base64.b64encode(image_data).decode("ascii"),
                        }
        except (OSError, ValueError, zipfile.BadZipFile) as error:
            raise AkuvoxApiClientError("The selected file is not a valid Akuvox data export") from error

        await self._async_load_panel_activity_history()
        await self._async_load_panel_call_history()
        added_activity = self._merge_panel_records(
            self._activity_history, activity, "CaptureTime"
        )
        added_calls = self._merge_panel_records(self._call_history, calls, "id")
        self._activity_history.sort(
            key=lambda event: str(event.get("CaptureTime", "")), reverse=True
        )
        self._call_history.sort(
            key=lambda call: str(call.get("captureTime") or call.get("time") or ""),
            reverse=True,
        )
        del self._call_history[ACTIVITY_HISTORY_LIMIT:]
        self._prune_activity_storage()
        await self._data.async_set_stored_data_for_key(
            "panel_activity_history", self._activity_history
        )
        await self._data.async_set_stored_data_for_key("panel_call_history", self._call_history)
        async_update_activity_storage_warning(
            self.hass,
            self._entry,
            self.get_activity_storage_usage_bytes(),
            self._activity_storage_limit_bytes(),
        )
        self._notify_panel_data_updated(
            activity_storage_usage_bytes=self.get_activity_storage_usage_bytes()
        )
        return {
            "activity_imported": added_activity,
            "call_history_imported": added_calls,
        }

    async def _async_load_panel_activity_history(self) -> None:
        """Load persisted local activity history once."""
        if self._activity_history_loaded:
            return
        stored_history = await self._data.async_get_stored_data_for_key(
            "panel_activity_history"
        )
        self._activity_history = [
            dict(event) for event in stored_history if isinstance(event, dict)
        ] if isinstance(stored_history, list) else []
        self._activity_history_loaded = True

    async def _async_load_panel_call_history(self) -> None:
        """Load persisted local call history once."""
        if self._call_history_loaded:
            return
        stored = await self._data.async_get_stored_data_for_key("panel_call_history")
        self._call_history = [
            dict(call) for call in stored if isinstance(call, dict)
        ] if isinstance(stored, list) else []
        self._call_history_loaded = True

    @staticmethod
    def _write_export_records(
        bundle: zipfile.ZipFile, name: str, records: list[dict[str, Any]]
    ) -> None:
        """Write matching JSON and CSV data members into an export archive."""
        bundle.writestr(f"{name}.json", json.dumps(records, ensure_ascii=False, indent=2))
        csv_file = io.StringIO(newline="")
        writer = csv.DictWriter(
            csv_file, fieldnames=sorted({key for record in records for key in record})
        )
        writer.writeheader()
        for record in records:
            writer.writerow(
                {
                    key: json.dumps(value, ensure_ascii=False)
                    if isinstance(value, (dict, list))
                    else value
                    for key, value in record.items()
                }
            )
        bundle.writestr(f"{name}.csv", csv_file.getvalue())

    @staticmethod
    def _remove_cloud_image_urls(record: dict[str, Any]) -> None:
        """Keep expiring cloud image URLs out of local export files."""
        for key in ("PicUrl", "picUrl", "smallPicUrl", "thirdCameraPicUrl", "thirdCameraSPicUrl"):
            record.pop(key, None)

    @staticmethod
    def _read_import_records(bundle: zipfile.ZipFile, name: str) -> list[dict[str, Any]]:
        """Read one optional JSON data member from an export archive."""
        try:
            payload = json.loads(bundle.read(name))
        except KeyError:
            return []
        if not isinstance(payload, list):
            raise ValueError(f"{name} is not a list")
        return [dict(record) for record in payload if isinstance(record, dict)]

    @staticmethod
    def _is_safe_export_image_name(name: Any, names: set[str]) -> bool:
        return (
            isinstance(name, str)
            and name.startswith("images/")
            and ".." not in name
            and name in names
        )

    @staticmethod
    def _merge_panel_records(
        existing: list[dict[str, Any]], imported: list[dict[str, Any]], key_name: str
    ) -> int:
        """Append imported records absent from local storage, preserving local copies."""
        known = {str(record.get(key_name, "")) for record in existing}
        added = 0
        for record in imported:
            identifier = str(record.get(key_name, ""))
            if not identifier or identifier in known:
                continue
            existing.append(record)
            known.add(identifier)
            added += 1
        return added

    @staticmethod
    def _activity_export_image_name(
        event: dict[str, Any], index: int, used_names: set[str]
    ) -> str:
        """Return a safe, unique image name in the requested door_timestamp format."""
        def clean(value: Any, fallback: str) -> str:
            # ``\w`` is Unicode-aware, so door names such as Hebrew and Arabic
            # remain readable in the ZIP instead of being replaced with "_".
            value = re.sub(r"[^\w.-]+", "_", str(value)).strip("._")
            return value or fallback

        door_name = clean(
            event.get("Location") or event.get("door_name") or event.get("deviceName"),
            "door",
        )
        timestamp = clean(event.get("CaptureTime"), f"event_{index}")
        stem = f"{door_name}_{timestamp}"
        image_name = f"{stem}.jpeg"
        suffix = 2
        while image_name in used_names:
            image_name = f"{stem}_{suffix}.jpeg"
            suffix += 1
        used_names.add(image_name)
        return image_name

    async def async_retrieve_call_history(self) -> bool:
        """Fetch and retain the latest SmartPlus call-history page for the panel."""
        host = API_DOOR_LOG_HOST.replace("subdomain.", f"{self._data.subdomain}.")
        url = f"https://{host}/{API_GET_CALL_LOG}&_t={int(time() * 1000)}"
        headers = {
            "x-cloud-version": "6.4",
            "accept": "application/json, text/plain, */*",
            "origin": f"https://{self._data.subdomain}.akuvox.com",
            "x-cloud-lang": "en",
            "user-agent": SMARTPLUS_USER_AGENT_ALT,
            "referer": f"https://{self._data.subdomain}.akuvox.com/",
            "x-auth-token": self._data.token,
        }
        response = await self._async_api_wrapper("get", url, data={}, headers=headers)
        records = response.get("list") if isinstance(response, dict) else None
        if not isinstance(records, list):
            LOGGER.debug("No SmartPlus call history returned")
            return False
        await self._async_record_call_history(records)
        return True

    async def _async_record_call_history(self, calls: list[dict[str, Any]]) -> None:
        """Restore and persist a bounded call history for the sidebar panel."""
        if not self._call_history_loaded:
            stored = await self._data.async_get_stored_data_for_key("panel_call_history")
            if isinstance(stored, list):
                self._call_history = [dict(call) for call in stored if isinstance(call, dict)][
                    :ACTIVITY_HISTORY_LIMIT
                ]
            self._call_history_loaded = True
        existing = {
            str(call.get("id", "")): index
            for index, call in enumerate(self._call_history)
        }
        changed = False
        for call in reversed(calls):
            if not isinstance(call, dict):
                continue
            call_id = str(call.get("id", ""))
            if not call_id:
                continue
            existing_index = existing.get(call_id)
            if existing_index is None:
                self._call_history.insert(0, dict(call))
                existing = {
                    str(item.get("id", "")): index
                    for index, item in enumerate(self._call_history)
                }
                changed = True
            elif self._call_history[existing_index] != call:
                self._call_history[existing_index] = dict(call)
                changed = True
        del self._call_history[ACTIVITY_HISTORY_LIMIT:]
        if changed:
            await self._data.async_set_stored_data_for_key(
                "panel_call_history", self._call_history
            )
            self._notify_panel_data_updated()

    def _notify_panel_data_updated(self, **data: Any) -> None:
        """Tell connected sidebar panels to retrieve their latest data."""
        bus = getattr(self.hass, "bus", None)
        if bus is None:
            return
        if self._entry is not None:
            data["entry_id"] = self._entry.entry_id
        bus.async_fire(PANEL_DATA_UPDATED_EVENT, data)

    def get_panel_data(self) -> dict[str, Any]:
        """Return non-secret account data for the SmartPlus sidebar panel."""
        if self._data is None:
            return {"cameras": [], "relays": [], "temporary_keys": [], "activity": [], "calls": []}
        return {
            "project_name": self._data.project_name,
            "sip_available": bool(
                self._data.sip_server
                and self._data.sip_account
                and self._data.sip_password
            ),
            "cameras": [{"name": camera.get("name", "")} for camera in self._data.camera_data],
            "relays": [
                {
                    "name": relay.get("name", ""),
                    "door_name": relay.get("door_name", ""),
                    "relay_id": relay.get("relay_id", ""),
                    "mac": relay.get("mac", ""),
                }
                for relay in self._data.door_relay_data
            ],
            "temporary_keys": [dict(key) for key in self._data.door_keys_data],
            "activity": [dict(activity) for activity in self._activity_history],
            "calls": [dict(call) for call in self._call_history],
        }

    def get_sip_accounts(self) -> dict[str, Any]:
        """Return the account's SIP credentials and device account mappings."""
        if self._data is None:
            return {"server": "", "transport": "", "main": {}, "devices": []}
        names_by_mac = {
            str(relay.get("mac", "")): str(relay.get("name", ""))
            for relay in self._data.door_relay_data
        }
        return {
            "server": self._data.sip_server,
            "transport": self._data.sip_transport,
            "main": {"account": self._data.sip_account, "password": self._data.sip_password},
            "devices": [
                {
                    "name": names_by_mac.get(mac, mac), "mac": mac,
                    "account": account, "password": self._data.sip_password,
                }
                for mac, account in sorted(self._data.sip_device_accounts.items())
            ],
        }

    async def async_export_sip_accounts_pdf(self, password: str) -> dict[str, str]:
        """Create an encrypted PDF containing sensitive SIP account details."""
        if len(password) < 8:
            raise AkuvoxApiClientError(
                "Use a PDF password containing at least 8 characters"
            )
        sip_accounts = self.get_sip_accounts()
        if not sip_accounts["main"].get("account"):
            raise AkuvoxApiClientError("No SIP account details are available yet")
        try:
            pdf_data = await self.hass.async_add_executor_job(
                self._build_sip_accounts_pdf, sip_accounts, password
            )
        except ImportError as error:
            raise AkuvoxApiClientError("The PDF export dependency is not available") from error
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        return {
            "filename": f"akuvox_sip_accounts_{timestamp}.pdf",
            "data": base64.b64encode(pdf_data).decode("ascii"),
        }

    @staticmethod
    def _build_sip_accounts_pdf(sip_accounts: dict[str, Any], password: str) -> bytes:
        """Build an encrypted, text-only SIP credentials PDF off the event loop."""
        from bidi.algorithm import get_display
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.pdfencrypt import StandardEncryption
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        from reportlab.pdfgen import canvas

        font_name = "AkuvoxUnicode"
        font_path = Path(__file__).with_name("fonts") / "DejaVuSans.ttf"
        pdfmetrics.registerFont(TTFont(font_name, str(font_path)))
        output = io.BytesIO()
        document = canvas.Canvas(
            output, pagesize=A4,
            encrypt=StandardEncryption(password, ownerPassword=password, canPrint=0,
                canModify=0, canCopy=0, canAnnotate=0, strength=128),
        )
        width, height = A4
        x, y = 48, height - 52

        def safe_text(value: Any) -> str:
            """Return Unicode text in display order for bidirectional scripts."""
            return get_display(str(value or ""))

        def line(label: str, value: Any) -> None:
            nonlocal y
            if y < 58:
                document.showPage()
                y = height - 52
            document.setFont(font_name, 10)
            document.drawString(x, y, f"{label}: {safe_text(value)}")
            y -= 16

        document.setTitle("Akuvox SmartPlus SIP Accounts")
        document.setFont(font_name, 16)
        document.drawString(x, y, "Akuvox SmartPlus SIP Accounts")
        y -= 24
        document.setFont(font_name, 9)
        document.drawString(x, y, "Confidential - do not share these credentials with anyone else.")
        y -= 24
        line("SIP server", sip_accounts["server"])
        line("Transport", sip_accounts["transport"])
        line("Main account", sip_accounts["main"].get("account"))
        line("Main password", sip_accounts["main"].get("password"))
        for index, device in enumerate(sip_accounts["devices"], start=1):
            y -= 6
            line(f"Device {index}", device.get("name"))
            line("  MAC", device.get("mac"))
            line("  SIP account", device.get("account"))
            line("  SIP password", device.get("password"))
        document.save()
        return output.getvalue()

    async def async_get_panel_activity_image(
        self, capture_time: str, *, allow_http: bool = False
    ) -> dict[str, str]:
        """Fetch one known SmartPlus event image without exposing its cloud URL."""
        event = next(
            (
                item
                for item in self._activity_history
                if str(item.get("CaptureTime", "")) == capture_time
            ),
            None,
        )
        image_url = str(event.get("PicUrl", "")) if event else ""
        local_preview = event.get("LocalPreview") if event else None
        if isinstance(local_preview, dict) and local_preview.get("data"):
            return local_preview
        parsed_url = urlsplit(image_url)
        if (
            parsed_url.scheme not in {"https", "http"}
            or not parsed_url.netloc
            or (parsed_url.scheme == "http" and not allow_http)
        ):
            raise AkuvoxApiClientError("The SmartPlus event image is unavailable")

        image_host = (parsed_url.hostname or "").lower()
        headers = {"accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"}
        if image_host == "akuvox.com" or image_host.endswith(".akuvox.com"):
            headers.update(
                {
                    "x-auth-token": self._data.token,
                    "user-agent": SMARTPLUS_USER_AGENT,
                    "referer": f"https://{self._data.subdomain}.akuvox.com/",
                }
            )
        try:
            async with async_timeout.timeout(15):
                async with self._session.get(
                    image_url, headers=headers, allow_redirects=True, max_redirects=3
                ) as response:
                    content_type = response.content_type.lower()
                    if response.status != 200:
                        LOGGER.debug(
                            "SmartPlus event image request failed with HTTP %s from %s",
                            response.status,
                            image_host,
                        )
                        raise AkuvoxApiClientError("SmartPlus did not provide an event image")
                    if response.content_length is not None and response.content_length > 5_000_000:
                        raise AkuvoxApiClientError("The SmartPlus event image is too large")
                    image = await response.read()
        except (aiohttp.ClientError, TimeoutError) as error:
            raise AkuvoxApiClientCommunicationError(
                "Unable to retrieve the SmartPlus event image"
            ) from error
        image_signatures = (b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n", b"GIF87a", b"GIF89a", b"RIFF")
        if not image or len(image) > 5_000_000 or (
            not content_type.startswith("image/") and not image.startswith(image_signatures)
        ):
            LOGGER.debug(
                "SmartPlus event image response from %s was not a supported image (%s)",
                image_host,
                content_type,
            )
            raise AkuvoxApiClientError("The SmartPlus event image is unavailable")
        if not content_type.startswith("image/"):
            content_type = "image/webp" if image.startswith(b"RIFF") else "image/jpeg"
        return {
            "content_type": content_type,
            "data": base64.b64encode(image).decode("ascii"),
        }

    async def async_get_panel_call_image(self, call_id: str) -> dict[str, str]:
        """Fetch a known call image without exposing its SmartPlus URL."""
        call = next((item for item in self._call_history if str(item.get("id", "")) == call_id), None)
        image_url = str((call or {}).get("smallPicUrl") or (call or {}).get("picUrl") or "")
        if not image_url:
            raise AkuvoxApiClientError("The SmartPlus call image is unavailable")
        # Reuse the authenticated, size-limited image retrieval path by using a
        # short-lived synthetic activity record.
        self._activity_history.append({"CaptureTime": f"call:{call_id}", "PicUrl": image_url})
        try:
            return await self.async_get_panel_activity_image(f"call:{call_id}")
        finally:
            self._activity_history = [item for item in self._activity_history if item.get("CaptureTime") != f"call:{call_id}"]

    async def async_get_panel_temp_key_qr(self, key_id: str) -> dict[str, str]:
        """Fetch a temporary key QR image without exposing its cloud URL."""
        if self._data is None:
            raise AkuvoxApiClientError("SmartPlus account data is unavailable")
        key = next(
            (
                item
                for item in self._data.door_keys_data
                if str(item.get("key_id", "")) == str(key_id)
            ),
            None,
        )
        qr_code_url = str((key or {}).get("qr_code_url", ""))
        if not qr_code_url:
            raise AkuvoxApiClientError("The temporary key QR code is unavailable")
        capture_time = f"temp-key:{key_id}"
        self._activity_history.append({"CaptureTime": capture_time, "PicUrl": qr_code_url})
        try:
            # The documented QrCodeUrl response is sometimes an HTTP URL on
            # a regional file host, unlike the HTTPS activity image URLs.
            return await self.async_get_panel_activity_image(
                capture_time, allow_http=True
            )
        finally:
            self._activity_history = [
                item for item in self._activity_history
                if item.get("CaptureTime") != capture_time
            ]

    def get_stream_url(self, camera_name: str) -> str | None:
        """Return a camera RTSP URL only after panel authorisation has succeeded."""
        if self._data is None:
            return None
        for camera in self._data.camera_data:
            if camera.get("name") == camera_name:
                return str(camera.get("video_url", "")) or None
        return None

    async def async_open_panel_relay(self, mac: str, relay_id: str) -> None:
        """Open a relay identified by an authorised sidebar-panel action."""
        if self._data is None:
            raise AkuvoxApiClientError("SmartPlus account data is unavailable")
        for relay in self._data.door_relay_data:
            if str(relay.get("mac")) == mac and str(relay.get("relay_id")) == relay_id:
                await self.async_make_opendoor_request(
                    name=str(relay.get("name", "")),
                    host=self._data.host,
                    token=self._data.token,
                    data=f"mac={mac}&relay={relay_id}",
                )
                return
        raise AkuvoxApiClientError("Requested relay was not found")

    async def async_create_panel_temp_key(
        self,
        description: str,
        begin_time: str,
        end_time: str,
        counts: int,
        dev_list: list[dict[str, str]],
        id_number: str = "",
        license_plate: str = "",
        uhf_card: str = "",
    ) -> None:
        """Create an end-user temporary key through Akuvox's documented API."""
        if self._data is None:
            raise AkuvoxApiClientError("SmartPlus account data is unavailable")
        try:
            start = datetime.strptime(begin_time, "%Y-%m-%d %H:%M:%S")
            stop = datetime.strptime(end_time, "%Y-%m-%d %H:%M:%S")
        except ValueError as error:
            raise AkuvoxApiClientError("Invalid temporary-key validity period") from error
        form_fields: list[tuple[str, str]] = [
            ("DateFlag", ""),
            ("StartDay", start.strftime("%Y-%m-%d")),
            ("StopDay", stop.strftime("%Y-%m-%d")),
            ("StartTime", start.strftime("%H:%M:%S")),
            ("StopTime", stop.strftime("%H:%M:%S")),
            ("SchedulerType", "3"),
            ("AllowedTimes", str(counts)),
            ("IDNumber", id_number or secrets.token_hex(3)),
            ("Description", description),
        ]
        relay_index = 0
        for device in dev_list:
            for relay in str(device["relay"]).split(";"):
                form_fields.extend(
                    [
                        (f"MAC[{relay_index}][MAC]", str(device["mac"])),
                        (f"MAC[{relay_index}][Relay]", relay),
                        (f"MAC[{relay_index}][SecurityRelay]", ""),
                    ]
                )
                relay_index += 1
        form_fields.extend(
            [
                ("LicensePlate", license_plate),
                ("UhfCard", uhf_card),
                ("IsFollowMyAccess", "1"),
            ]
        )
        host = API_DOOR_LOG_HOST.replace("subdomain.", f"{self._data.subdomain}.")
        response = await self._async_api_wrapper(
            method="post",
            url=f"https://{host}/{API_CREATE_TEMP_KEY}",
            data=urlencode(form_fields),
            headers={
                "content-type": "application/x-www-form-urlencoded",
                "x-auth-token": self._data.token,
                "x-cloud-version": "6.4",
                "x-cloud-lang": "en",
                "user-agent": SMARTPLUS_USER_AGENT,
                "origin": f"https://{self._data.subdomain}.akuvox.com",
                "referer": f"https://{self._data.subdomain}.akuvox.com/",
            },
        )
        if response is None:
            raise AkuvoxApiClientError("SmartPlus did not confirm temporary-key creation")
        await self.async_retrieve_temp_keys_data()

    async def async_delete_panel_temp_key(self, key_id: str) -> None:
        """Delete an end-user temporary key through Akuvox's documented API."""
        if self._data is None:
            raise AkuvoxApiClientError("SmartPlus account data is unavailable")
        host = API_DOOR_LOG_HOST.replace("subdomain.", f"{self._data.subdomain}.")
        response = await self._async_api_wrapper(
            method="post",
            url=f"https://{host}/{API_DELETE_TEMP_KEY}",
            data=urlencode({"ID": key_id}),
            headers={
                "content-type": "application/x-www-form-urlencoded",
                "x-auth-token": self._data.token,
                "x-cloud-version": "6.4",
                "x-cloud-lang": "en",
                "user-agent": SMARTPLUS_USER_AGENT,
                "origin": f"https://{self._data.subdomain}.akuvox.com",
                "referer": f"https://{self._data.subdomain}.akuvox.com/",
            },
        )
        if response is None:
            raise AkuvoxApiClientError("SmartPlus did not confirm temporary-key deletion")
        await self.async_retrieve_temp_keys_data()

    async def async_edit_panel_temp_key(
        self, key_id: str, description: str, begin_time: str, end_time: str,
        counts: int, dev_list: list[dict[str, str]], id_number: str = "",
        license_plate: str = "", uhf_card: str = "",
    ) -> None:
        """Update a temporary key through SmartPlus's documented v3 form API."""
        if self._data is None:
            raise AkuvoxApiClientError("SmartPlus account data is unavailable")
        try:
            start = datetime.strptime(begin_time, "%Y-%m-%d %H:%M:%S")
            stop = datetime.strptime(end_time, "%Y-%m-%d %H:%M:%S")
        except ValueError as error:
            raise AkuvoxApiClientError("Invalid temporary-key validity period") from error
        existing_key = next(
            (
                key
                for key in self._data.door_keys_data
                if str(key.get("key_id", "")) == str(key_id)
            ),
            None,
        )
        if existing_key is None:
            raise AkuvoxApiClientError("Temporary key was not found")
        fields = [
            ("DateFlag", str(existing_key.get("date_flag", ""))),
            ("StartDay", start.strftime("%Y-%m-%d")),
            ("StopDay", stop.strftime("%Y-%m-%d")),
            ("StartTime", start.strftime("%H:%M:%S")),
            ("StopTime", stop.strftime("%H:%M:%S")),
            ("SchedulerType", str(existing_key.get("scheduler_type", 3))),
            ("AllowedTimes", str(counts)),
            ("IDNumber", id_number),
            ("Description", description),
        ]
        existing_doors = {
            (str(door.get("mac", "")).casefold(), str(door.get("relay", ""))): door
            for door in existing_key.get("doors", [])
            if isinstance(door, dict)
        }
        index = 0
        for device in dev_list:
            for relay in str(device["relay"]).split(";"):
                existing_door = existing_doors.get(
                    (str(device["mac"]).casefold(), str(relay)), {}
                )
                try:
                    # The panel exposes the device relay ID (zero-based), while
                    # editPersonalTempKey expects SmartPlus's one-based value.
                    # This differs from addPersonalTempKey, whose captured
                    # request uses the device relay ID unchanged.
                    api_relay = str(int(relay) + 1)
                except ValueError as error:
                    raise AkuvoxApiClientError("Invalid temporary-key relay") from error
                fields.extend([
                    (f"MAC[{index}][MAC]", str(device["mac"])),
                    (f"MAC[{index}][Relay]", api_relay),
                    (
                        f"MAC[{index}][SecurityRelay]",
                        str(existing_door.get("security_relay", "0")),
                    ),
                ])
                index += 1
        fields.extend([
            ("LicensePlate", license_plate),
            ("UhfCard", uhf_card),
            ("ID", key_id),
            ("IsFollowMyAccess", str(existing_key.get("is_follow_my_access", 1))),
        ])
        host = API_DOOR_LOG_HOST.replace("subdomain.", f"{self._data.subdomain}.")
        LOGGER.info(
            "Submitting SmartPlus temporary-key update for key ID %s (%s relay entries)",
            key_id,
            index,
        )
        try:
            response = await self._async_api_wrapper(
                "post",
                f"https://{host}/{API_EDIT_TEMP_KEY}",
                urlencode(fields),
                {
                    "content-type": "application/x-www-form-urlencoded",
                    "x-auth-token": self._data.token,
                    "x-cloud-version": "6.4",
                    "x-cloud-lang": "en",
                    "user-agent": SMARTPLUS_USER_AGENT,
                    "origin": f"https://{self._data.subdomain}.akuvox.com",
                    "referer": f"https://{self._data.subdomain}.akuvox.com/",
                },
            )
        except AkuvoxApiClientError as error:
            LOGGER.warning(
                "SmartPlus temporary-key update request failed for key ID %s: %s",
                key_id,
                error,
            )
            raise
        if response is None:
            LOGGER.warning(
                "SmartPlus temporary-key update received no confirmation for key ID %s",
                key_id,
            )
            raise AkuvoxApiClientError("SmartPlus did not confirm temporary-key update")
        LOGGER.info("SmartPlus temporary-key update succeeded for key ID %s", key_id)
        await self.async_retrieve_temp_keys_data()

    async def async_get_personal_door_log(self):
        """Request the user's personal door log data from the SmartPlus v4 API."""
        host = API_DOOR_LOG_HOST.replace("subdomain.", f"{self._data.subdomain}.")
        url = f"https://{host}/{API_GET_PERSONAL_DOOR_LOG}&_t={int(time() * 1000)}"
        data = {}
        headers = {
            "x-cloud-version": "6.4",
            "accept": "application/json, text/plain, */*",
            "origin": f"https://{self._data.subdomain}.akuvox.com",
            "sec-fetch-site": "same-site",
            "accept-language": "en-AU,en;q=0.9",
            "sec-fetch-mode": "cors",
            "x-cloud-lang": "en",
            "user-agent": SMARTPLUS_USER_AGENT_ALT,
            "referer": f"https://{self._data.subdomain}.akuvox.com/",
            "x-auth-token": self._data.token,
            "sec-fetch-dest": "empty",
        }

        json_data = await self._async_api_wrapper(
            method="get", url=url, headers=headers, data=data
        )

        if isinstance(json_data, dict):
            records = json_data.get("list")
            if isinstance(records, list):
                return [self._normalise_v4_door_log(item) for item in records if isinstance(item, dict)]
        if isinstance(json_data, list):
            return json_data
        LOGGER.debug("No personal door log data returned")
        return None

    @staticmethod
    def _normalise_v4_door_log(record: dict[str, Any]) -> dict[str, Any]:
        """Adapt SmartPlus v4 camelCase door-log fields for existing consumers."""
        return {
            **record,
            "CaptureTime": record.get("captureTime", ""),
            "Location": record.get("deviceName", ""),
            "Initiator": record.get("initiator", ""),
            "CaptureType": record.get("captureType", ""),
            "PicUrl": record.get("picUrl", ""),
            "MAC": record.get("mac", ""),
            "Relay": record.get("relayName", ""),
        }

    ###################
    # Request Methods #
    ###################

    async def _async_api_wrapper(
        self,
        method: str,
        url: str,
        data,
        headers: dict | None = None,
        allow_token_refresh: bool = True,
    ):
        """Get information from the API with aiohttp (fully async)."""
        failed_token = self._data.token if self._data else ""
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
                return await self._async_api_wrapper(method, url, data, headers, allow_token_refresh)
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
        except AkuvoxApiClientAuthenticationError:
            if not allow_token_refresh or not failed_token:
                self._report_authentication_failure()
                raise
            try:
                await self.async_refresh_token(failed_token)
            except AkuvoxApiClientAuthenticationError:
                self._report_authentication_failure()
                raise
            return await self._async_api_wrapper(
                method,
                self._replace_request_token(url, failed_token),
                self._replace_request_token(data, failed_token),
                self._replace_request_token(headers, failed_token),
                allow_token_refresh=False,
            )
        except AkuvoxApiClientRateLimitError:
            raise
        except Exception as exception:  # Final fallback
            LOGGER.exception("❌ Unexpected error during SmartPlus API call")
            raise AkuvoxApiClientError(
                f"Unexpected SmartPlus API error: {type(exception).__name__}"
            ) from exception
        return None

    def _report_authentication_failure(self) -> None:
        """Start reauthentication and surface the failure to the user."""
        if self._entry is None:
            return
        async_report_authentication_failure(self.hass, self._entry)
        self._entry.async_start_reauth_if_available(self.hass)

    def _replace_request_token(self, value, previous_token: str):
        """Replace an expired token in a URL, headers, or JSON request body."""
        if self._data is None or not previous_token:
            return value
        if isinstance(value, str):
            return value.replace(previous_token, self._data.token)
        if isinstance(value, dict):
            return {
                key: self._replace_request_token(item, previous_token)
                for key, item in value.items()
            }
        return value

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
        if response.status in (401, 403):
            raise AkuvoxApiClientAuthenticationError(
                f"SmartPlus rejected the session with HTTP {response.status}"
            )
        if response.status == 429:
            raise AkuvoxApiClientRateLimitError("SmartPlus rate limited the request")
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
            if json_data and "result" in json_data and str(json_data["result"]) == "0":
                if "datas" in json_data:
                    return json_data["datas"]
                return json_data

            if isinstance(json_data, dict) and "result" in json_data:
                message = str(json_data.get("message", "No message returned"))
                LOGGER.warning("SmartPlus request was rejected: result=%s, message=%s", json_data["result"], message)
                return None

            # US API format (err_code instead of result)
            if "err_code" in json_data:
                if str(json_data["err_code"]) == "0":
                    if "datas" in json_data:
                        return json_data["datas"]
                    return json_data
                message = str(json_data.get("message", "No message returned"))
                if API_REFRESH_TOKEN in url:
                    raise AkuvoxApiClientAuthenticationError(
                        "SmartPlus rejected the session refresh "
                        f"({json_data['err_code']}): {message}"
                    )
                LOGGER.warning(
                    "SmartPlus request was rejected: err_code=%s, message=%s",
                    json_data["err_code"],
                    message,
                )
                return None

            # Temp key requests
            if "code" in json_data:
                if json_data["code"] == 0:
                    if "data" in json_data:
                        return json_data["data"]
                    return json_data

                # Request returned an error

                # Invalid identity information error
                elif json_data["code"] == 2:
                    raise AkuvoxApiClientAuthenticationError(
                        "SmartPlus returned invalid identity information"
                    )

                else:
                    LOGGER.error("❌ SmartPlus API returned error code %s", json_data["code"])

                return None

            LOGGER.warning("🤨 Unexpected SmartPlus API response schema")
        else:
            if API_CREATE_TEMP_KEY in url or API_DELETE_TEMP_KEY in url:
                LOGGER.warning(
                    "SmartPlus temporary-key request returned HTTP %s", response.status
                )
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

    def get_credentials(self) -> dict[str, str]:
        """Return the current credentials for private persistence only."""
        if self._data is None:
            return {}
        return {"auth_token": self._data.auth_token, "token": self._data.token}

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
        if key == "door_log_poll_interval":
            self._data.door_log_poll_interval = int(value)
            self._door_log_backoff = self._data.door_log_poll_interval
        if key == "door_log_max_backoff":
            self._data.door_log_max_backoff = max(
                self._data.door_log_poll_interval, int(value)
            )
