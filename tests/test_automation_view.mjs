import assert from "node:assert/strict";
import test from "node:test";

import { buildDoorNotificationAutomation } from "../custom_components/akuvox/panel/views/settings-view.js";
import { asDoorNotification } from "../custom_components/akuvox/panel/views/automations-view.js";

const doors = new Map([["door-1", "Front door"]]);

const automation = (overrides = {}) => ({
  ...buildDoorNotificationAutomation({
    name: "Front door notification",
    doors: [{ deviceId: "door-1", name: "Front door" }],
    services: ["notify.mobile_app_phone"],
    includeOpened: true,
    includeCalls: true,
    callerRules: [{ name: "Alex", operator: "is" }],
  }),
  ...overrides,
});

test("recognizes a wizard-compatible disabled notification automation", () => {
  const selection = asDoorNotification(automation({ initial_state: false }), doors);

  assert.deepEqual(selection, {
    name: "Front door notification",
    doorIds: ["door-1"],
    includeOpened: true,
    includeCalls: true,
    callerRules: [{ name: "Alex", operator: "is" }],
    callerOperator: "is",
    services: ["notify.mobile_app_phone"],
    initialState: false,
  });
});

test("does not list automations with behavior the wizard cannot preserve", () => {
  const config = automation();
  config.conditions.push({ condition: "state", entity_id: "input_boolean.awake", state: "on" });

  assert.equal(asDoorNotification(config, doors), null);
});

test("does not list automations for a different Akuvox account", () => {
  const config = automation();
  config.triggers[0].device_id = "other-account-door";

  assert.equal(asDoorNotification(config, doors), null);
});
