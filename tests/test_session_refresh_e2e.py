"""End-to-end session-renewal tests for the SmartPlus API client.

These tests exercise the request wrapper, refresh endpoint, config-entry
persistence, and retry behaviour together. Network responses are simulated so
the tests never require a real SmartPlus account or expose credentials.
"""
from __future__ import annotations

import unittest
from unittest.mock import ANY, AsyncMock, patch

from custom_components.akuvox.api import (
    AkuvoxApiClient,
    AkuvoxApiClientAuthenticationError,
)
from custom_components.akuvox.const import SMARTPLUS_REFRESH_USER_AGENT


class _Response:
    """Minimal aiohttp response context manager for the API client."""

    def __init__(self, status: int, payload: dict) -> None:
        self.status = status
        self._payload = payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> bool:
        return False

    async def json(self) -> dict:
        return self._payload

    async def text(self) -> str:
        return ""


class _Session:
    """Records requests and returns a predefined response sequence."""

    def __init__(self, responses: list[_Response]) -> None:
        self.requests: list[dict] = []
        self._responses = responses

    def request(self, method, url, headers=None, data=None):
        self.requests.append(
            {"method": method, "url": url, "headers": headers, "data": data}
        )
        return self._responses.pop(0)


class _ConfigEntries:
    """Captures config-entry writes without Home Assistant storage."""

    def async_update_entry(self, entry, **kwargs) -> None:
        entry.data = kwargs["data"]
        entry.options = kwargs["options"]


class _Hass:
    """Provides the Home Assistant APIs used by the client under test."""

    def __init__(self) -> None:
        self.config_entries = _ConfigEntries()

    def add_job(self, *_args) -> None:
        return None


class _Entry:
    """Minimal config entry containing private SmartPlus credentials."""

    def __init__(self) -> None:
        self.entry_id = "entry-id"
        self.data = {
            "token": "expired-token",
            "auth_token": "refresh-credential",
            "subdomain": "ecloud",
        }
        self.options = {}
        self.reauth_started = False

    def async_start_reauth_if_available(self, _hass) -> None:
        self.reauth_started = True


def _success(payload: dict) -> _Response:
    """Build the common SmartPlus success response envelope."""
    return _Response(200, {"err_code": "0", "datas": payload})


class TestSmartPlusSessionRefreshE2E(unittest.IsolatedAsyncioTestCase):
    """Verify the SmartPlus session lifecycle through the public client path."""

    def _client(self, responses: list[_Response]) -> AkuvoxApiClient:
        self.entry = _Entry()
        self.session = _Session(responses)
        return AkuvoxApiClient(self.session, _Hass(), self.entry)

    def test_new_session_without_refresh_history_is_not_refreshed_immediately(self) -> None:
        """A newly authenticated email session waits for its first interval."""
        client = self._client([])

        self.assertFalse(client._is_token_refresh_due())

    @patch("custom_components.akuvox.api.async_store_credentials", new_callable=AsyncMock)
    async def test_expired_request_refreshed_and_retried(self, store_credentials) -> None:
        """A rejected authenticated request renewed and retried once."""
        client = self._client(
            [
                _Response(403, {}),
                _success({"token": "replacement-token"}),
                _success({"devices": []}),
            ]
        )

        result = await client._async_api_wrapper(
            "get",
            "https://api.example/userconf?token=expired-token",
            None,
            {"x-auth-token": "expired-token"},
        )

        self.assertEqual(result, {"devices": []})
        self.assertNotIn("token", self.entry.data)
        self.assertIn("token_refreshed_at", self.entry.data)
        store_credentials.assert_awaited_once_with(
            ANY, "entry-id", "refresh-credential", "replacement-token"
        )
        self.assertEqual(self.session.requests[1]["method"], "post")
        self.assertEqual(
            self.session.requests[1]["headers"]["user-agent"],
            SMARTPLUS_REFRESH_USER_AGENT,
        )
        self.assertEqual(
            self.session.requests[2]["headers"]["x-auth-token"], "replacement-token"
        )
        self.assertTrue(
            self.session.requests[2]["url"].endswith("token=replacement-token")
        )

    async def test_rejected_refresh_did_not_retry_indefinitely(self) -> None:
        """An invalid refresh credential raised an auth error without a loop."""
        client = self._client([_Response(401, {}), _Response(401, {})])

        with (
            patch("custom_components.akuvox.api.async_report_authentication_failure"),
            self.assertRaises(AkuvoxApiClientAuthenticationError),
        ):
            await client._async_api_wrapper(
                "get",
                "https://api.example/userconf?token=expired-token",
                None,
                {"x-auth-token": "expired-token"},
            )

        self.assertEqual(len(self.session.requests), 2)

    async def test_json_credential_rejection_started_reauthentication(self) -> None:
        """SmartPlus may revoke a token in a successful HTTP response."""
        client = self._client(
            [
                _Response(200, {"result": 2, "message": "username or passwd error"}),
                _Response(200, {"result": 2, "message": "username or passwd error"}),
            ]
        )

        with (
            patch("custom_components.akuvox.api.async_report_authentication_failure"),
            self.assertRaises(AkuvoxApiClientAuthenticationError),
        ):
            await client._async_api_wrapper(
                "get",
                "https://api.example/userconf?token=expired-token",
                None,
                {"x-auth-token": "expired-token"},
            )

        self.assertTrue(self.entry.reauth_started)
        self.assertEqual(len(self.session.requests), 2)

    async def test_rejected_server_list_started_reauthentication(self) -> None:
        """A failed authenticated server-list response is not a normal update failure."""
        client = self._client(
            [
                _Response(200, {"result": 2, "message": "session invalid"}),
                _Response(200, {"err_code": 2, "message": "session invalid"}),
            ]
        )

        with (
            patch("custom_components.akuvox.api.async_report_authentication_failure"),
            self.assertRaises(AkuvoxApiClientAuthenticationError),
        ):
            await client._async_api_wrapper(
                "post",
                "https://gate.ecloud.akuvox.com:8600/servers_list",
                {},
                {"x-auth-token": "expired-token"},
            )

        self.assertTrue(self.entry.reauth_started)
        self.assertEqual(len(self.session.requests), 2)

    async def test_token_error_from_server_list_started_reauthentication(self) -> None:
        """The legacy server-list API can use ``err_code`` for a revoked token."""
        client = self._client(
            [
                _Response(
                    200,
                    {"err_code": "1000100001", "message": "Token error."},
                ),
                _Response(
                    200,
                    {"err_code": "1000100001", "message": "Token error."},
                ),
            ]
        )

        with (
            patch("custom_components.akuvox.api.async_report_authentication_failure"),
            self.assertRaises(AkuvoxApiClientAuthenticationError),
        ):
            await client._async_api_wrapper(
                "post",
                "https://gate.ecloud.akuvox.com:8600/servers_list",
                {},
                {"x-auth-token": "expired-token"},
            )

        self.assertTrue(self.entry.reauth_started)
        self.assertEqual(len(self.session.requests), 2)

    async def test_refresh_error_code_reported_an_authentication_failure(self) -> None:
        """The refresh endpoint's JSON error did not look like a malformed response."""
        client = self._client(
            [_Response(200, {"err_code": "1000100003", "message": "refreshToken error."})]
        )

        with (
            patch("custom_components.akuvox.api.async_report_authentication_failure"),
            self.assertRaisesRegex(
                AkuvoxApiClientAuthenticationError,
                r"1000100003.*refreshToken error",
            ),
        ):
            await client.async_refresh_token("expired-token")

    @patch("custom_components.akuvox.api.async_store_credentials", new_callable=AsyncMock)
    async def test_scheduled_refresh_persisted_a_new_token(self, store_credentials) -> None:
        """A proactive refresh renewed the session before an API rejection."""
        client = self._client([_success({"token": "scheduled-token"})])

        await client._async_proactive_token_refresh(None)

        self.assertNotIn("token", self.entry.data)
        self.assertIn("token_refreshed_at", self.entry.data)
        store_credentials.assert_awaited_once()
        self.assertEqual(len(self.session.requests), 1)

    async def test_failed_proactive_refresh_kept_the_current_session_active(self) -> None:
        """A rejected renewal alone does not force a usable session to reauthenticate."""
        client = self._client([_Response(401, {})])

        with patch("custom_components.akuvox.api.async_report_authentication_failure") as report_failure:
            await client._async_proactive_token_refresh(None)

        report_failure.assert_not_called()
        self.assertFalse(self.entry.reauth_started)
        self.assertEqual(len(self.session.requests), 1)
