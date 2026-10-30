"""Run the Apple Home example through real Home Assistant entities and triggers."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import yaml

from homeassistant import loader
from homeassistant.bootstrap import async_load_base_functionality
from homeassistant.components.input_boolean import InputBoolean
from homeassistant.config_entries import ConfigEntries
from homeassistant.core import HomeAssistant, State
from homeassistant.setup import async_setup_component

PACKAGE = Path(__file__).resolve().parents[1] / "docs/examples/apple_home_package.yaml"
HELPER = "input_boolean.akuvox_front_door_unlocked"
DOORBELL = "event.front_door_doorbell"


class TestAppleHomePackage(unittest.IsolatedAsyncioTestCase):
    """Catch missed rings, cross-door events, and stale temporary unlock state."""

    async def asyncSetUp(self):
        """Load only the example's local entities; never start HomeKit or SIP."""
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.hass = HomeAssistant(self.directory.name)
        loader.async_setup(self.hass)
        self.hass.config.skip_pip = True
        self.hass.config_entries = ConfigEntries(self.hass, {})
        await async_load_base_functionality(self.hass)
        self.config = yaml.safe_load(PACKAGE.read_text())
        # Stand in for a persisted unlocked state from the previous HA session.
        self.restore = patch.object(
            InputBoolean, "async_get_last_state", new_callable=AsyncMock,
            return_value=State(HELPER, "on"))
        self.restored_state = self.restore.start()
        self.addCleanup(self.restore.stop)
        for domain in ("input_boolean", "template", "automation"):
            self.assertTrue(await async_setup_component(self.hass, domain, self.config))
        await self.hass.async_block_till_done()

    async def asyncTearDown(self):
        """Stop tasks before disposing of the isolated Home Assistant directory."""
        await self.hass.async_stop()
        await self.hass.async_block_till_done()

    async def _start(self):
        """Activate the example's actual state and event triggers."""
        await self.hass.async_start()
        await self.hass.async_block_till_done()

    async def test_two_close_sip_rings_produce_distinct_homekit_events(self):
        """A second ring does not wait for a twenty-second binary-sensor reset."""
        await self._start()
        timestamps = []
        for _ in range(2):
            self.hass.states.async_set("sensor.ha_sip_account_1", "false")
            await self.hass.async_block_till_done()
            self.hass.states.async_set(
                "sensor.ha_sip_account_1", "true", {"parsed_remote_uri": "sip:entrance"})
            await self.hass.async_block_till_done()
            state = self.hass.states.get(DOORBELL)
            self.assertEqual(state.attributes["event_type"], "ring")
            self.assertEqual(state.attributes["caller"], "sip:entrance")
            timestamps.append(state.state)
        self.assertNotEqual(timestamps[0], timestamps[1])
        self.assertEqual(
            self.config["homekit"][0]["entity_config"]["camera.front_door"]["linked_doorbell_sensor"],
            DOORBELL)

    async def test_fallback_ignores_other_doors_and_non_call_events(self):
        """Only the configured door device's Call event updates the timestamp."""
        await self._start()
        device_id = self.config["template"][0]["triggers"][1]["event_data"]["device_id"]
        initial = self.hass.states.get(DOORBELL).state
        for data in (
            {"device_id": "another-account-door", "capture_type": "Call"},
            {"device_id": device_id, "capture_type": "Face Unlock"},
            {"capture_type": "Call"},
        ):
            self.hass.bus.async_fire("akuvox_door_update", data)
            await self.hass.async_block_till_done()
            self.assertEqual(self.hass.states.get(DOORBELL).state, initial)
        self.hass.bus.async_fire("akuvox_door_update", {
            "device_id": device_id, "capture_type": "Call", "initiator": "Visitor"})
        await self.hass.async_block_till_done()
        state = self.hass.states.get(DOORBELL)
        self.assertNotEqual(state.state, initial)
        self.assertEqual(state.attributes["caller"], "Visitor")

    async def test_initial_state_does_not_restore_temporary_unlock(self):
        """The helper starts off even when the previous session was unlocked."""
        self.restored_state.assert_not_awaited()
        self.assertEqual(self.hass.states.get(HELPER).state, "off")
        await self._start()
        self.assertEqual(self.hass.states.get("lock.front_door").state, "locked")

    async def test_startup_also_resets_an_already_on_helper(self):
        """Startup cleanup covers a transient on state before HA has started."""
        await self.hass.services.async_call(
            "input_boolean", "turn_on", {"entity_id": HELPER}, blocking=True)
        self.assertEqual(self.hass.states.get(HELPER).state, "on")
        await self._start()
        self.assertEqual(self.hass.states.get(HELPER).state, "off")
