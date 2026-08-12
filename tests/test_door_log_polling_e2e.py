"""End-to-end activity polling rate-limit behaviour tests."""
from __future__ import annotations

import unittest

from custom_components.akuvox.api import AkuvoxApiClient, AkuvoxApiClientRateLimitError
from custom_components.akuvox.const import DOOR_LOG_MAX_BACKOFF, DOOR_LOG_POLL_INTERVAL

from test_session_refresh_e2e import _Entry, _Hass, _Response, _Session


class TestDoorLogPollingE2E(unittest.IsolatedAsyncioTestCase):
    """Verify SmartPlus activity polling respected service limits."""

    def _client(self) -> AkuvoxApiClient:
        entry = _Entry()
        entry.data["host"] = "api.example"
        return AkuvoxApiClient(_Session([]), _Hass(), entry)

    def test_failures_increased_backoff_to_a_safe_cap(self) -> None:
        """Repeated failures backed off exponentially instead of polling every 2 seconds."""
        client = self._client()

        self.assertEqual(client._increase_door_log_backoff(), DOOR_LOG_POLL_INTERVAL * 2)
        self.assertEqual(client._increase_door_log_backoff(), DOOR_LOG_POLL_INTERVAL * 4)
        for _ in range(10):
            client._increase_door_log_backoff()
        self.assertEqual(client._door_log_backoff, DOOR_LOG_MAX_BACKOFF)

    def test_saved_options_overrode_polling_defaults(self) -> None:
        """Configured polling settings were restored with the config entry."""
        entry = _Entry()
        entry.options = {
            "door_log_poll_interval": 120,
            "door_log_max_backoff": 600,
        }
        client = AkuvoxApiClient(_Session([]), _Hass(), entry)

        self.assertEqual(client._data.door_log_poll_interval, 120)
        self.assertEqual(client._data.door_log_max_backoff, 600)
        self.assertEqual(client._increase_door_log_backoff(), 240)

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
