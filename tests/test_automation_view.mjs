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

test("builds a unique Companion App action for every selected door relay", () => {
  const config = buildDoorNotificationAutomation({
    name: "Open front door from call",
    doors: [
      { deviceId: "door-1", name: "Front door" },
      { deviceId: "door-2", name: "Side door" },
    ],
    services: ["notify.mobile_app_phone", "notify.email"],
    includeOpened: false,
    includeCalls: true,
    includeRelayAction: true,
    relayEntities: [
      { deviceId: "door-1", entityId: "button.front_door_main", name: "Front door main relay" },
      { deviceId: "door-1", entityId: "button.front_door_side", name: "Front door side relay" },
      { deviceId: "door-2", entityId: "button.side_door", name: "Side door relay" },
    ],
  });

  assert.equal(config.actions.length, 4);
  assert.deepEqual(config.actions[0].variables, {
    akuvox_relay_action_0: "AKUVOX_OPEN_RELAY_0_{{ context.id }}",
    akuvox_relay_action_1: "AKUVOX_OPEN_RELAY_1_{{ context.id }}",
    akuvox_relay_action_2: "AKUVOX_OPEN_RELAY_2_{{ context.id }}",
  });
  const mobileActions = config.actions[1].choose[0].sequence[0].default[0].data.data.actions;
  assert.deepEqual(mobileActions.map((action) => action.title), [
    "Open Front door main relay", "Open Front door side relay",
  ]);
  assert.deepEqual(
    config.actions[1].choose[1].sequence[0].default[0].data.data.actions.map((action) => action.title),
    ["Open Side door relay"],
  );
  assert.equal(config.actions[1].choose[0].sequence[0].default[1].data.data, undefined);
  assert.equal(config.actions[2].wait_for_trigger.length, 3);
  assert.deepEqual(config.actions[3].choose.map((choice) => choice.sequence[0].target.entity_id), [
    "button.front_door_main", "button.front_door_side", "button.side_door",
  ]);
  assert.equal(asDoorNotification(config, new Map([
    ["door-1", "Front door"], ["door-2", "Side door"],
  ]))?.includeRelayAction, true);
});

test("preserves notification options in an editable automation", () => {
  const config = buildDoorNotificationAutomation({
    name: "Priority front door call",
    doors: [{ deviceId: "door-1", name: "Front door" }],
    services: ["notify.mobile_app_phone"],
    includeOpened: false,
    includeCalls: true,
    includeImage: false,
    iosSound: "alarm.caf",
    androidChannel: "doorbell",
    priorityAlert: true,
    includeRelayAction: true,
    requireActionAuthentication: true,
    relayEntities: [{ deviceId: "door-1", entityId: "button.front_door", name: "Front door" }],
  });

  const notification = config.actions[1].choose[0].sequence[0].default[0].data.data;
  assert.deepEqual(notification.push.sound, { name: "alarm.caf", critical: 1, volume: 1 });
  assert.equal(notification.channel, "alarm_stream");
  assert.equal(notification.image, undefined);
  assert.equal(notification.actions[0].authenticationRequired, true);
  assert.deepEqual(asDoorNotification(config, doors), {
    name: "Priority front door call",
    doorIds: ["door-1"],
    includeOpened: false,
    includeCalls: true,
    callerRules: [],
    callerOperator: "is",
    services: ["notify.mobile_app_phone"],
    includeRelayAction: true,
    requireActionAuthentication: true,
    includeImage: false,
    iosSound: "alarm.caf",
    priorityAlert: true,
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
