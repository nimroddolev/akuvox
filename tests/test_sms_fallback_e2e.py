"""Exercise SMS fallback through the real request and response handling."""
import unittest
from unittest.mock import AsyncMock, MagicMock

from custom_components.akuvox.api import (
    AkuvoxApiClient, AkuvoxApiClientAuthenticationError, AkuvoxApiClientRateLimitError,
    AkuvoxApiClientCommunicationError,
)
from test_session_refresh_e2e import _Hass, _Response, _Session


class TestSMSFallback(unittest.IsolatedAsyncioTestCase):
    """Keep retries limited to an explicit unregistered-number response."""

    def client(self, responses):
        """Build a client with deterministic responses and no network access."""
        hass = _Hass()
        session = _Session(responses)
        client = AkuvoxApiClient(session=session, hass=hass, entry=None)
        client.init_api_with_data(hass=hass, host="api.example", subdomain="ecloud",
                                  country_code="972", phone_number="0500000000")
        client._async_ensure_rest_server = AsyncMock(return_value=True)
        return client, session, hass

    async def test_only_explicit_number_rejection_retries_once(self):
        """Verify only explicit number rejection retries once."""
        for envelope in ("result", "err_code"):
            for number, expected in (("0500000000", "500000000"), ("00123", "0123")):
                with self.subTest(envelope=envelope, number=number):
                    client, session, hass = self.client([
                        _Response(200, {envelope: 1, "message": "Mobile Number doesn’t exist."}),
                        _Response(200, {envelope: 0, "datas": {}}),
                    ])
                    self.assertTrue(await client.async_send_sms(hass, "972", number, "ecloud"))
                    self.assertEqual([r["data"]["MobileNumber"] for r in session.requests], [number, expected])
                    self.assertEqual(client.get_phone_number(), expected)
                    self.assertEqual(session.requests[0]["url"], session.requests[1]["url"])

    async def test_success_preserves_original_number(self):
        """Verify success preserves original number."""
        client, session, hass = self.client([_Response(200, {"result": 0, "datas": {}})])
        self.assertTrue(await client.async_send_sms(hass, "972", "0500000000", "ecloud"))
        self.assertEqual(len(session.requests), 1)
        self.assertEqual(client.get_phone_number(), "0500000000")

    async def test_other_failures_never_send_another_sms(self):
        """Verify other failures never send another sms."""
        for status, payload in [
            (200, {"result": 1, "message": "Too many requests"}),
            (200, {"err_code": 1, "message": "Invalid request"}),
            (200, {"message": "Mobile Number doesn't exist"}),
            (500, {"result": 1, "message": "Mobile Number doesn't exist"}),
            (200, []),
        ]:
            with self.subTest(status=status, payload=payload):
                client, session, hass = self.client([_Response(status, payload)])
                self.assertFalse(await client.async_send_sms(hass, "972", "0500000000", "ecloud"))
                self.assertEqual(len(session.requests), 1)

    async def test_http_errors_propagate_without_retry(self):
        """Verify http errors propagate without retry."""
        for status, error in [(429, AkuvoxApiClientRateLimitError), (401, AkuvoxApiClientAuthenticationError)]:
            client, session, hass = self.client([_Response(status, {})])
            with self.assertRaises(error):
                await client.async_send_sms(hass, "972", "0500000000", "ecloud")
            self.assertEqual(len(session.requests), 1)

    async def test_no_empty_candidate_or_repeated_stripping(self):
        """Verify no empty candidate or repeated stripping."""
        rejection = {"result": 1, "message": "Mobile Number doesn't exist"}
        for number, count in [("0", 1), ("500000000", 1), ("00123", 2)]:
            client, session, hass = self.client([_Response(200, rejection) for _ in range(count)])
            self.assertFalse(await client.async_send_sms(hass, "972", number, "ecloud"))
            self.assertEqual(len(session.requests), count)
            self.assertEqual(client.get_phone_number(), "0500000000")


    async def test_timeout_never_retries_sms(self):
        """An uncertain delivery must never trigger another SMS request."""
        client, session, hass = self.client([])
        session.request = MagicMock(side_effect=TimeoutError())
        with self.assertRaises(AkuvoxApiClientCommunicationError):
            await client.async_send_sms(hass, "972", "0500000000", "ecloud")
        session.request.assert_called_once()
