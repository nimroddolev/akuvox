"""End-to-end activity polling rate-limit behaviour tests."""
from __future__ import annotations

import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from custom_components.akuvox.api import AkuvoxApiClient, AkuvoxApiClientRateLimitError
from custom_components.akuvox.const import DOOR_LOG_FALLBACK_POLL_INTERVAL

from test_session_refresh_e2e import _Entry, _Hass, _Response, _Session


class TestDoorLogPollingE2E(unittest.IsolatedAsyncioTestCase):
    """Verify SmartPlus activity polling respected service limits."""

    def _client(self) -> AkuvoxApiClient:
        entry = _Entry()
        entry.data["host"] = "api.example"
        return AkuvoxApiClient(_Session([]), _Hass(), entry)

    def test_rate_limit_headers_set_the_fastest_safe_poll_interval(self) -> None:
        """Polls are spread across all requests still allowed in the window."""
        client = self._client()

        client._update_door_log_poll_interval(
            {"x-ratelimit-limit": "50", "x-ratelimit-remaining": "4", "x-ratelimit-reset": "10"}
        )

        self.assertEqual(client._door_log_poll_interval, 3)

    def test_missing_rate_limit_headers_use_the_conservative_fallback(self) -> None:
        """The poller remains safe if SmartPlus does not send rate-limit data."""
        entry = _Entry()
        client = AkuvoxApiClient(_Session([]), _Hass(), entry)

        client._update_door_log_poll_interval({})

        self.assertEqual(client._door_log_poll_interval, DOOR_LOG_FALLBACK_POLL_INTERVAL)

    def test_exhausted_rate_limit_waits_until_after_reset(self) -> None:
        """An exhausted quota never retries on the exact reset boundary."""
        client = self._client()

        client._update_door_log_poll_interval(
            {"x-ratelimit-limit": "50", "x-ratelimit-remaining": "0", "x-ratelimit-reset": "10"}
        )

        self.assertEqual(client._door_log_poll_interval, 11)

    async def test_door_log_response_headers_update_the_next_poll(self) -> None:
        """Only getDoorLog responses supply the poller's dynamic schedule."""
        client = self._client()
        response = _Response(200, {"list": []})
        response.headers = {
            "x-ratelimit-limit": "50",
            "x-ratelimit-remaining": "4",
            "x-ratelimit-reset": "10",
        }

        await client._async_process_async_response(
            response,
            "https://ecloud.akuvox.com/web-server/v4/smartplus/community/log/master/"
            "getDoorLog?row=20&page=1&_t=1",
        )

        self.assertEqual(client._door_log_poll_interval, 3)

    async def test_poller_uses_new_rate_limit_interval_without_an_extra_wait(self) -> None:
        """A fresh getDoorLog limit applies before the current cycle sleeps."""
        client = self._client()
        client._polling_task_stop_event = asyncio.Event()
        observed_timeouts: list[int] = []

        async def retrieve_door_log() -> bool:
            client._update_door_log_poll_interval(
                {
                    "x-ratelimit-limit": "50",
                    "x-ratelimit-remaining": "4",
                    "x-ratelimit-reset": "10",
                }
            )
            return True

        async def stop_after_wait(awaitable, timeout: int) -> None:
            observed_timeouts.append(timeout)
            awaitable.close()
            client._polling_task_stop_event.set()

        client.async_retrieve_personal_door_log = AsyncMock(side_effect=retrieve_door_log)
        with patch("custom_components.akuvox.api.asyncio.wait_for", stop_after_wait):
            await client._poll_personal_door_log()

        self.assertEqual(observed_timeouts, [3])

    def test_zero_second_reset_retries_after_one_second(self) -> None:
        """A rate window closing now must not be treated as malformed headers."""
        client = self._client()

        client._update_door_log_poll_interval(
            {"x-ratelimit-limit": "50", "x-ratelimit-remaining": "0", "x-ratelimit-reset": "0"}
        )

        self.assertEqual(client._door_log_poll_interval, 1)

    async def test_rate_limited_poller_honours_the_reported_reset_time(self) -> None:
        """A 429 waits for the server's reset window instead of the fallback."""
        client = self._client()
        client._polling_task_stop_event = asyncio.Event()
        observed_timeouts: list[int] = []

        async def retrieve_door_log() -> bool:
            client._update_door_log_poll_interval(
                {
                    "x-ratelimit-limit": "50",
                    "x-ratelimit-remaining": "0",
                    "x-ratelimit-reset": "10",
                }
            )
            raise AkuvoxApiClientRateLimitError("SmartPlus rate limited the request")

        async def stop_after_wait(awaitable, timeout: int) -> None:
            observed_timeouts.append(timeout)
            awaitable.close()
            client._polling_task_stop_event.set()

        client.async_retrieve_personal_door_log = AsyncMock(side_effect=retrieve_door_log)
        with patch("custom_components.akuvox.api.asyncio.wait_for", stop_after_wait):
            await client._poll_personal_door_log()

        self.assertEqual(observed_timeouts, [11])

    def test_saved_activity_endpoint_was_restored(self) -> None:
        """A previously proven single endpoint was used after Home Assistant restarted."""
        entry = _Entry()
        entry.data["activity_endpoint_type"] = "single"
        client = AkuvoxApiClient(_Session([]), _Hass(), entry)

        self.assertEqual(client.get_activities_host(), "subdomain.akuvox.com/web-server/v3/app/single")

    async def test_rate_limit_response_was_reported_as_a_retryable_failure(self) -> None:
        """HTTP 429 became a client error so the poller applied backoff."""
        client = self._client()

        with self.assertRaisesRegex(AkuvoxApiClientRateLimitError, "rate limited"):
            await client._async_process_async_response(_Response(429, {}), "https://api.example/log")

    async def test_activity_poller_waited_for_home_assistant_startup(self) -> None:
        """The long-lived poller did not run while Home Assistant booted."""
        client = self._client()
        client.async_start_polling = AsyncMock()

        with patch("custom_components.akuvox.api.async_at_started") as at_started:
            cancel = lambda: None
            at_started.return_value = cancel
            await client.async_start_polling_personal_door_log()

            at_started.assert_called_once_with(
                client.hass, client._async_start_polling_after_hass_started
            )
            client.async_start_polling.assert_not_awaited()

            await at_started.call_args.args[1](client.hass)

        client.async_start_polling.assert_awaited_once()
