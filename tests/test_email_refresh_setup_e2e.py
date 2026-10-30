"""Email renewal before entry creation, including the reauthentication client."""
import json
import unittest
from unittest.mock import AsyncMock
from urllib.parse import urlsplit

from custom_components.akuvox.api import AkuvoxApiClient
from test_session_refresh_e2e import _Hass, _Response, _Session

GATEWAYS = ("ecloud", "ucloud", "aucloud", "scloud", "ccloud", "jcloud", "rucloud")


class TestEmailSetupRefresh(unittest.IsolatedAsyncioTestCase):
    """Use real login and request recovery without a saved config entry."""

    async def test_direct_and_otp_login_recover_and_rotate_before_entry_creation(self):
        """Setup and reauthentication preserve email renewal on every gateway."""
        for gateway in GATEWAYS:
            for otp in (False, True):
                for envelope in ("result", "err_code"):
                    with self.subTest(gateway=gateway, otp=otp, envelope=envelope):
                        def success(data):
                            return _Response(200, {envelope: 0, "datas": data})

                        credentials = {"token": "session", "refresh_token": "original-refresh",
                                       "rest_server_https": "api.example", "rtsp_server": "rtsp.example"}
                        responses = [success({"two_factor_auth_temp_token": "challenge"} if otp else credentials)]
                        if otp:
                            responses.append(success(credentials))
                        responses.extend([
                            _Response(401, {}),
                            success({"token": "renewed", "refresh_token": "rotated"}),
                            success({}),
                            success({"token": "renewed-again", "refresh_token": "rotated-again"}),
                        ])
                        session = _Session(responses)
                        client = AkuvoxApiClient(session, _Hass(), None)

                        async def load_devices():
                            response = await client._async_api_wrapper(
                                "get", "https://api.example/userconf?token=session", None,
                                {"x-auth-token": "session"})
                            return response is not None

                        client.async_retrieve_device_data = AsyncMock(side_effect=load_devices)
                        client.async_retrieve_temp_keys_data = AsyncMock(return_value=True)
                        client.async_retrieve_family_members = AsyncMock(return_value=True)
                        client.async_start_polling_personal_door_log = AsyncMock()
                        await client.async_begin_email_sign_in("name@example.com", "password", gateway)
                        if otp:
                            self.assertTrue(await client.async_email_otp_sign_in(
                                "name@example.com", "123456", start_polling=False))
                        else:
                            self.assertTrue(await client.async_finish_password_sign_in(start_polling=False))

                        await client.async_refresh_token("renewed")
                        renewals = [r for r in session.requests if urlsplit(r["url"]).path.endswith("/refresh_token")]
                        self.assertEqual([json.loads(r["data"]) for r in renewals],
                                         [{"refresh_token": "original-refresh"}, {"refresh_token": "rotated"}])
                        self.assertTrue(all(urlsplit(r["url"]).hostname == f"gate.{gateway}.akuvox.com"
                                            for r in renewals))
                        self.assertEqual(renewals[0]["headers"]["x-auth-token"], "session")
                        self.assertEqual(renewals[1]["headers"]["x-auth-token"], "renewed")
                        retry = [r for r in session.requests if "userconf" in r["url"]][-1]
                        self.assertEqual(retry["headers"]["x-auth-token"], "renewed")
                        self.assertTrue(retry["url"].endswith("token=renewed"))
                        self.assertEqual(client.get_credentials(),
                                         {"auth_token": "rotated-again", "token": "renewed-again"})
                        client.async_start_polling_personal_door_log.assert_not_awaited()

    async def test_switching_to_sms_replaces_email_login_context(self):
        """A reused client cannot send an SMS credential as a refresh token."""
        session = _Session([_Response(200, {"result": 0, "datas": {
            "token": "sms-renewed", "auth_token": "sms-rotated"}})])
        client = AkuvoxApiClient(session, _Hass(), None)
        client.init_api_with_data(hass=client.hass, subdomain="ecloud")
        client._login_method = "email_password"
        client.async_validate_sms_code = AsyncMock(return_value={
            "token": "sms-session", "auth_token": "sms-auth", "rtsp_server": "rtsp.example"})
        client.async_retrieve_device_data = AsyncMock(return_value=True)
        client.async_retrieve_temp_keys_data = AsyncMock(return_value=True)
        client.async_retrieve_family_members = AsyncMock(return_value=True)
        self.assertTrue(await client.async_sms_sign_in("500000000", "972", "123456", start_polling=False))
        await client.async_refresh_token("sms-session")
        self.assertEqual(json.loads(session.requests[0]["data"]), {"auth_token": "sms-auth"})
        self.assertEqual(client.get_credentials()["auth_token"], "sms-rotated")
