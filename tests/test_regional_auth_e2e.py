"""Cross-region setup, OTP, renewal, and reauthentication regressions."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from urllib.parse import urlsplit

from custom_components.akuvox.api import AkuvoxApiClient, AkuvoxApiClientRateLimitError
from custom_components.akuvox.config_flow import AkuvoxFlowHandler, _email_login_schema
from custom_components.akuvox.const import LOCATIONS_DICT
from custom_components.akuvox.data import AkuvoxData
from custom_components.akuvox.helpers import AkuvoxHelpers
from test_config_flow_e2e import _EmailClient, _ReauthEntry
from test_session_refresh_e2e import _Hass as _ApiHass, _Response, _Session, _success

GATEWAYS = ("ecloud", "ucloud", "aucloud", "scloud", "ccloud", "jcloud", "rucloud")


class TestRegionalAuthentication(unittest.IsolatedAsyncioTestCase):
    """Exercise real request routing without contacting live SmartPlus accounts."""

    def _client(self, responses):
        self.session = _Session(responses)
        return AkuvoxApiClient(self.session, _ApiHass(), None)

    def test_country_mapping_does_not_round_trip_shared_phone_codes(self):
        """Russia, Kazakhstan, Chile and AU/NZ retain their own regional servers."""
        helper = AkuvoxHelpers()
        expected = {"RU": "rucloud", "KZ": "scloud", "CL": "ucloud", "CH": "ecloud",
                    "AU": "aucloud", "NZ": "aucloud", "US": "ucloud", "CA": "ucloud",
                    "IL": "ecloud", "CN": "ccloud", "JP": "jcloud", None: "ecloud"}
        for country, gateway in expected.items():
            with self.subTest(country=country):
                self.assertEqual(helper.get_subdomain_from_country(country), gateway)
        for country, location in LOCATIONS_DICT.items():
            self.assertEqual(helper.get_subdomain_from_country(country), location["subdomain"])

    async def test_all_gateways_accept_both_response_envelopes(self):
        """Accepted regional credentials do not leak into an unrelated fallback request."""
        for gateway in GATEWAYS:
            for envelope in ("err_code", "result"):
                with self.subTest(gateway=gateway, envelope=envelope):
                    client = self._client([_Response(200, {envelope: "0", "datas": {
                        "token": "session", "refresh_token": "refresh"}})])
                    self.assertIsNotNone(await client.async_begin_email_sign_in("name@example.com", "pw", gateway))
                    self.assertEqual(client.get_subdomain(), gateway)
                    self.assertEqual(len(self.session.requests), 1)

    async def test_existing_ecloud_accounts_survive_other_country_defaults(self):
        """A regional rejection falls back to ecloud exactly once."""
        for gateway in GATEWAYS[1:]:
            with self.subTest(gateway=gateway):
                client = self._client([_Response(200, {"err_code": "1"}), _success({"token": "session"})])
                self.assertIsNotNone(await client.async_begin_email_sign_in("name@example.com", "pw", gateway))
                self.assertEqual([urlsplit(r["url"]).hostname for r in self.session.requests],
                                 [f"gate.{gateway}.akuvox.com", "gate.ecloud.akuvox.com"])

    async def test_rate_limit_does_not_retry_another_login_or_gateway(self):
        """A rate limit must stop even for accounts whose login contains digits."""
        client = self._client([_Response(429, {})])
        with self.assertRaises(AkuvoxApiClientRateLimitError):
            await client.async_begin_email_sign_in("name7@example.com", "pw", "ucloud")
        self.assertEqual(len(self.session.requests), 1)

    async def test_unknown_api_gateway_is_not_used_as_a_hostname(self):
        """Only known regional gateways receive authentication requests."""
        client = self._client([_success({"token": "session"})])
        await client.async_begin_email_sign_in("name@example.com", "pw", "example.com/path")
        self.assertEqual(urlsplit(self.session.requests[0]["url"]).hostname, "gate.ecloud.akuvox.com")

    async def test_retry_for_a_different_account_discards_previous_credentials(self):
        """A token-only response cannot reuse another account's refresh credential."""
        client = self._client([_success({"token": "old", "refresh_token": "old-refresh"}),
                               _success({"token": "new"})])
        await client.async_begin_email_sign_in("first@example.com", "pw", "ecloud")
        await client.async_begin_email_sign_in("second@example.com", "pw", "ecloud")
        self.assertEqual(client.get_credentials(), {"token": "new", "auth_token": ""})
        self.assertFalse(await client.async_finish_password_sign_in(start_polling=False))

    async def test_otp_renewal_and_reload_stay_on_each_accepted_gateway(self):
        """The region remains correct across challenge, REST host, renewal and reload."""
        for gateway in GATEWAYS:
            with self.subTest(gateway=gateway):
                client = self._client([
                    _success({"two_factor_auth_temp_token": "temporary", "rest_server_https": f"{gateway}.akuvox.com:8443",
                              "rtsp_server": f"rtsp.{gateway}.akuvox.com:554"}),
                    _success({}), _success({"token": "session", "refresh_token": "refresh"}),
                    _success({"token": "renewed"}),
                ])
                client.async_retrieve_device_data = AsyncMock(return_value=True)
                client.async_retrieve_temp_keys_data = AsyncMock(return_value=True)
                client.async_retrieve_family_members = AsyncMock(return_value=True)
                client.async_start_polling_personal_door_log = AsyncMock()
                await client.async_begin_email_sign_in("name@example.com", "pw", gateway)
                self.assertTrue(await client.async_send_email_otp("name@example.com", "temporary"))
                self.assertTrue(await client.async_email_otp_sign_in("name@example.com", "123456", start_polling=False))
                self.assertTrue(await client.async_refresh_token("session"))
                hosts = [urlsplit(request["url"]).hostname for request in self.session.requests]
                self.assertEqual(hosts, [f"gate.{gateway}.akuvox.com", f"{gateway}.akuvox.com",
                                         f"gate.{gateway}.akuvox.com", f"gate.{gateway}.akuvox.com"])
                client.async_start_polling_personal_door_log.assert_not_awaited()
                entry = SimpleNamespace(entry_id="account", data={"subdomain": gateway, **client.get_devices_json()}, options={})
                self.assertEqual(AkuvoxData(entry, _ApiHass()).subdomain, gateway)


class TestRegionalAuthenticationFlow(unittest.IsolatedAsyncioTestCase):
    """Keep country defaults separate from saved account regions and overrides."""

    def _flow(self, country="IL"):
        flow = AkuvoxFlowHandler()
        flow.hass = SimpleNamespace(config=SimpleNamespace(country=country))
        flow.akuvox_api_client = _EmailClient()
        flow.async_show_form = MagicMock(return_value={"type": "form"})
        return flow

    async def test_saved_region_is_retained_at_reauth_start(self):
        """Reauth uses the account region even when HA is in a different country."""
        for override in (False, True):
            flow = self._flow()
            entry = _ReauthEntry()
            entry.data.update(login_method="email_password", login_account="name@example.com", subdomain="jcloud")
            entry.options = {"override": override, "subdomain": "ucloud"}
            flow._get_reauth_entry = MagicMock(return_value=entry)
            flow.async_step_reauth_email_password = AsyncMock()
            with patch("custom_components.akuvox.config_flow.async_get_clientsession", return_value=object()), \
                    patch("custom_components.akuvox.config_flow.AkuvoxApiClient", return_value=flow.akuvox_api_client):
                await flow.async_step_reauth({})
            await flow._async_begin_email_password_sign_in(
                {"login_account": "name@example.com", "password": "pw"},
                step_id="reauth_email_password", schema=None, reauth=True)
            expected = "ucloud" if override else "jcloud"
            self.assertEqual(flow.akuvox_api_client.async_begin_email_sign_in.call_args.args[2], expected)

    async def test_explicit_region_and_automatic_country_selection(self):
        """The same form supports explicit overrides and unambiguous ISO defaults."""
        for country, selection, expected in [("RU", "Default", "rucloud"), ("AU", "Default", "aucloud"),
                                               ("IL", "ucloud", "ucloud"), (None, "Default", "ecloud")]:
            flow = self._flow(country)
            await flow.async_step_email_password_sign_in(
                {"login_account": "name@example.com", "password": "pw", "subdomain": selection})
            self.assertEqual(flow.akuvox_api_client.async_begin_email_sign_in.call_args.args[2], expected)
        fields = {str(field.schema) for field in _email_login_schema({}).schema}
        self.assertIn("subdomain", fields)

    async def test_changed_gateway_updates_active_override_after_reauth(self):
        """Old override values cannot mask the validated new gateway on reload."""
        flow = self._flow()
        flow._reauth_entry = _ReauthEntry()
        flow._reauth_entry.options = {"override": True, "subdomain": "ecloud", "host": "old.example"}
        flow.data = {"login_method": "email_password", "subdomain": "ucloud"}
        flow.async_update_reload_and_abort = MagicMock(return_value={"type": "abort"})
        with patch("custom_components.akuvox.config_flow.async_store_credentials", new_callable=AsyncMock), \
                patch("custom_components.akuvox.config_flow.async_clear_authentication_failure"):
            await flow._async_finish_reauthentication()
        saved = flow.async_update_reload_and_abort.call_args.kwargs
        self.assertEqual(saved["options"]["subdomain"], "ucloud")
        self.assertEqual(saved["options"]["host"], "api.example")
        self.assertNotIn("token", saved["data"])

    async def test_direct_password_reauth_does_not_create_an_entry(self):
        """Direct-token reauth updates the existing entry without saving the password."""
        flow = self._flow("US")
        flow.akuvox_api_client.async_begin_email_sign_in.return_value = {"token": "new"}
        flow.akuvox_api_client.async_finish_password_sign_in = AsyncMock(return_value=True)
        flow._async_finish_reauthentication = AsyncMock(return_value={"type": "abort"})
        result = await flow._async_begin_email_password_sign_in(
            {"login_account": "name@example.com", "password": "not-saved"},
            step_id="reauth_email_password", schema=None, reauth=True)
        self.assertEqual(result, {"type": "abort"})
        self.assertNotIn("password", flow.data)
        flow._async_finish_reauthentication.assert_awaited_once()
