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

test("builds notification automations with snake-case door-event fields", () => {
  const config = automation();
  const templates = [
    ...config.conditions.map((condition) => condition.value_template),
    config.actions[0].choose[0].conditions[0].value_template,
    ...config.actions[0].choose[0].sequence.flatMap((action) => [
      action.data.title,
      action.data.message,
      action.data.data.image,
    ]),
  ].join("\n");

  for (const field of ["location", "capture_type", "initiator", "pic_url"]) {
    assert.match(templates, new RegExp(`trigger\\.event\\.data\\.${field}`));
  }
  assert.doesNotMatch(templates, /trigger\.event\.data\.(Location|CaptureType|Initiator|PicUrl)/);
});

test("filters temporary-key unlocks by the stable temporary key ID", () => {
  const config = buildDoorNotificationAutomation({
    name: "Guest access",
    doors: [{ deviceId: "door-1", name: "Front door" }],
    services: ["notify.mobile_app_phone"],
    includeOpened: true,
    includeCalls: false,
    callerRules: [{ type: "temporary_key", keyId: "key-42", name: "Guest", operator: "is" }],
  });
  const templates = config.conditions.map((condition) => condition.value_template).join("\n");

  assert.match(templates, /"Temp Key Unlock"/);
  assert.match(templates, /trigger\.event\.data\.temporary_key_id/);
  assert.match(templates, /"key-42"/);
  assert.deepEqual(asDoorNotification(config, doors)?.callerRules, [
    { type: "temporary_key", keyId: "key-42", name: "key-42", operator: "is" },
  ]);
});

test("recognizes notification automations using legacy door-event fields", () => {
  const legacyConfig = JSON.parse(JSON.stringify(automation())
    .replaceAll("capture_type", "CaptureType")
    .replaceAll("initiator", "Initiator")
    .replaceAll("pic_url", "PicUrl"));

  assert.deepEqual(asDoorNotification(legacyConfig, doors), {
    name: "Front door notification",
    doorIds: ["door-1"],
    includeOpened: true,
    includeCalls: true,
    callerRules: [{ name: "Alex", operator: "is" }],
    callerOperator: "is",
    services: ["notify.mobile_app_phone"],
    initialState: undefined,
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
