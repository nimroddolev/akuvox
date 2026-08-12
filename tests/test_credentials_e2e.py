"""Credential-storage migration tests."""
from __future__ import annotations

import unittest
from unittest.mock import patch

from custom_components.akuvox.credentials import async_load_and_migrate_credentials


class _Store:
    def __init__(self) -> None:
        self.data = {}

    async def async_load(self):
        return self.data

    async def async_save(self, data) -> None:
        self.data = data


class _Entries:
    def async_update_entry(self, entry, **kwargs) -> None:
        entry.data = kwargs["data"]
        entry.options = kwargs["options"]


class _Hass:
    def __init__(self) -> None:
        self.config_entries = _Entries()


class _Entry:
    entry_id = "entry-id"

    def __init__(self) -> None:
        self.data = {"auth_token": "legacy-auth", "host": "api.example"}
        self.options = {"token": "legacy-token"}


class TestCredentialMigrationE2E(unittest.IsolatedAsyncioTestCase):
    """Verify legacy config-entry credentials are moved once and removed."""

    async def test_legacy_credentials_were_moved_to_private_storage(self) -> None:
        """Migrate tokens from both legacy config-entry locations once."""
        hass = _Hass()
        entry = _Entry()
        store = _Store()

        with patch("custom_components.akuvox.credentials._store", return_value=store):
            credentials = await async_load_and_migrate_credentials(hass, entry)
            second_read = await async_load_and_migrate_credentials(hass, entry)

        self.assertEqual(credentials, {"auth_token": "legacy-auth", "token": "legacy-token"})
        self.assertEqual(second_read, credentials)
        self.assertEqual(store.data[entry.entry_id], credentials)
        self.assertEqual(entry.data, {"host": "api.example"})
        self.assertEqual(entry.options, {})
