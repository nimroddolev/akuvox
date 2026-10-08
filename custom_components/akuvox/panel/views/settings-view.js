/**
 * Settings view: Event, display, and panel options.
 */

import { closeOnBackdrop, escapeHtml } from "../utils/dom.js";
import { icons } from "../utils/icons.js?v=20260930-notification-bell-v5";
import { callWsWithBlocker, confirmModal, showNotice, showPairingLinkNotice } from "../components/dialogs.js?v=20261003-i18n-statuses";
import { CAMERA_ORIENTATION_OPTIONS } from "../utils/orientation.js?v=20260830-combined-directional-labels";
import { localizeElement, t } from "../utils/i18n.js?v=20261005-pseudo-spanish";

const RECEIVER_CONTACT_TIMEOUT_MS = 2 * 60 * 1000;

const receiverIsConnected = (share) => {
  if (typeof share.connected === "boolean") return share.connected;
  const lastContact = Date.parse(share.last_sync || "");
  return Boolean(
    share.activated &&
    Number.isFinite(lastContact) &&
    Date.now() - lastContact <= RECEIVER_CONTACT_TIMEOUT_MS
  );
};

const cameraOptionsTable = (host) => {
  const cameras = panelCameras(host);
  const streamOrientations = host._settings?.camera_stream_orientations || {};
  const activityOrientations = host._settings?.activity_image_orientations || {};
  return `
    <div class="table-wrap camera-options-wrap">
      <table class="camera-options-table">
        <thead><tr><th>Camera</th><th>Stream Orientation</th><th>Activity Image Orientation</th><th>RTSP Url</th></tr></thead>
        <tbody>
          ${cameras.map((camera) => `<tr>
            <td title="${escapeHtml(camera.name)}">${escapeHtml(camera.name)}</td>
            <td><select name="camera_stream_orientation" data-stream-orientation="${escapeHtml(camera.sourceName)}" aria-label="${escapeHtml(t(host, "{name} stream orientation", { name: camera.name }))}">${CAMERA_ORIENTATION_OPTIONS.map(([value, label]) => `<option value="${value}" ${streamOrientations[camera.sourceName] === value ? "selected" : ""}>${escapeHtml(t(host, label))}</option>`).join("")}</select></td>
            <td><select name="activity_image_orientation" data-activity-orientation="${escapeHtml(camera.sourceName)}" aria-label="${escapeHtml(t(host, "{name} activity image orientation", { name: camera.name }))}">${CAMERA_ORIENTATION_OPTIONS.map(([value, label]) => `<option value="${value}" ${activityOrientations[camera.sourceName] === value ? "selected" : ""}>${escapeHtml(t(host, label))}</option>`).join("")}</select></td>
            <td><button class="camera-copy-rtsp" type="button" data-stream="${escapeHtml(camera.sourceName)}" data-mode="copy" aria-label="Copy RTSP link" title="Copy RTSP link">${icons.copy}<span>Copy RTSP</span></button></td>
          </tr>`).join("") || '<tr><td colspan="4" class="muted">No cameras are currently available for this account.</td></tr>'}
        </tbody>
      </table>
    </div>`;
};

const panelCameras = (host) => [...new Map(
  (host._account()?.cameras || [])
    .filter((camera) => camera.name)
    .map((camera) => {
      const sourceName = camera.source_name || camera.name;
      return [sourceName, { name: camera.name, sourceName }];
    })
).values()].sort((left, right) => left.name.localeCompare(right.name));

const notificationDoors = (host) => {
  const doors = new Map();
  const addDoor = (item) => {
    const deviceId = item?.device_id;
    if (!deviceId) return;
    const door = doors.get(deviceId) || {
      name: item.name || item.door_name || "Unnamed door", deviceId,
    };
    if (!doors.has(deviceId)) doors.set(deviceId, door);
  };
  const account = host._account?.() || {};
  (account.cameras || []).forEach(addDoor);
  (account.relays || []).forEach(addDoor);
  return [...doors.values()].sort((left, right) => left.name.localeCompare(right.name));
};

const companionNotificationServices = (services) => services.filter(
  (service) => service.startsWith("notify.mobile_app_")
);

const IOS_NOTIFICATION_SOUNDS = [
  "default",
  "alarm.caf",
  "Ringtone_US_Haptic.caf",
  "US-EN-Alexa-Front-Door-Opened.wav",
  "US-EN-Morgan-Freeman-Front-Door-Opened.wav",
];

const relayEntities = async (host) => {
  try {
    const entities = await host._hass.callWS({ type: "config/entity_registry/list" });
    return (entities || []).filter((entity) => (
      entity?.platform === "akuvox" && String(entity.entity_id || "").startsWith("button.") &&
      entity.device_id
    )).map((entity) => ({
      deviceId: entity.device_id,
      entityId: entity.entity_id,
      name: entity.name || entity.original_name || entity.entity_id,
    }));
  } catch (_) {
    // A user without registry access can still create ordinary notifications.
    return [];
  }
};

const notificationServices = (host) => Object.keys(host._hass?.services?.notify || {})
  .sort()
  .map((service) => ({
    service: `notify.${service}`,
    name: service.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
  }));

const familyMembers = (host) => [...new Set(
  (host._account?.()?.family_members || [])
    .map((name) => String(name).trim())
    .filter(Boolean)
)].sort((left, right) => left.localeCompare(right));

const temporaryKeys = (host) => {
  const keys = (host._account?.()?.temporary_keys || [])
    .filter((key) => key && !key.expired && key.key_id && String(key.description || "").trim())
    .map((key) => ({
      keyId: String(key.key_id),
      name: String(key.description).trim(),
    }));
  const names = new Map();
  keys.forEach((key) => names.set(key.name, (names.get(key.name) || 0) + 1));
  // SmartPlus door logs identify a temporary key by its description. Do not
  // offer an ambiguous key that cannot be resolved safely to its stable ID.
  return keys.filter((key) => names.get(key.name) === 1)
    .sort((left, right) => left.name.localeCompare(right.name));
};

const notificationAction = (service, withImage, relayActions = [], options = {}) => {
  const isCompanionApp = service.startsWith("notify.mobile_app_");
  const mobileData = isCompanionApp ? {
    ...((options.iosSound || options.priorityAlert) ? { push: {
      sound: options.priorityAlert
        ? { name: options.iosSound || "default", critical: 1, volume: 1.0 }
        : options.iosSound,
    } } : {}),
    ...(options.priorityAlert ? { ttl: 0, priority: "high", channel: "alarm_stream" }
      : options.androidChannel ? { channel: options.androidChannel } : {}),
  } : {};
  return {
    action: service,
    data: {
    title: "{{ trigger.event.data.location }} {% if trigger.event.data.capture_type == 'Call' %}doorbell{% else %}opened{% endif %}",
    message: "{{ 'Someone is calling from the ' ~ trigger.event.data.location ~ ' door' if trigger.event.data.capture_type == 'Call' else 'The ' ~ trigger.event.data.location ~ ' door was opened by ' ~ (trigger.event.data.initiator | default('Unknown', true)) }}",
    ...((withImage || relayActions.length || Object.keys(mobileData).length) ? { data: {
      ...(withImage ? { image: "{{ trigger.event.data.pic_url }}" } : {}),
      ...(relayActions.length ? { actions: relayActions } : {}),
      ...mobileData,
    } } : {}),
  },
  };
};

const suggestedAutomationName = (host, { doors, totalDoorCount, callerRules, includeOpened, includeCalls }) => {
  const allDoorsSelected = doors.length > 0 && doors.length === totalDoorCount;
  const doorName = allDoorsSelected ? t(host, "any door")
    : doors.length === 1 ? t(host, "the {name} door", { name: doors[0].name }) : t(host, "selected doors");
  const pluralDoors = !allDoorsSelected && doors.length !== 1;
  const callerNames = callerRules.map((rule) => rule.name);
  if (!callerNames.length) {
    if (includeOpened && !includeCalls) return t(host, pluralDoors ? "Notify when {door} open" : "Notify when {door} opens", { door: doorName });
    if (!includeOpened && includeCalls) return t(host, pluralDoors ? "Notify when {door} are called" : "Notify when {door} is called", { door: doorName });
    return t(host, pluralDoors ? "Notify when {door} are called or opened" : "Notify when {door} is called or opened", { door: doorName });
  }

  const excludedCallers = callerRules.every((rule) => rule.operator === "is_not");
  const names = joinCallerNames(callerNames, excludedCallers ? "and" : "or");
  const subject = excludedCallers ? t(host, "someone other than {names}", { names }) : names;
  const plural = !excludedCallers && callerNames.length > 1;
  if (includeOpened && !includeCalls) {
    return t(host, plural ? "Notify when {subject} open or unlock {door}" : "Notify when {subject} opens or unlocks {door}", { subject, door: doorName });
  }
  if (!includeOpened && includeCalls) {
    return t(host, plural ? "Notify when {subject} call {door}" : "Notify when {subject} calls {door}", { subject, door: doorName });
  }
  return t(host, plural ? "Notify when {subject} call or open {door}" : "Notify when {subject} calls or opens {door}", { subject, door: doorName });
};

const joinCallerNames = (names, conjunction) => {
  if (names.length < 2) return names[0] || "";
  if (names.length === 2) return `${names[0]} ${conjunction} ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, ${conjunction} ${names.at(-1)}`;
};

const callerConditionSummary = (rules) => {
  const allowed = rules.filter((rule) => rule.operator === "is").map((rule) => rule.name);
  const excluded = rules.filter((rule) => rule.operator === "is_not").map((rule) => rule.name);
  if (!allowed.length && !excluded.length) return "Optionally limit notifications to selected callers.";
  const allowedSummary = allowed.length
    ? `Triggered when ${joinCallerNames(allowed, "or")} ${allowed.length === 1 ? "opens" : "open"} the door`
    : "";
  const excludedClause = excluded.length
    ? `${joinCallerNames(excluded, "and")} did not open the door`
    : "";
  if (allowedSummary && excludedClause) return `${allowedSummary} and ${excludedClause}.`;
  if (allowedSummary) return `${allowedSummary}.`;
  return `Triggered if ${excludedClause}.`;
};

export const buildDoorNotificationAutomation = ({ name, doors, services, includeOpened, includeCalls, callerRules = [], includeRelayAction = false, includeImage = true, iosSound = "", androidChannel = "", priorityAlert = false, requireActionAuthentication = false, relayEntities = [], initialState }) => {
  const captureTypes = [
    ...(includeOpened ? ["Face Unlock", "Unlock on SmartPlus", "Temp Key Unlock"] : []),
    ...(includeCalls ? ["Call"] : []),
  ];
  const identities = (operator, type) => callerRules
    .filter((rule) => rule.operator === operator && (rule.type || "family") === type)
    .map((rule) => type === "temporary_key" ? rule.keyId : rule.name)
    .filter(Boolean);
  const allowedCallers = identities("is", "family");
  const excludedCallers = identities("is_not", "family");
  const allowedKeys = identities("is", "temporary_key");
  const excludedKeys = identities("is_not", "temporary_key");
  const identityExpression = (callers, keys, operator) => {
    const comparisons = [
      ...(callers.length ? [`(trigger.event.data.initiator | default('', true)) ${operator} ${JSON.stringify(callers)}`] : []),
      ...(keys.length ? [`(trigger.event.data.temporary_key_id | default('', true)) ${operator} ${JSON.stringify(keys)}`] : []),
    ];
    return comparisons.join(operator === "in" ? " or " : " and ");
  };
  const callerConditions = [
    ...(allowedCallers.length || allowedKeys.length ? [{
      condition: "template",
      value_template: `{{ ${identityExpression(allowedCallers, allowedKeys, "in")} }}`,
    }] : []),
    ...(excludedCallers.length || excludedKeys.length ? [{
      condition: "template",
      value_template: `{{ ${identityExpression(excludedCallers, excludedKeys, "not in")} }}`,
    }] : []),
  ];
  const relaysByDoor = new Map();
  relayEntities.forEach((relay) => {
    if (!relay?.deviceId || !relay?.entityId) return;
    const relays = relaysByDoor.get(relay.deviceId) || [];
    relays.push(relay);
    relaysByDoor.set(relay.deviceId, relays);
  });
  const selectedRelayEntities = includeRelayAction && includeCalls
    ? doors.flatMap((door) => relaysByDoor.get(door.deviceId) || []) : [];
  const actionServices = companionNotificationServices(services);
  const notificationOptions = { iosSound, androidChannel, priorityAlert };
  const relayActions = (relays) => relays.map((relay) => ({
    action: `{{ akuvox_relay_action_${selectedRelayEntities.indexOf(relay)} }}`,
    title: `Open ${relay.name}`,
    ...(requireActionAuthentication ? { authenticationRequired: true } : {}),
  }));
  const notificationFor = (relays = []) => ({
    choose: [{
      conditions: [{
        condition: "template",
        value_template: "{{ trigger.event.data.pic_url | default('', true) != '' }}",
      }],
      sequence: services.map((service) => notificationAction(
        service, includeImage, actionServices.includes(service) ? relayActions(relays) : [], notificationOptions
      )),
    }],
    default: services.map((service) => notificationAction(
      service, false, actionServices.includes(service) ? relayActions(relays) : [], notificationOptions
    )),
  });
  const notification = selectedRelayEntities.length && actionServices.length ? {
    choose: doors.filter((door) => (relaysByDoor.get(door.deviceId) || []).length).map((door) => ({
      conditions: [{
        condition: "template",
        value_template: `{{ trigger.event.data.device_id == ${JSON.stringify(door.deviceId)} }}`,
      }],
      sequence: [notificationFor(relaysByDoor.get(door.deviceId))],
    })),
    default: [notificationFor()],
  } : notificationFor();
  const relayActionFlow = selectedRelayEntities.length && actionServices.length ? [
    {
      variables: Object.fromEntries(selectedRelayEntities.map((_, index) => [
        `akuvox_relay_action_${index}`, `AKUVOX_OPEN_RELAY_${index}_{{ context.id }}`,
      ])),
    },
    notification,
    {
      wait_for_trigger: selectedRelayEntities.map((_, index) => ({
        trigger: "event",
        event_type: "mobile_app_notification_action",
        event_data: { action: `{{ akuvox_relay_action_${index} }}` },
      })),
      timeout: "00:05:00",
      continue_on_timeout: false,
    },
    {
      choose: selectedRelayEntities.map((relay, index) => ({
        conditions: [{
          condition: "template",
          value_template: `{{ wait.trigger.event.data.action == akuvox_relay_action_${index} }}`,
        }],
        sequence: [{ action: "button.press", target: { entity_id: relay.entityId } }],
      })),
    },
  ] : [notification];
  return {
    alias: name,
    description: "Created by Akuvox SmartPlus door-event notifications.",
    mode: "parallel",
    max: 10,
    triggers: doors.map((door) => ({
      trigger: "device",
      domain: "akuvox",
      device_id: door.deviceId,
      type: "door_unlocked",
    })),
    conditions: [{
      condition: "template",
      value_template: `{{ trigger.event.data.capture_type in ${JSON.stringify(captureTypes)} }}`,
    }, ...callerConditions],
    actions: relayActionFlow,
    ...(initialState === false ? { initial_state: false } : {}),
  };
};

const requestDoorNotificationStep = (host, { title = "Create Automation", description, headerContent = "", stage, totalStages = 6, progressFromStage = stage - 1, progressToStage = stage, content, backLabel, nextLabel, submit, bind, focusCancel = false }) => new Promise((resolve) => {
  const dialog = host.shadowRoot.ownerDocument.createElement("dialog");
  dialog.className = "door-notification-dialog";
  dialog.innerHTML = `<button class="door-notification-close" type="button" data-cancel aria-label="Close" title="Close" ${focusCancel ? "autofocus" : ""}>×</button><div class="remote-instance-dialog-header"><h2>${escapeHtml(title)}</h2>
    <div class="share-stage-progress" role="progressbar" aria-label="Automation setup progress" aria-valuemin="0" aria-valuemax="${totalStages}" aria-valuenow="${progressFromStage}"><span data-door-notification-progress style="width:${(progressFromStage / totalStages) * 100}%"></span></div>
    ${headerContent ? `<div class="door-notification-heading-row"><p data-door-notification-description>${escapeHtml(description)}</p>${headerContent}</div>` : `<p data-door-notification-description>${escapeHtml(description)}</p>`}</div>
    <form data-door-notification-form>
      <div class="door-notification-step-content">${content}<p class="form-error" data-door-notification-error hidden></p></div>
      <div class="modal-actions">${backLabel ? `<button class="modal-cancel" type="button" data-back>${escapeHtml(backLabel)}</button>` : ""}<button class="modal-action" type="submit" data-next>${escapeHtml(nextLabel)}</button></div>
    </form>`;
  const form = dialog.querySelector("[data-door-notification-form]");
  const error = dialog.querySelector("[data-door-notification-error]");
  let result = null;
  dialog.querySelector("[data-cancel]").addEventListener("click", () => dialog.close());
  dialog.querySelector("[data-back]")?.addEventListener("click", () => {
    result = { direction: "back" };
    dialog.close();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = submit(form, error);
    if (!value) return;
    result = { direction: "next", value };
    dialog.close();
  });
  dialog.addEventListener("close", () => {
    host._modalCount = Math.max(0, (host._modalCount || 1) - 1);
    dialog.remove();
    resolve(result);
  }, { once: true });
  host._modalCount = (host._modalCount || 0) + 1;
  closeOnBackdrop(dialog);
  host.shadowRoot.append(dialog);
  localizeElement(host, dialog);
  bind?.(dialog, form);
  dialog.showModal();
  const stepContent = dialog.querySelector(".door-notification-step-content");
  if (stepContent) stepContent.scrollTop = 0;
  const progress = dialog.querySelector("[data-door-notification-progress]");
  if (progress) {
    // Some stage bindings update the progress before the dialog is painted.
    // Reset and flush the prior value so every forward transition is visible.
    progress.style.transition = "none";
    progress.style.width = `${(progressFromStage / totalStages) * 100}%`;
    progress.parentElement?.setAttribute("aria-valuenow", String(progressFromStage));
    void progress.offsetWidth;
    window.requestAnimationFrame(() => {
      progress.style.transition = "";
      window.requestAnimationFrame(() => {
        progress.style.width = `${(progressToStage / totalStages) * 100}%`;
        progress.parentElement?.setAttribute("aria-valuenow", String(progressToStage));
      });
    });
  }
});

export const requestDoorNotificationAutomation = async (host, existing = null) => {
  const doors = notificationDoors(host);
  const members = familyMembers(host);
  const keys = temporaryKeys(host);
  const services = notificationServices(host);
  const availableRelayEntities = await relayEntities(host);
  const editing = Boolean(existing);
  const selection = {
    doorIds: [], includeOpened: false, includeCalls: false, callerRules: [],
    callerOperator: "is", services: [], includeRelayAction: false, includeImage: true,
    iosSound: "", androidChannel: "", priorityAlert: false, requireActionAuthentication: false,
    name: "", initialState: undefined,
    ...existing,
  };
  selection.callerRules = selection.callerRules.map((rule) => {
    if (rule.type !== "temporary_key") return rule;
    const key = keys.find((item) => item.keyId === rule.keyId);
    return { ...rule, name: key?.name || rule.name || rule.keyId };
  });
  const title = editing ? "Edit Automation" : "Create Automation";
  const canOfferRelayAction = () => selection.includeCalls &&
    companionNotificationServices(selection.services).length > 0 &&
    availableRelayEntities.some((relay) => selection.doorIds.includes(relay.deviceId));
  let step = 0;
  let progressFromStage = 0;
  while (step >= 0 && step < 6) {
    let result;
    if (step === 0) {
      result = await requestDoorNotificationStep(host, {
        title,
        stage: 1, progressFromStage, progressToStage: selection.doorIds.length ? 1 : 0, description: "Which doors should trigger the automation?", nextLabel: "Next", focusCancel: true,
        content: `<div class="door-picker-control selection-list-picker-control"><label class="door-picker-search"><input type="search" data-door-search aria-label="Search doors" placeholder="Type to filter doors" autocomplete="off"></label><div class="door-picker-results selection-list" data-door-picker-results role="listbox" aria-label="Doors"></div></div>`,
        bind: (dialog) => {
          const search = dialog.querySelector("[data-door-search]");
          const results = dialog.querySelector("[data-door-picker-results]");
          const nextButton = dialog.querySelector("[data-next]");
          const render = (updateProgress = false) => {
            nextButton.disabled = selection.doorIds.length === 0;
            if (updateProgress) {
              const progress = dialog.querySelector("[data-door-notification-progress]");
              if (progress) {
                const progressStage = selection.doorIds.length ? 1 : 0;
                progress.style.width = `${(progressStage / 6) * 100}%`;
                progress.parentElement?.setAttribute("aria-valuenow", String(progressStage));
              }
            }
            const query = search.value.trim().toLocaleLowerCase();
            const matching = doors.filter((door) => door.name.toLocaleLowerCase().includes(query));
            results.innerHTML = matching.map((door) => {
              const selected = selection.doorIds.includes(door.deviceId);
              return `<button class="door-picker-option door-selection-list-option" type="button" role="option" aria-selected="${selected}" data-toggle-door="${escapeHtml(door.deviceId)}"><span class="notification-service-selection${selected ? " selected" : ""}" aria-hidden="true">✓</span><span>${escapeHtml(door.name)}</span></button>`;
            }).join("") || '<p class="muted">No matching doors.</p>';
            results.querySelectorAll("[data-toggle-door]").forEach((button) => button.addEventListener("click", () => {
              const doorId = button.dataset.toggleDoor;
              selection.doorIds = selection.doorIds.includes(doorId)
                ? selection.doorIds.filter((item) => item !== doorId)
                : [...selection.doorIds, doorId];
              render(true);
            }));
          };
          search.addEventListener("input", () => render());
          render();
        },
        submit: (_form, error) => {
          if (selection.doorIds.length) return { doorIds: selection.doorIds };
          error.textContent = "Select at least one door."; error.hidden = false; return null;
        },
      });
    } else if (step === 1) {
      result = await requestDoorNotificationStep(host, {
        title,
        stage: 2, progressFromStage, progressToStage: selection.includeOpened || selection.includeCalls ? 2 : 1, description: "Which events should trigger the automation?", backLabel: "Back", nextLabel: "Next",
        content: `<fieldset><legend>Event types</legend><label class="door-notification-option"><input type="checkbox" name="opened" ${selection.includeOpened ? "checked" : ""}><span>Door opened / unlocked</span></label><label class="door-notification-option"><input type="checkbox" name="call" ${selection.includeCalls ? "checked" : ""}><span>Doorbell call</span></label></fieldset>`,
        bind: (dialog) => {
          const eventTypes = [...dialog.querySelectorAll('[name="opened"], [name="call"]')];
          const nextButton = dialog.querySelector("[data-next]");
          const updateStepState = () => {
            const hasEventType = eventTypes.some((input) => input.checked);
            nextButton.disabled = !hasEventType;
            const progress = dialog.querySelector("[data-door-notification-progress]");
            if (!progress) return;
            const progressStage = hasEventType ? 2 : 1;
            progress.style.width = `${(progressStage / 6) * 100}%`;
            progress.parentElement?.setAttribute("aria-valuenow", String(progressStage));
          };
          eventTypes.forEach((input) => input.addEventListener("change", updateStepState));
          updateStepState();
        },
        submit: (form, error) => {
          const includeOpened = form.querySelector('[name="opened"]').checked;
          const includeCalls = form.querySelector('[name="call"]').checked;
          if (includeOpened || includeCalls) return { includeOpened, includeCalls };
          error.textContent = "Select at least one event type."; error.hidden = false; return null;
        },
      });
    } else if (step === 2) {
      result = await requestDoorNotificationStep(host, {
        title,
        stage: 3, progressFromStage, description: "Who should trigger the automation?", backLabel: "Back", nextLabel: "Next",
        content: members.length || keys.length
          ? `<div class="caller-picker"><div class="caller-picker-add" data-caller-picker-add><button class="caller-picker-add-button" type="button" data-add-caller aria-label="Add a person or temporary key" aria-expanded="false"><span aria-hidden="true">+</span></button><div class="caller-picker-add-menu" data-add-caller-menu role="menu" hidden></div></div><div class="caller-condition-summary muted" data-caller-condition-summary hidden></div></div>`
          : '<p class="muted">No family members or active temporary keys are available. Continue to notify for every initiator.</p>',
        bind: (dialog) => {
          const addCaller = dialog.querySelector("[data-add-caller]");
          const addCallerPicker = dialog.querySelector("[data-caller-picker-add]");
          const addCallerMenu = dialog.querySelector("[data-add-caller-menu]");
          const summary = dialog.querySelector("[data-caller-condition-summary]");
          if (!addCaller || !summary) return;
          const render = () => {
            const selectedMembers = new Set(selection.callerRules.filter((rule) => (rule.type || "family") === "family").map((rule) => rule.name));
            const selectedKeys = new Set(selection.callerRules.filter((rule) => rule.type === "temporary_key").map((rule) => rule.keyId));
            const availableMembers = members.filter((name) => !selectedMembers.has(name));
            const availableKeys = keys.filter((key) => !selectedKeys.has(key.keyId));
            addCallerPicker.hidden = availableMembers.length + availableKeys.length === 0;
            addCallerMenu.innerHTML = `${availableMembers.length ? `<div class="caller-picker-menu-heading">Family members</div>${availableMembers.map((name) => `<button type="button" role="menuitem" data-add-caller-name="${escapeHtml(name)}"><span class="caller-picker-identity-icon" aria-hidden="true">${icons.user}</span><span>${escapeHtml(name)}</span></button>`).join("")}` : ""}${availableKeys.length ? `<div class="caller-picker-menu-heading">Temporary keys</div>${availableKeys.map((key) => `<button type="button" role="menuitem" data-add-key-id="${escapeHtml(key.keyId)}" data-add-key-name="${escapeHtml(key.name)}"><span class="caller-picker-identity-icon" aria-hidden="true">${icons.key}</span><span>${escapeHtml(key.name)}</span></button>`).join("")}` : ""}`;
            const plural = selection.callerRules.length !== 1;
            const callerRuleLabel = (isNot) => {
              if (selection.includeOpened && !selection.includeCalls) {
                if (isNot) return t(host, plural ? "do not open or unlock the door" : "does not open or unlock the door");
                return t(host, plural ? "open or unlock the door" : "opens or unlocks the door");
              }
              if (!selection.includeOpened && selection.includeCalls) {
                if (isNot) return t(host, plural ? "are not the caller" : "is not the caller");
                return t(host, plural ? "are the caller" : "is the caller");
              }
              if (isNot) return t(host, plural ? "do not call or unlock the door" : "does not call or unlock the door");
              return t(host, plural ? "call or unlock the door" : "calls or unlocks the door");
            };
            const hasCallers = selection.callerRules.length > 0;
            summary.hidden = false;
            if (!hasCallers) {
              summary.textContent = t(host, "Triggered by anyone.");
            } else {
              const separator = selection.callerOperator === "is" ? "or" : "and";
              const badges = selection.callerRules.map((rule, index) => {
                const punctuation = index === selection.callerRules.length - 1
                  ? ""
                  : index === selection.callerRules.length - 2
                    ? ` ${separator} `
                    : ", ";
                const label = rule.name;
                const identity = rule.type === "temporary_key" ? rule.keyId : rule.name;
                const icon = rule.type === "temporary_key" ? icons.key : icons.user;
                return `<button class="door-selection-badge${rule.type === "temporary_key" ? " is-temporary-key" : ""}" type="button" data-remove-caller="${escapeHtml(identity)}"><span class="caller-picker-selected-identity">${icon}<span>${escapeHtml(label)}</span></span><span aria-hidden="true">×</span><span class="sr-only">${escapeHtml(t(host, "Remove {name}", { name: label }))}</span></button>${punctuation ? `<span class="caller-condition-punctuation">${punctuation}</span>` : ""}`;
              }).join("");
              summary.innerHTML = `<span>${t(host, "Triggered when")}</span><span class="door-picker-badges" aria-label="${escapeHtml(t(host, "Selected family members"))}">${badges}</span><span class="caller-picker-rule"><select data-caller-operator aria-label="${escapeHtml(t(host, "Caller rule"))}"><option value="is" ${selection.callerOperator === "is" ? "selected" : ""}>${callerRuleLabel(false)}</option><option value="is_not" ${selection.callerOperator === "is_not" ? "selected" : ""}>${callerRuleLabel(true)}</option></select></span>`;
            }
            const badges = summary.querySelector("[aria-label='Selected family members']");
            badges?.querySelectorAll("[data-remove-caller]").forEach((button) => button.addEventListener("click", () => {
              selection.callerRules = selection.callerRules.filter((rule) => (rule.type === "temporary_key" ? rule.keyId : rule.name) !== button.dataset.removeCaller);
              render();
            }));
            addCallerMenu.querySelectorAll("[data-add-caller-name]").forEach((button) => button.addEventListener("click", () => {
              selection.callerRules.push({ name: button.dataset.addCallerName, operator: selection.callerOperator });
              addCallerMenu.hidden = true;
              addCaller.setAttribute("aria-expanded", "false");
              render();
            }));
            addCallerMenu.querySelectorAll("[data-add-key-id]").forEach((button) => button.addEventListener("click", () => {
              selection.callerRules.push({ type: "temporary_key", keyId: button.dataset.addKeyId, name: button.dataset.addKeyName, operator: selection.callerOperator });
              addCallerMenu.hidden = true;
              addCaller.setAttribute("aria-expanded", "false");
              render();
            }));
            summary.querySelector("[data-caller-operator]")?.addEventListener("change", (event) => {
              selection.callerOperator = event.target.value;
              selection.callerRules.forEach((rule) => { rule.operator = selection.callerOperator; });
              render();
            });
          };
          addCaller.addEventListener("click", (event) => {
            event.stopPropagation();
            const opening = addCallerMenu.hidden;
            addCallerMenu.hidden = !opening;
            if (opening) {
              const pickerBounds = addCallerPicker.getBoundingClientRect();
              const menuHeight = addCallerMenu.scrollHeight;
              const footerTop = dialog.querySelector(".modal-actions")?.getBoundingClientRect().top ?? window.innerHeight;
              addCallerPicker.classList.toggle("opens-upward", footerTop - pickerBounds.bottom < menuHeight + 6);
            }
            addCaller.setAttribute("aria-expanded", String(opening));
          });
          dialog.addEventListener("click", (event) => {
            if (!addCallerPicker.contains(event.target)) {
              addCallerMenu.hidden = true;
              addCaller.setAttribute("aria-expanded", "false");
            }
          });
          render();
        },
        submit: () => ({ callerRules: selection.callerRules }),
      });
    } else if (step === 3) {
      result = await requestDoorNotificationStep(host, {
        title,
        stage: 4, progressFromStage, progressToStage: selection.services.length ? 4 : 3, description: "Which notify services should be run?", backLabel: "Back", nextLabel: "Next",
        content: services.length
          ? `<div class="door-picker-control notification-service-picker-control"><label class="door-picker-search"><input type="search" data-service-search aria-label="Search notification services" placeholder="Type to filter notification services" autocomplete="off"></label><div class="door-picker-results notification-service-list" data-service-picker-results role="listbox" aria-label="Notification services"></div></div>`
          : '<p class="muted">No notification services are available.</p>',
        bind: (dialog) => {
          const search = dialog.querySelector("[data-service-search]");
          const results = dialog.querySelector("[data-service-picker-results]");
          const nextButton = dialog.querySelector("[data-next]");
          if (!search || !results) return;
          const render = (updateProgress = false) => {
            nextButton.disabled = selection.services.length === 0;
            if (updateProgress) {
              const progress = dialog.querySelector("[data-door-notification-progress]");
              if (progress) {
                const progressStage = selection.services.length ? 4 : 3;
                progress.style.width = `${(progressStage / 6) * 100}%`;
                progress.parentElement?.setAttribute("aria-valuenow", String(progressStage));
              }
            }
            const query = search.value.trim().toLocaleLowerCase();
            const matching = services.filter((service) => service.name.toLocaleLowerCase().includes(query));
            results.innerHTML = matching.map((service) => {
              const selected = selection.services.includes(service.service);
              return `<button class="door-picker-option notification-service-action-option" type="button" role="option" aria-selected="${selected}" data-toggle-service="${escapeHtml(service.service)}"><span class="notification-service-selection${selected ? " selected" : ""}" aria-hidden="true">✓</span><span class="notification-service-action-copy"><span>${escapeHtml(t(host, "Send a notification with {name}", { name: service.name }))}</span><small>${escapeHtml(t(host, "Sends a notification message using the {name} service.", { name: service.name }))}</small></span><span class="notification-service-action-domain">notify</span></button>`;
            }).join("") || '<p class="muted">No matching notification services.</p>';
            results.querySelectorAll("[data-toggle-service]").forEach((button) => button.addEventListener("click", () => {
              const serviceId = button.dataset.toggleService;
              selection.services = selection.services.includes(serviceId)
                ? selection.services.filter((item) => item !== serviceId)
                : [...selection.services, serviceId];
              render(true);
            }));
          };
          search.addEventListener("input", () => render());
          render();
        },
        submit: (_form, error) => {
          if (selection.services.length) return { services: selection.services };
          error.textContent = "Select at least one notification service."; error.hidden = false; return null;
        },
      });
    } else if (step === 4) {
      result = await requestDoorNotificationStep(host, {
        title,
        stage: 5, progressFromStage, progressToStage: 5,
        description: "Notification options", backLabel: "Back", nextLabel: "Next",
        content: `<fieldset><legend>Notification options</legend>${canOfferRelayAction() ? `<label class="door-notification-option"><input type="checkbox" name="open-called-door" ${selection.includeRelayAction ? "checked" : ""}><span>Include actions to open the called door relay</span></label><label class="door-notification-option"><input type="checkbox" name="require-action-authentication" ${selection.requireActionAuthentication ? "checked" : ""}><span>Require the phone to be unlocked to open a relay</span></label>` : ""}<label class="door-notification-option"><input type="checkbox" name="include-image" ${selection.includeImage ? "checked" : ""}><span>Display the captured still as the notification image</span></label><label class="door-notification-option"><span>iOS notification sound</span><input name="ios-sound" list="ios-notification-sounds" value="${escapeHtml(selection.iosSound)}" placeholder="Default or custom filename"><datalist id="ios-notification-sounds">${IOS_NOTIFICATION_SOUNDS.map((sound) => `<option value="${sound}"></option>`).join("")}</datalist></label><label class="door-notification-option"><span>Android notification channel</span><input data-android-channel name="android-channel" value="${escapeHtml(selection.androidChannel)}" placeholder="Configured channel name"><small data-android-channel-note hidden>Priority alerts use Android's alarm stream.</small></label><label class="door-notification-option"><input type="checkbox" name="priority-alert" ${selection.priorityAlert ? "checked" : ""}><span>Priority alert (critical on iOS, alarm stream on Android)</span></label></fieldset>`,
        bind: (dialog) => {
          const priorityAlert = dialog.querySelector('[name="priority-alert"]');
          const androidChannel = dialog.querySelector('[data-android-channel]');
          const note = dialog.querySelector('[data-android-channel-note]');
          const updateAndroidChannel = () => {
            const isPriority = priorityAlert.checked;
            androidChannel.disabled = isPriority;
            note.hidden = !isPriority;
          };
          priorityAlert.addEventListener("change", updateAndroidChannel);
          updateAndroidChannel();
        },
        submit: (form) => ({
          includeRelayAction: canOfferRelayAction() && form.querySelector('[name="open-called-door"]').checked,
          requireActionAuthentication: canOfferRelayAction() && form.querySelector('[name="require-action-authentication"]').checked,
          includeImage: form.querySelector('[name="include-image"]').checked,
          iosSound: form.querySelector('[name="ios-sound"]').value.trim(),
          androidChannel: form.querySelector('[name="android-channel"]').value.trim(),
          priorityAlert: form.querySelector('[name="priority-alert"]').checked,
        }),
      });
    } else {
      const selectedDoors = doors.filter((door) => selection.doorIds.includes(door.deviceId));
      const defaultName = suggestedAutomationName(host, {
        doors: selectedDoors,
        totalDoorCount: doors.length,
        callerRules: selection.callerRules,
        includeOpened: selection.includeOpened,
        includeCalls: selection.includeCalls,
      });
      result = await requestDoorNotificationStep(host, {
        title,
        stage: 6, progressFromStage, progressToStage: (selection.name || defaultName).trim() ? 6 : 5, description: "Enter the automation name.", backLabel: "Back", nextLabel: editing ? "Save automation" : "Create automation",
        content: `<input name="automation-name" type="text" value="${escapeHtml(selection.name || defaultName)}" aria-label="Automation name" required>`,
        bind: (dialog) => {
          const nameInput = dialog.querySelector('[name="automation-name"]');
          nameInput?.addEventListener("input", () => {
            const progress = dialog.querySelector("[data-door-notification-progress]");
            if (!progress) return;
            const progressStage = nameInput.value.trim() ? 6 : 5;
            progress.style.width = `${(progressStage / 6) * 100}%`;
            progress.parentElement?.setAttribute("aria-valuenow", String(progressStage));
          });
        },
        submit: (form, error) => {
          const name = form.querySelector('[name="automation-name"]').value.trim();
          if (name) return { name };
          error.textContent = "Enter an automation name."; error.hidden = false; return null;
        },
      });
    }
    if (!result) return null;
    progressFromStage = step + 1;
    if (result.direction === "back") { step -= 1; continue; }
    Object.assign(selection, result.value);
    if (step === 3 && !canOfferRelayAction()) selection.includeRelayAction = false;
    step += 1;
  }
  return {
    ...selection,
    doors: doors.filter((door) => selection.doorIds.includes(door.deviceId)),
    relayEntities: availableRelayEntities,
  };
};

export const showDoorNotificationCreated = (host, automationId, edited = false) => {
  const dialog = host.shadowRoot.ownerDocument.createElement("dialog");
  dialog.className = "door-notification-dialog door-notification-complete";
  dialog.innerHTML = `<h2>Notification Automation ${edited ? "Updated" : "Created"}</h2>
    <p>${edited ? "Your door-event notification has been updated." : "Your door-event notification is enabled and ready to use."}</p>
    <span class="result-icon success" aria-hidden="true">${icons.check}</span>
    <div class="modal-actions"><button class="modal-cancel" type="button" data-close>Close</button><a class="modal-action" href="/config/automation/edit/${encodeURIComponent(automationId)}">Open Automation</a></div>`;
  dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    host._modalCount = Math.max(0, (host._modalCount || 1) - 1);
    dialog.remove();
  }, { once: true });
  host._modalCount = (host._modalCount || 0) + 1;
  closeOnBackdrop(dialog);
  host.shadowRoot.append(dialog);
  localizeElement(host, dialog);
  dialog.showModal();
};

const eventOptions = (host) => {
  const settings = host._settings || {};
  const cameras = panelCameras(host);
  const overrides = settings.event_image_wait_overrides || {};
  const eventImageWaiting = settings.wait_for_event_image !== false;
  return `<div class="settings-row">
    <div><strong>Wait for event images</strong><p>Wait for an image URL before sending a door event.</p></div>
    <label class="settings-switch" aria-label="Wait for event images"><input name="wait_for_event_image" type="checkbox" ${eventImageWaiting ? "checked" : ""}><span></span></label>
  </div>
  <div class="settings-row" data-event-image-override-controls ${eventImageWaiting ? "" : "hidden"}>
    <div><strong>Apply per-device</strong><p>Set image waiting separately for each camera.</p></div>
    <label class="settings-switch" aria-label="Apply event image waiting per device"><input name="custom_event_image_wait" type="checkbox" ${settings.custom_event_image_wait ? "checked" : ""}><span></span></label>
  </div>
  <div class="settings-device-options" data-event-image-overrides ${eventImageWaiting && settings.custom_event_image_wait ? "" : "hidden"}>
    ${cameras.map((camera) => `<label class="settings-device-option"><span>${escapeHtml(camera.name)}</span><span class="settings-switch"><input type="checkbox" data-event-image-wait="${escapeHtml(camera.sourceName)}" aria-label="Wait for an event image from ${escapeHtml(camera.name)}" ${overrides[camera.sourceName] !== undefined ? (overrides[camera.sourceName] ? "checked" : "") : (settings.wait_for_event_image !== false ? "checked" : "")}><span></span></span></label>`).join("") || '<p class="muted">No cameras are currently available.</p>'}
  </div>`;
};

const formatStorageAmount = (bytes) => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.max(0, Number(bytes) || 0);
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }
  const precision = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
};

const formSignature = (form) => JSON.stringify([...new FormData(form).entries()]);

const formatPairingTimeRemaining = (milliseconds) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

const relativeContactTime = (host, value) => {
  const elapsed = Math.max(0, Date.now() - Date.parse(value || ""));
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return t(host, "Last contacted just now");
  if (minutes < 60) return t(host, minutes === 1 ? "Last contacted {count} minute ago" : "Last contacted {count} minutes ago", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t(host, hours === 1 ? "Last contacted {count} hour ago" : "Last contacted {count} hours ago", { count: hours });
  const days = Math.floor(hours / 24);
  return t(host, days === 1 ? "Last contacted {count} day ago" : "Last contacted {count} days ago", { count: days });
};

const relativeTime = (host, value) => {
  const elapsed = Math.max(0, Date.now() - Date.parse(value || ""));
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return t(host, "just now");
  if (minutes < 60) return t(host, minutes === 1 ? "{count} minute ago" : "{count} minutes ago", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t(host, hours === 1 ? "{count} hour ago" : "{count} hours ago", { count: hours });
  const days = Math.floor(hours / 24);
  return t(host, days === 1 ? "{count} day ago" : "{count} days ago", { count: days });
};

const remoteShareConnectionSection = (host, lastSync) => {
  const lastContact = Date.parse(lastSync || "");
  const connected = Number.isFinite(lastContact) && Date.now() - lastContact <= RECEIVER_CONTACT_TIMEOUT_MS;
  const status = t(host, connected ? "Connected" : "Connection delayed");
  const detail = Number.isFinite(lastContact)
    ? t(host, "Last connected {time}", { time: relativeTime(host, lastSync) })
    : t(host, "Waiting for the first connection");
  return `<p data-remote-share-connection class="credential-share-source-status ${connected ? "connected" : "waiting"}"><span>${connected ? "🟢" : "🟡"}</span> <strong>${status}</strong> · ${escapeHtml(detail)}</p>`;
};

/** Refresh receiver connection status without rebuilding the Settings form. */
export const updateRemoteShareConnectionStatus = (host, lastSync) => {
  const status = host.shadowRoot?.querySelector("[data-remote-share-connection]");
  if (status) status.outerHTML = remoteShareConnectionSection(host, lastSync);
};

const pairedReceiversSection = (host, shares = []) => {
  if (!shares.length) return "";
  return `<div class="credential-share-receivers settings-subsection">
    <p class="settings-list-label">Connected nodes</p>
    ${shares.map((share) => {
      const expiresAt = Date.parse(share.expires_at || "");
      const pendingExpired = !share.activated && (!Number.isFinite(expiresAt) || expiresAt <= Date.now());
      const status = pendingExpired ? "Pairing link expired" : share.revoked ? "Revoked" : !share.activated ? "Waiting to pair" : receiverIsConnected(share) ? "Connected" : "Disconnected";
      const statusClass = status === "Connected" ? "connected" : status === "Waiting to pair" ? "waiting" : "disconnected";
      const detail = status === "Waiting to pair"
        ? `${t(host, "Pairing link expires in")} <span data-pairing-expiry="${expiresAt}">${formatPairingTimeRemaining(expiresAt - Date.now())}</span>`
        : share.last_sync ? relativeContactTime(host, share.last_sync) : t(host, "Waiting for the first connection");
      return `<div class="credential-share-receiver-row ${statusClass}">
        <span class="credential-share-status"><span class="remote-node-indicator" aria-hidden="true"></span><span><strong>${escapeHtml(share.receiver_name)}</strong><small><em>${escapeHtml(t(host, status))}</em>${detail ? `<span class="credential-share-separator" aria-hidden="true">·</span><span>${detail}</span>` : ""}</small></span></span>
        <span class="credential-share-actions"><button class="action credential-share-view-button" type="button" data-view-credential-share="${escapeHtml(share.share_id)}" aria-label="View paired Home Assistant" title="View paired Home Assistant">${icons.eye}</button>${share.revoked
          ? `<button class="danger key-menu-button" type="button" data-delete-credential-share="${escapeHtml(share.share_id)}" aria-label="Delete paired Home Assistant" title="Delete paired Home Assistant">${icons.trash}</button>`
          : `<button class="action" type="button" data-revoke-credential-share="${escapeHtml(share.share_id)}">Revoke</button>`}</span>
      </div>`;
    }).join("")}
  </div>`;
};

const requestShareAccess = (host, viewedShare = null) => new Promise((resolve) => {
  const readOnly = viewedShare !== null;
  const account = host._account() || {};
  const existingReceiverNames = new Set(
    (host._settings?.credential_shares || [])
      .map((share) => String(share.receiver_name || "").trim().toLocaleLowerCase())
      .filter(Boolean),
  );
  const cameras = new Map((account.cameras || []).map((item) => [item.source_name || item.name, item]));
  const relays = account.relays || [];
  const members = familyMembers(host);
  const names = [...new Set([...cameras.keys(), ...relays.map((item) => item.source_name || item.name)])].sort();
  const availableDeviceIds = [
    ...cameras.values()].map((camera) => `camera:${camera.source_name || camera.name}`)
    .concat(relays.map((relay) => `relay:${relay.mac}:${relay.relay_id}`));
  const availableRelayIds = relays.map((relay) => `relay:${relay.mac}:${relay.relay_id}`);
  const selectedDeviceIds = new Set(viewedShare?.device_ids || (readOnly ? [] : availableDeviceIds));
  const createRelayIds = new Set(viewedShare?.create_key_relay_ids || (readOnly ? [] : availableRelayIds));
  const editRelayIds = new Set(viewedShare?.edit_key_relay_ids || (readOnly ? [] : availableRelayIds));
  const viewRelayIds = new Set(viewedShare?.view_key_relay_ids || (readOnly ? [] : availableRelayIds));
  const activityMemberNames = new Set(viewedShare?.activity_member_names || (readOnly ? [] : members));
  const callMemberNames = new Set(viewedShare?.call_member_names || (readOnly ? [] : members));
  const checked = (value) => value ? "checked" : "";
  const readOnlyCheck = (enabled) => `<span class="share-permission-control share-readonly-check${enabled ? " enabled" : ""}">${enabled ? "✓" : ""}</span>`;
  const checkbox = (attribute, value, inputValue = "") => readOnly
    ? readOnlyCheck(value)
    : `<span class="share-permission-control"><input ${attribute} type="checkbox" value="${escapeHtml(inputValue)}" ${checked(value)}></span>`;
  const dialog = host.shadowRoot.ownerDocument.createElement("dialog");
  dialog.className = "share-access-dialog";
  dialog.classList.toggle("theme-dark", Boolean(host._hass?.themes?.darkMode));
  const hasMultipleRelays = relays.some((relay) => relays.filter((item) => (item.source_name || item.name) === (relay.source_name || relay.name)).length > 1);
  const relayIds = availableRelayIds;
  const allCameras = cameras.size > 0 && [...cameras.values()].every((camera) => selectedDeviceIds.has(`camera:${camera.source_name || camera.name}`));
  const allRelays = relayIds.length > 0 && relayIds.every((id) => selectedDeviceIds.has(id));
  const allActivity = members.length > 0 && members.every((name) => activityMemberNames.has(name));
  const allCalls = members.length > 0 && members.every((name) => callMemberNames.has(name));
  const allView = relayIds.length > 0 && relayIds.every((id) => viewRelayIds.has(id));
  const allCreate = relayIds.length > 0 && relayIds.every((id) => createRelayIds.has(id));
  const allEdit = relayIds.length > 0 && relayIds.every((id) => editRelayIds.has(id));
  const deviceRows = names.map((name) => {
    const camera = cameras.get(name);
    const deviceRelays = relays.filter((item) => (item.source_name || item.name) === name);
    const displayName = camera?.name || deviceRelays[0]?.name || name;
    const relayCell = deviceRelays.map((relay) => {
      const relayId = `relay:${relay.mac}:${relay.relay_id}`;
      return `<label class="check">${checkbox("data-share-relay", selectedDeviceIds.has(relayId), relayId)} ${hasMultipleRelays ? escapeHtml(relay.door_name || `Relay ${relay.relay_id}`) : ""}</label>`;
    }).join("<br>");
    const permitsCreate = deviceRelays.length > 0 && deviceRelays.every((relay) => createRelayIds.has(`relay:${relay.mac}:${relay.relay_id}`));
    const permitsEdit = deviceRelays.length > 0 && deviceRelays.every((relay) => editRelayIds.has(`relay:${relay.mac}:${relay.relay_id}`));
    const permitsView = deviceRelays.length > 0 && deviceRelays.every((relay) => viewRelayIds.has(`relay:${relay.mac}:${relay.relay_id}`));
    const cameraId = `camera:${camera?.source_name || camera?.name}`;
    const keyPermissionCell = (attribute, enabled) => deviceRelays.length
      ? checkbox(attribute, enabled)
      : '<span class="share-empty-cell">—</span>';
    return `<tr><td>${escapeHtml(displayName)}</td><td>${camera ? checkbox("data-share-device", selectedDeviceIds.has(cameraId), cameraId) : '<span class="share-empty-cell">—</span>'}</td><td>${relayCell || '<span class="share-empty-cell">—</span>'}</td><td>${keyPermissionCell("data-view-keys", permitsView)}</td><td>${keyPermissionCell("data-create-keys", permitsCreate)}</td><td>${keyPermissionCell("data-edit-keys", permitsEdit)}</td></tr>`;
  }).join("");
  const selectAllRow = `<tr class="share-select-all-row"><td><span class="share-select-all-label">${icons.checklist}<span>Select all</span></span></td><td>${checkbox("data-all-camera", allCameras)}</td><td>${checkbox("data-all-relay", allRelays)}</td><td>${checkbox("data-all-view", allView)}</td><td>${checkbox("data-all-create", allCreate)}</td><td>${checkbox("data-all-edit", allEdit)}</td></tr>`;
  const dataRows = members.map((name) => `<tr><td>${escapeHtml(name)}</td><td>${checkbox("data-share-activity", activityMemberNames.has(name), name)}</td><td>${checkbox("data-share-calls", callMemberNames.has(name), name)}</td></tr>`).join("");
  const dataSelectAllRow = `<tr class="share-select-all-row"><td><span class="share-select-all-label">${icons.checklist}<span>Select all</span></span></td><td>${checkbox("data-all-activity", allActivity)}</td><td>${checkbox("data-all-calls", allCalls)}</td></tr>`;
  const accessExpiresAt = viewedShare?.access_expires_at;
  const earliestExpiry = (() => {
    const now = new Date();
    now.setSeconds(0, 0);
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  })();
  const formattedExpiry = accessExpiresAt ? new Date(accessExpiresAt).toLocaleString() : "Never expires";
  const createdAt = viewedShare?.created_at || (() => {
    const pairingExpiry = Date.parse(viewedShare?.expires_at || "");
    return Number.isFinite(pairingExpiry) ? new Date(pairingExpiry - 10 * 60 * 1000).toISOString() : null;
  })();
  const status = viewedShare?.revoked ? "Revoked" : viewedShare?.activated ? "Connected" : "Waiting to pair";
  const stageDescriptions = [
    "Enter a name for the remote instance and the validity duration.",
    "Choose the devices and temporary key permissions that should be made available to the remote instance.",
    "Chose which family members should appear in the Latest Activity and Call History tables of the remote instance.",
  ];
  const basics = readOnly
    ? `<section class="share-details-card"><div class="share-detail"><span class="share-detail-icon">${icons.calendar}</span><span><small>Validity</small><strong>${escapeHtml(formattedExpiry)}</strong></span></div><div class="share-detail"><span class="share-detail-icon">${icons.calendar}</span><span><small>Registered on</small><strong>${escapeHtml(createdAt ? new Date(createdAt).toLocaleString() : "—")}</strong></span></div></section>`
    : `<section class="share-details-card share-generation-details"><label class="share-detail share-name-field"><span class="share-detail-icon">${icons.idCard}</span><span><small>Remote instance name</small><input data-receiver-name maxlength="100" required placeholder="e.g. Holiday home" autofocus></span></label><div class="share-detail share-expiry-field"><span class="share-detail-icon">${icons.calendar}</span><span><small>Validity</small><label class="check"><input data-never-expire name="access-duration" type="radio" checked> Never expires</label><label class="check" data-access-expiry-row><span><input data-expiring name="access-duration" type="radio"> Set expiry date &amp; time</span><input data-access-expiry type="datetime-local" min="${earliestExpiry}" disabled hidden></label></span></div></section>`;
  const stageProgress = readOnly ? "" : '<div class="share-stage-progress" role="progressbar" aria-label="Pairing link setup progress" aria-valuemin="0" aria-valuemax="3" aria-valuenow="0"><span data-share-stage-progress></span></div>';
  const heading = readOnly
    ? `<h2>${escapeHtml(viewedShare.receiver_name)} <span class="share-status-badge ${status.toLocaleLowerCase().replaceAll(" ", "-")}"><i></i>${escapeHtml(status)}</span></h2><p>Review the access permissions granted to this Home Assistant instance.</p>`
    : `<h2>Create Pairing Link</h2>${stageProgress}<p data-share-stage-description>${stageDescriptions[0]}</p>`;
  const devicesTable = `<section class="share-permissions" data-share-stage="2"${readOnly ? "" : " hidden"}><div class="table-wrap"><table class="share-access-table share-device-access-table"><thead><tr><th></th><th colspan="2"><span class="share-table-section-heading">${icons.cameraDoor}<span>Devices</span></span></th><th colspan="3"><span class="share-table-section-heading">${icons.key}<span>Temporary keys</span></span></th></tr><tr><th>Name</th><th><span class="share-permission-label">Camera</span></th><th><span class="share-permission-label">${hasMultipleRelays ? "Relays" : "Relay"}</span></th><th><span class="share-permission-label">View</span></th><th><span class="share-permission-label">Create</span></th><th><span class="share-permission-label">Edit</span></th></tr></thead><tbody>${readOnly ? "" : selectAllRow}${deviceRows}</tbody></table></div></section>`;
  const dataTable = `<section class="share-permissions" data-share-stage="3"${readOnly ? "" : " hidden"}><div class="table-wrap share-data-table"><table class="share-access-table"><thead><tr><th></th><th colspan="2"><span class="share-table-section-heading">${icons.database}<span>Data</span></span></th></tr><tr><th>Family Members</th><th><span class="share-permission-label">Latest Activity</span></th><th><span class="share-permission-label">Call History</span></th></tr></thead><tbody>${readOnly ? "" : dataSelectAllRow}${dataRows || '<tr><td colspan="3">No family members available.</td></tr>'}</tbody></table></div></section>`;
  const createActions = `<button class="modal-cancel" data-previous type="button" hidden>Previous</button><button class="modal-action" data-next type="button">Next</button><button class="modal-action" data-confirm type="button" hidden>Create pairing link</button>`;
  dialog.innerHTML = `<button class="share-access-close" type="button" data-cancel aria-label="Close">×</button><div class="remote-instance-dialog-header">${heading}</div><div class="share-stage-content">${readOnly ? basics : `<div data-share-stage="1">${basics}</div>`}<p class="notice share-error" data-share-error hidden></p>${devicesTable}${dataTable}</div><div class="modal-actions">${readOnly ? '<button class="modal-cancel" data-cancel type="button">Close</button>' : createActions}</div>`;
  const devices = [...dialog.querySelectorAll("[data-share-device], [data-share-relay]")];
  const activity = [...dialog.querySelectorAll("[data-share-activity]")];
  const calls = [...dialog.querySelectorAll("[data-share-calls]")];
  const neverExpire = dialog.querySelector("[data-never-expire]");
  const expires = dialog.querySelector("[data-expiring]");
  const expiry = dialog.querySelector("[data-access-expiry]");
  const receiverName = dialog.querySelector("[data-receiver-name]");
  const syncSelectAll = (master, inputs) => {
    if (!master || !inputs.length) return;
    const selected = inputs.filter((item) => item.checked).length;
    master.checked = selected === inputs.length;
    master.indeterminate = selected > 0 && selected < inputs.length;
  };
  const wireSelectAll = (masterSelector, itemSelector) => {
    const master = dialog.querySelector(masterSelector);
    const inputs = [...dialog.querySelectorAll(itemSelector)];
    master?.addEventListener("change", () => {
      inputs.forEach((input) => { input.checked = master.checked; });
    });
    inputs.forEach((input) => input.addEventListener("change", () => {
      syncSelectAll(master, inputs);
    }));
  };
  wireSelectAll("[data-all-camera]", "[data-share-device]");
  wireSelectAll("[data-all-relay]", "[data-share-relay]");
  wireSelectAll("[data-all-activity]", "[data-share-activity]");
  wireSelectAll("[data-all-calls]", "[data-share-calls]");
  wireSelectAll("[data-all-view]", "[data-view-keys]");
  wireSelectAll("[data-all-create]", "[data-create-keys]");
  wireSelectAll("[data-all-edit]", "[data-edit-keys]");
  let stage = 1;
  const stages = readOnly ? [] : [...dialog.querySelectorAll("[data-share-stage]")];
  const previousButton = dialog.querySelector("[data-previous]");
  const nextButton = dialog.querySelector("[data-next]");
  const confirmButton = dialog.querySelector("[data-confirm]");
  const permissionInputs = [...dialog.querySelectorAll("[data-share-device], [data-share-relay], [data-share-activity], [data-share-calls], [data-view-keys], [data-create-keys], [data-edit-keys]")];
  const isFirstStageValid = () => {
    const name = receiverName?.value.trim() || "";
    const expiryTime = Date.parse(expiry?.value || "");
    return Boolean(name) && !existingReceiverNames.has(name.toLocaleLowerCase()) && (
      !expires?.checked || (Number.isFinite(expiryTime) && expiryTime >= Date.now())
    );
  };
  const isFirstStageReady = () => {
    const name = receiverName?.value.trim() || "";
    const expiryTime = Date.parse(expiry?.value || "");
    return Boolean(name) && (!expires?.checked || (Number.isFinite(expiryTime) && expiryTime >= Date.now()));
  };
  const updateConfirmState = () => {
    const hasSelectedPermission = permissionInputs.some((input) => input.checked);
    // Keep the step actionable once its required fields are complete. Duplicate
    // names are reported after clicking Next, where the message is visible.
    if (nextButton) nextButton.disabled = !isFirstStageReady();
    if (confirmButton) confirmButton.disabled = !isFirstStageValid() || !hasSelectedPermission;
  };
  const updateProgress = () => {
    const progress = dialog.querySelector("[data-share-stage-progress]");
    if (!progress) return;
    const progressStage = stage === 1 && !receiverName?.value.trim() ? 0 : stage;
    progress.style.width = `${(progressStage / 3) * 100}%`;
    progress.parentElement?.setAttribute("aria-valuenow", String(progressStage));
  };
  const updateStage = () => {
    stages.forEach((element) => { element.hidden = Number(element.dataset.shareStage) !== stage; });
    if (previousButton) previousButton.hidden = stage === 1;
    if (nextButton) nextButton.hidden = stage === 3;
    if (confirmButton) confirmButton.hidden = stage !== 3;
    const description = dialog.querySelector("[data-share-stage-description]");
    if (description) description.textContent = t(host, stageDescriptions[stage - 1]);
    updateProgress();
    dialog.querySelector("[data-share-error]").hidden = true;
    updateConfirmState();
  };
  dialog.addEventListener("change", updateConfirmState);
  expiry?.addEventListener("input", updateConfirmState);
  receiverName?.addEventListener("input", () => {
    updateConfirmState();
    updateProgress();
  });
  const updateExpiryState = () => {
    if (!expiry) return;
    const expirySelected = Boolean(expires?.checked);
    expiry.disabled = !expirySelected;
    expiry.hidden = !expirySelected;
    updateConfirmState();
  };
  neverExpire?.addEventListener("change", updateExpiryState);
  expires?.addEventListener("change", updateExpiryState);
  updateExpiryState();
  previousButton?.addEventListener("click", (event) => {
    // Changing stages can resize the dialog before its backdrop handler runs.
    // Keep this button click from being interpreted as an outside click.
    event.stopPropagation();
    stage = Math.max(1, stage - 1);
    updateStage();
  });
  nextButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    const error = dialog.querySelector("[data-share-error]");
    if (!isFirstStageValid()) {
      const name = receiverName?.value.trim() || "";
      error.textContent = !name
        ? "Enter a name."
        : existingReceiverNames.has(name.toLocaleLowerCase())
          ? "A paired Home Assistant already uses this receiver name."
          : "Choose a future access expiry date.";
      error.hidden = false;
      return;
    }
    stage = Math.min(3, stage + 1);
    updateStage();
  });
  if (!readOnly) updateStage();
  dialog.querySelectorAll("[data-cancel]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  dialog.querySelector("[data-confirm]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    const name = dialog.querySelector("[data-receiver-name]").value.trim();
    const error = dialog.querySelector("[data-share-error]");
    const expiryTime = Date.parse(expiry.value || "");
    if (!name || (!neverExpire.checked && (!Number.isFinite(expiryTime) || expiryTime < Date.now()))) {
      error.textContent = !name ? "Enter a name." : "Choose a future access expiry date.";
      error.hidden = false;
      return;
    }
    const hasSelectedDeviceField = [...dialog.querySelectorAll("tbody tr:not(.share-select-all-row) input[type='checkbox']")]
      .some((input) => input.checked);
    if (!hasSelectedDeviceField) {
      error.textContent = "Select at least one device option to share.";
      error.hidden = false;
      return;
    }
    if (existingReceiverNames.has(name.toLocaleLowerCase())) {
      error.textContent = "A paired Home Assistant already uses this receiver name.";
      error.hidden = false;
      return;
    }
    const relayIdsFor = (permissionSelector) => [...dialog.querySelectorAll("tbody tr")]
      .filter((row) => row.querySelector(permissionSelector)?.checked)
      .flatMap((row) => [...row.querySelectorAll("[data-share-relay]")]
        .filter((relay) => relay.checked)
        .map((relay) => relay.value));
    const createKeyRelayIds = relayIdsFor("[data-create-keys]");
    const editKeyRelayIds = relayIdsFor("[data-edit-keys]");
    const viewKeyRelayIds = relayIdsFor("[data-view-keys]");
    const activityMemberNames = activity.filter((item) => item.checked).map((item) => item.value);
    const callMemberNames = calls.filter((item) => item.checked).map((item) => item.value);
    resolve({ receiverName: name, deviceIds: devices.filter((item) => item.checked).map((item) => item.value), activityMemberNames, callMemberNames, allowCreateKeys: createKeyRelayIds.length > 0, allowEditKeys: editKeyRelayIds.length > 0, createKeyRelayIds, editKeyRelayIds, viewKeyRelayIds, accessExpiresAt: neverExpire.checked ? null : new Date(expiry.value).toISOString() });
    dialog.close();
  });
  dialog.addEventListener("close", () => {
    host._modalCount = Math.max(0, (host._modalCount || 1) - 1);
    dialog.remove();
    host._requestLoad?.();
    resolve(null);
  }, { once: true });
  host._modalCount = (host._modalCount || 0) + 1;
  closeOnBackdrop(dialog);
  host.shadowRoot.append(dialog); localizeElement(host, dialog); dialog.showModal();
});

const activityStorageLimitWarning = (settings) => {
  const limitMb = Number(settings.activity_history_max_storage_mb) || 0;
  if (limitMb <= 0) return "";
  const usedBytes = Math.max(0, Number(settings.activity_history_storage_bytes) || 0);
  return usedBytes > limitMb * 1_000_000
    ? `<p class="activity-storage-limit-warning" role="alert">Increase the storage amount or lose stored activity data and preview images</p>`
    : "";
};

const activityStorageProgress = (settings) => {
  const limitMb = Number(settings.activity_history_max_storage_mb) || 0;
  const usedBytes = Math.max(0, Number(settings.activity_history_storage_bytes) || 0);
  if (limitMb <= 0) {
    return usedBytes > 0
      ? `<span class="activity-storage-used">${escapeHtml(formatStorageAmount(usedBytes))} stored</span>`
      : "";
  }
  const percentage = (usedBytes / (limitMb * 1_000_000)) * 100;
  const percentageLabel = `${percentage.toFixed(percentage >= 10 ? 0 : 1)}%`;
  const exceedsLimit = usedBytes > limitMb * 1_000_000;
  return `<div class="activity-storage-progress${exceedsLimit ? " is-over-limit" : ""}" role="progressbar" aria-label="Local activity storage used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${escapeHtml(Math.min(100, percentage).toFixed(1))}">
    <span class="activity-storage-progress-fill" style="width:${Math.min(100, percentage)}%"></span>
    <span class="activity-storage-progress-label">${escapeHtml(formatStorageAmount(usedBytes))} / ${escapeHtml(limitMb.toFixed(2))} MB (${escapeHtml(percentageLabel)})</span>
  </div>`;
};

const sipAccountsSection = (sipAccounts = {}) => {
  const main = sipAccounts.main || {};
  const devices = Array.isArray(sipAccounts.devices) ? sipAccounts.devices : [];
  if (!main.account) {
    return `<fieldset class="settings-section sip-section"><legend>${icons.phone}<span>SIP Accounts & Extension Mapping</span></legend><p class="settings-section-description">SIP account details are not available yet. Refresh the SmartPlus account and try again.</p></fieldset>`;
  }
  return `<fieldset class="settings-section sip-section">
    <legend>${icons.phone}<span>SIP Accounts & Extension Mapping</span></legend>
    <p class="settings-section-description">Intercom credentials assigned by Akuvox Cloud for SIP telephony and door access.</p>
    <button class="action settings-inline-action sip-export" type="button" data-export-sip-accounts>${icons.idCard}<span>Export SIP accounts PDF</span></button>
    <p class="sip-warning">Security notice: These credentials allow direct two-way audio/video dialing and door access. Do not share or publish these tokens.</p>
    <div class="sip-details-grid">
      <section><h3>Core server parameters</h3><dl>
        <div><dt>SIP server</dt><dd>${escapeHtml(sipAccounts.server)}</dd></div>
        <div><dt>Transport protocol</dt><dd>${escapeHtml(sipAccounts.transport)}</dd></div>
        <div><dt>Primary account ID</dt><dd>${escapeHtml(main.account)}</dd></div>
        <div><dt>Master SIP key</dt><dd>${escapeHtml(main.password)}</dd></div>
      </dl></section>
      <section><h3>Device extensions & tokens</h3><dl>
        ${devices.map((device) => `<div><dt>${escapeHtml(device.name || device.mac || "Device")}<small>${escapeHtml(device.mac)}</small></dt><dd><span class="sip-device-extension">${escapeHtml(device.account)}</span><span class="sip-device-token">${escapeHtml(device.password || "—")}</span></dd></div>`).join("")}
      </dl></section>
    </div>
  </fieldset>`;
};

const requestSipPdfPassword = (host) => new Promise((resolve) => {
  const dialog = host.shadowRoot.ownerDocument.createElement("dialog");
  dialog.innerHTML = `<h2>Protect SIP Accounts PDF</h2>
    <p class="sip-warning">This PDF contains passwords. Do not share this information with anyone else.</p>
    <form method="dialog" data-sip-pdf-form>
      <label>Password<input required minlength="8" type="password" autocomplete="new-password" data-sip-pdf-password></label>
      <label>Confirm password<input required minlength="8" type="password" autocomplete="new-password" data-sip-pdf-confirm></label>
      <p class="form-error" data-sip-pdf-error hidden></p>
      <div class="modal-actions"><button class="modal-cancel" data-sip-pdf-cancel type="button">Cancel</button><button class="modal-action" value="export">Export PDF</button></div>
    </form>`;
  const form = dialog.querySelector("[data-sip-pdf-form]");
  const passwordInput = form.querySelector("[data-sip-pdf-password]");
  const updatePasswordHint = () => {
    passwordInput.setCustomValidity(
      passwordInput.value && passwordInput.value.length < 8
        ? t(host, "Use a password containing at least 8 characters.")
        : ""
    );
  };
  passwordInput.addEventListener("input", updatePasswordHint);
  passwordInput.addEventListener("invalid", updatePasswordHint);
  dialog.querySelector("[data-sip-pdf-cancel]").addEventListener("click", () => dialog.close("cancel"));
  form.addEventListener("submit", (event) => {
    if (event.submitter?.value !== "export") return;
    updatePasswordHint();
    const password = passwordInput.value;
    const confirmation = form.querySelector("[data-sip-pdf-confirm]").value;
    if (password.length < 8) {
      event.preventDefault();
      const error = form.querySelector("[data-sip-pdf-error]");
      error.textContent = "Use a password containing at least 8 characters.";
      error.hidden = false;
    } else if (password !== confirmation) {
      event.preventDefault();
      const error = form.querySelector("[data-sip-pdf-error]");
      error.textContent = "Passwords must match.";
      error.hidden = false;
    }
  });
  dialog.addEventListener("close", () => {
    const password = dialog.returnValue === "export"
      ? form.querySelector("[data-sip-pdf-password]").value : "";
    const confirmation = dialog.returnValue === "export"
      ? form.querySelector("[data-sip-pdf-confirm]").value : "";
    dialog.remove();
    resolve(password ? { password, confirmation } : null);
  }, { once: true });
  closeOnBackdrop(dialog);
  host.shadowRoot.append(dialog);
  localizeElement(host, dialog);
  dialog.showModal();
  passwordInput.focus();
});

/** Update the usage indicator without replacing any unsaved form values. */
export const updateActivityStorageProgress = (host, usageBytes) => {
  if (!host._settings) return;
  host._settings.activity_history_storage_bytes = Math.max(0, Number(usageBytes) || 0);
  const warning = host.shadowRoot.querySelector("[data-activity-storage-limit-warning]");
  const progress = host.shadowRoot.querySelector("[data-activity-storage-progress]");
  if (!progress) return;
  const liveLimitInput = host.shadowRoot.querySelector(
    '[name="activity_history_max_storage_mb"]'
  );
  const settings = {
    ...host._settings,
    activity_history_max_storage_mb: liveLimitInput
      ? Number(liveLimitInput.value)
      : host._settings.activity_history_max_storage_mb,
  };
  if (warning) warning.innerHTML = activityStorageLimitWarning(settings);
  progress.innerHTML = activityStorageProgress(settings);
};

/**
 * Render HTML content for the Settings tab.
 * @param {HTMLElement} host
 * @returns {string}
 */
export const renderSettingsView = (host) => {
  if (!host._settings) {
    return `
      <div class="card">
        <h2>Settings</h2>
        <p class="muted">Loading settings…</p>
      </div>
    `;
  }

  const settings = host._settings;
  const storageLimitValue = String(settings.activity_history_max_storage_mb || 0);
  return `
    <div class="card settings-page">
      <form data-settings-form>
        <div class="section-heading settings-heading">
          <div>
            <h2>Settings</h2>
            <p class="settings-intro">Manage how Akuvox SmartPlus works in Home Assistant.</p>
          </div>
          <div class="settings-actions"${host._settingsDirty && !host._settingsSaving ? "" : " hidden"}>
            <button class="settings-discard" type="button" data-discard-settings ${host._settingsDirty && !host._settingsSaving ? "" : "disabled"}>${icons.restart}<span>Discard</span></button>
            <button class="action settings-save" type="submit" ${host._settingsDirty && !host._settingsSaving ? "" : "disabled"}>${icons.check}<span>Save changes</span></button>
          </div>
        </div>
        <div class="settings-two-column">
        <fieldset class="settings-section door-events-section">
          <legend>${icons.door}<span>Door Events</span></legend>
          <p class="settings-section-description">Automations and image delivery behavior.</p>
          ${eventOptions(host)}
        </fieldset>

        <fieldset class="settings-section storage-section">
          <legend>${icons.database}<span>Storage & Data Management</span></legend>
          <p class="settings-section-description">Locally store the activity records, preview images &amp; call history beyond what is available in the SmartPlus app.</p>
          <div class="settings-row">
            <div><strong>Store activity history</strong></div>
            <label class="settings-switch" aria-label="Store activity history locally">
            <input name="store_activity_history" type="checkbox" ${settings.store_activity_history ? "checked" : ""}>
            <span></span>
            </label>
          </div>
          <div data-activity-storage-limit-controls ${settings.store_activity_history ? "" : "hidden"}>
            <div data-activity-storage-limit-warning>${activityStorageLimitWarning(settings)}</div>
            <label class="storage-limit-input"><span>Enable local storage up to</span>
              <span class="storage-limit-value"><input name="activity_history_max_storage_mb" type="number" min="0" value="${escapeHtml(storageLimitValue)}" style="--storage-limit-digits: ${Math.max(1, storageLimitValue.length)}" aria-label="Local activity storage limit in MB">
              <span class="activity-storage-limit-unit" data-activity-storage-limit-unit ${Number(storageLimitValue) >= 1 ? "" : "hidden"}>MB</span></span>
              <span class="activity-storage-limit-description" data-activity-storage-limit-description ${Number(settings.activity_history_max_storage_mb) > 0 ? "hidden" : ""}>Local activity storage limit in MB (0 = unlimited)</span>
            </label>
            <div class="storage-meter-row"><div data-activity-storage-progress>${activityStorageProgress(settings)}</div><button class="activity-storage-action activity-storage-clear" type="button" data-clear-activity-storage aria-label="Delete" title="Delete">${icons.trash}<span class="sr-only">Delete</span></button></div>
            <div class="storage-actions"><span class="activity-storage-transfer-actions"><button class="activity-storage-action activity-storage-download" type="button" data-export-activity-storage>${icons.download}<span>Export</span></button><button class="activity-storage-action activity-storage-import" type="button" data-import-activity-storage>${icons.upload}<span>Import</span></button></span><input data-import-activity-file type="file" accept=".zip,application/zip" hidden></div>
          </div>
        </fieldset>
        </div>

        ${settings.credential_mode === "remote" ? `
        <fieldset class="settings-section remote-instances-section">
          <legend>${icons.hub}<span>Remote instance</span></legend>
          <p class="settings-section-description">This Home Assistant receives credentials from another instance.</p>
          ${remoteShareConnectionSection(settings.remote_last_sync)}
        </fieldset>` : `
        <fieldset class="settings-section remote-instances-section">
          <legend>${icons.hub}<span>Share Access With Another Instance</span></legend>
          <p class="settings-section-description">Securely bridge cameras, relays, activity history, call history, events and temporary keys with other Home Assistant instances.</p>
          <button class="action settings-inline-action" type="button" data-create-credential-share>${icons.externalLink}<span>Create pairing link</span></button>
          ${pairedReceiversSection(host, settings.credential_shares)}
        </fieldset>`}

        <fieldset class="settings-section">
          <legend>${icons.webcam}<span>Camera Options</span></legend>
          <p class="settings-section-description">Set the orientation used for live streams and activity snapshots.</p>
          ${cameraOptionsTable(host)}
        </fieldset>

        ${sipAccountsSection(settings.sip_accounts)}

        <fieldset class="settings-section">
          <legend>${icons.bug}<span>Debug</span></legend>
          <div class="settings-row">
            <div><strong>Enable debug logging</strong><p>Record detailed integration activity to help troubleshoot issues.</p></div>
            <label class="settings-switch" aria-label="Enable debug logging">
              <input name="debug_logging" type="checkbox" ${settings.debug_logging ? "checked" : ""}>
              <span></span>
            </label>
          </div>
          <div class="settings-row settings-link-row">
            <div><strong>View Home Assistant logs</strong><p>Open the Home Assistant log viewer to review relevant log messages.</p></div>
            <a class="settings-native-link" href="/config/logs?search=Akuvox">Open logs${icons.externalLink}</a>
          </div>
        </fieldset>

      </form>
    </div>
  `;
};

/**
 * Handle form submission and persist updated integration settings.
 * @param {HTMLElement} host
 * @param {SubmitEvent} event
 */
export const handleSaveSettings = async (host, event) => {
  event.preventDefault();
  if (host._settingsSaving) return;

  const settingsForm = event.currentTarget;
  const form = new FormData(settingsForm);
  host._settingsSaving = true;
  settingsForm.querySelector(".settings-actions").hidden = true;
  try {
    const saved = {
      store_activity_history: form.get("store_activity_history") === "on",
      activity_history_max_storage_mb: Number(form.get("activity_history_max_storage_mb")),
      custom_camera_stream_orientations: true,
      camera_stream_orientations: Object.fromEntries(
        [...settingsForm.querySelectorAll("[data-stream-orientation]")].map((select) => [select.dataset.streamOrientation, select.value])
      ),
      custom_activity_image_orientations: true,
      activity_image_orientations: Object.fromEntries(
        [...settingsForm.querySelectorAll("[data-activity-orientation]")].map((select) => [select.dataset.activityOrientation, select.value])
      ),
      wait_for_event_image: form.get("wait_for_event_image") === "on",
      custom_event_image_wait: form.get("custom_event_image_wait") === "on",
      event_image_wait_overrides: Object.fromEntries(
        [...settingsForm.querySelectorAll("[data-event-image-wait]")].map((input) => [input.dataset.eventImageWait, input.checked])
      ),
      debug_logging: form.get("debug_logging") === "on",
    };

    const result = await host._hass.callWS({
      type: "akuvox/panel_save_settings",
      entry_id: host._activeAccount,
      ...saved,
    });

    host._settings = {
      ...host._settings,
      ...saved,
    };
    host._settingsDirty = false;
    settingsForm.dataset.settingsSignature = formSignature(settingsForm);
    settingsForm.querySelector("[type='submit']").disabled = true;
    await host._load();
    showNotice(host, "SmartPlus settings saved successfully.");
  } catch (_) {
    showNotice(
      host,
      "The SmartPlus settings could not be saved. Check that the values are valid.",
      "Could not save settings"
    );
  } finally {
    host._settingsSaving = false;
    const actions = settingsForm.querySelector(".settings-actions");
    if (actions) actions.hidden = !host._settingsDirty;
  }
};

/**
 * Attach event listeners for the Settings tab.
 * @param {HTMLElement} host
 */
export const bindSettingsEvents = (host) => {
  window.clearInterval(host._pairingExpiryTimer);
  const updatePairingExpiry = () => {
    host.shadowRoot.querySelectorAll("[data-pairing-expiry]").forEach((element) => {
      const remaining = Number(element.dataset.pairingExpiry) - Date.now();
      if (remaining <= 0) {
        window.clearInterval(host._pairingExpiryTimer);
        host._requestLoad?.({ forceRender: true });
      } else {
        element.textContent = formatPairingTimeRemaining(remaining);
      }
    });
  };
  if (host.shadowRoot.querySelector("[data-pairing-expiry]")) {
    host._pairingExpiryTimer = window.setInterval(updatePairingExpiry, 1000);
    updatePairingExpiry();
  }
  const settingsForm = host.shadowRoot.querySelector("[data-settings-form]");
  if (!settingsForm) return;

  settingsForm.addEventListener("submit", (event) => handleSaveSettings(host, event));
  settingsForm.dataset.settingsSignature = formSignature(settingsForm);
  const markSettingsDirty = () => {
    host._settingsDirty =
      formSignature(settingsForm) !== settingsForm.dataset.settingsSignature;
    const saveButton = settingsForm.querySelector("[type='submit']");
    const discardButton = settingsForm.querySelector("[data-discard-settings]");
    const actions = settingsForm.querySelector(".settings-actions");
    if (saveButton) saveButton.disabled = !host._settingsDirty || host._settingsSaving;
    if (discardButton) discardButton.disabled = !host._settingsDirty || host._settingsSaving;
    if (actions) actions.hidden = !host._settingsDirty || host._settingsSaving;
  };
  settingsForm.addEventListener("input", markSettingsDirty);
  settingsForm.addEventListener("change", markSettingsDirty);
  settingsForm.querySelector("[data-discard-settings]")?.addEventListener("click", () => {
    if (!host._settingsDirty || host._settingsSaving) return;
    host._settingsDirty = false;
    host._requestLoad?.({ forceRender: true });
  });

  const storageHistoryToggle = settingsForm.querySelector(
    '[name="store_activity_history"]'
  );
  const storageLimitControls = settingsForm.querySelector(
    "[data-activity-storage-limit-controls]"
  );
  storageHistoryToggle?.addEventListener("change", () => {
    if (storageLimitControls) storageLimitControls.hidden = !storageHistoryToggle.checked;
  });
  const eventImageToggle = settingsForm.querySelector('[name="wait_for_event_image"]');
  const eventOverrideToggle = settingsForm.querySelector('[name="custom_event_image_wait"]');
  const eventOverrideControls = settingsForm.querySelector("[data-event-image-override-controls]");
  const eventOverrides = settingsForm.querySelector("[data-event-image-overrides]");
  const syncEventImageOptions = () => {
    const enabled = eventImageToggle?.checked ?? true;
    if (eventOverrideControls) eventOverrideControls.hidden = !enabled;
    if (eventOverrides) eventOverrides.hidden = !enabled || !eventOverrideToggle?.checked;
  };
  eventImageToggle?.addEventListener("change", syncEventImageOptions);
  eventOverrideToggle?.addEventListener("change", syncEventImageOptions);

  const storageLimitInput = settingsForm.querySelector(
    '[name="activity_history_max_storage_mb"]'
  );
  const storageLimitUnit = settingsForm.querySelector(
    "[data-activity-storage-limit-unit]"
  );
  const storageLimitDescription = settingsForm.querySelector(
    "[data-activity-storage-limit-description]"
  );
  storageLimitInput?.addEventListener("input", () => {
    storageLimitInput.style.setProperty(
      "--storage-limit-digits",
      String(Math.max(1, storageLimitInput.value.length))
    );
    const isUnlimited = Number(storageLimitInput.value) < 1;
    if (storageLimitUnit) storageLimitUnit.hidden = isUnlimited;
    if (storageLimitDescription) storageLimitDescription.hidden = !isUnlimited;
    const currentSettings = {
      ...host._settings,
      activity_history_max_storage_mb: Number(storageLimitInput.value),
    };
    const warning = settingsForm.querySelector("[data-activity-storage-limit-warning]");
    const progress = settingsForm.querySelector("[data-activity-storage-progress]");
    if (warning) warning.innerHTML = activityStorageLimitWarning(currentSettings);
    if (progress) progress.innerHTML = activityStorageProgress(currentSettings);
  });

  settingsForm.querySelector("[data-export-sip-accounts]")?.addEventListener("click", async () => {
    const credentials = await requestSipPdfPassword(host);
    if (!credentials) return;
    try {
      const pdf = await callWsWithBlocker(host, {
        type: "akuvox/panel_export_sip_accounts_pdf",
        entry_id: host._activeAccount,
        password: credentials.password,
        password_confirmation: credentials.confirmation,
        language: host._hass?.locale?.language || "en",
      });
      const binary = window.atob(pdf.data);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const link = host.shadowRoot.ownerDocument.createElement("a");
      link.href = url;
      link.download = pdf.filename || "akuvox_sip_accounts.pdf";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      showNotice(host, error?.message || "Could not export SIP account details.", "Export failed");
    }
  });

  settingsForm.querySelector("[data-clear-activity-storage]")?.addEventListener("click", async () => {
    const confirmed = await confirmModal(
      host,
      "This permanently deletes all locally stored activity records and preview images for this account.",
      "Clear local activity data?",
      "Clear Data"
    );
    if (!confirmed) return;
    try {
      await callWsWithBlocker(host, {
        type: "akuvox/panel_clear_activity_storage",
        entry_id: host._activeAccount,
      });
      host._activityImages?.clear();
      host._activityImageFailures?.clear();
      await host._load();
      showNotice(host, "All locally stored activity data was cleared.", "Activity data cleared");
    } catch (error) {
      showNotice(host, error?.message || "Could not clear locally stored activity data.", "Clear failed");
    }
  });

  settingsForm.querySelector("[data-export-activity-storage]")?.addEventListener("click", async () => {
    try {
      const archive = await callWsWithBlocker(host, {
        type: "akuvox/panel_export_activity_storage",
        entry_id: host._activeAccount,
      });
      const binary = window.atob(archive.data);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
      const link = host.shadowRoot.ownerDocument.createElement("a");
      link.href = url;
      link.download = archive.filename || "akuvox_activity.zip";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      showNotice(host, error?.message || "Could not export locally stored data.", "Export failed");
    }
  });

  const importInput = settingsForm.querySelector("[data-import-activity-file]");
  settingsForm.querySelector("[data-import-activity-storage]")?.addEventListener("click", () => {
    importInput?.click();
  });
  importInput?.addEventListener("change", async () => {
    const [file] = importInput.files || [];
    if (!file) return;
    const confirmed = await confirmModal(
      host,
      "Import activity and call history from this archive? Imported records are merged with existing local data.",
      "Import local data?",
      "Import Data"
    );
    if (!confirmed) {
      importInput.value = "";
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      const result = await callWsWithBlocker(host, {
        type: "akuvox/panel_import_activity_storage",
        entry_id: host._activeAccount,
        archive: window.btoa(binary),
      });
      await host._load();
      showNotice(
        host,
        `Imported ${result.activity_imported || 0} activity record(s) and ${result.call_history_imported || 0} call-history record(s).`,
        "Data imported"
      );
    } catch (error) {
      showNotice(host, error?.message || "Could not import the selected data archive.", "Import failed");
    } finally {
      importInput.value = "";
    }
  });

  settingsForm.querySelector("[data-create-credential-share]")?.addEventListener("click", async () => {
    const access = await requestShareAccess(host);
    if (!access) return;
    const receiverName = access.receiverName;
    try {
      const response = await callWsWithBlocker(host, {
        type: "akuvox/panel_create_credential_share",
        entry_id: host._activeAccount,
        receiver_name: receiverName,
        source_url: window.location.origin,
        device_ids: access.deviceIds,
        activity_member_names: access.activityMemberNames,
        call_member_names: access.callMemberNames,
        allow_create_keys: access.allowCreateKeys,
        allow_edit_keys: access.allowEditKeys,
        create_key_relay_ids: access.createKeyRelayIds,
        edit_key_relay_ids: access.editKeyRelayIds,
        view_key_relay_ids: access.viewKeyRelayIds,
        access_expires_at: access.accessExpiresAt,
      });
      await showPairingLinkNotice(host, response.pairing_link);
      host._requestLoad?.({ forceRender: true });
    } catch (error) {
      const message = String(error?.message || "");
      const reloadRequired = message.includes("source_url")
        && message.includes("extra keys not allowed");
      showNotice(
        host,
        reloadRequired
          ? "Reload the Akuvox SmartPlus integration on this Home Assistant, then generate the pairing link again."
          : message || "Could not create a pairing link.",
        reloadRequired ? "Reload required" : "Pairing failed"
      );
    }
  });

  settingsForm.querySelectorAll("[data-revoke-credential-share]").forEach((button) => {
    button.addEventListener("click", async () => {
      const confirmed = await confirmModal(
        host,
        "This will prevent the remote Home Assistant instance from receiving new Akuvox credentials.",
        "Revoke paired Home Assistant?",
        "Revoke"
      );
      if (!confirmed) return;
      try {
        const response = await callWsWithBlocker(host, {
          type: "akuvox/panel_revoke_credential_share",
          entry_id: host._activeAccount,
          share_id: button.dataset.revokeCredentialShare,
        });
        if (response?.share?.revoked && host._settings?.credential_shares) {
          host._settings = {
            ...host._settings,
            credential_shares: host._settings.credential_shares.map((share) =>
              share.share_id === response.share.share_id ? response.share : share
            ),
          };
          host._render();
        } else {
          await host._load();
        }
      } catch (error) {
        showNotice(host, error?.message || "Could not revoke the paired Home Assistant.", "Revoke failed");
      }
    });
  });

  settingsForm.querySelectorAll("[data-view-credential-share]").forEach((button) => {
    button.addEventListener("click", () => {
      const share = host._settings?.credential_shares?.find(
        (item) => item.share_id === button.dataset.viewCredentialShare
      );
      if (share) requestShareAccess(host, share);
    });
  });

  settingsForm.querySelectorAll("[data-delete-credential-share]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await callWsWithBlocker(host, {
          type: "akuvox/panel_delete_credential_share",
          entry_id: host._activeAccount,
          share_id: button.dataset.deleteCredentialShare,
        });
        await host._load();
      } catch (error) {
        showNotice(host, error?.message || "Could not delete the revoked receiver.", "Delete failed");
      }
    });
  });

  settingsForm.querySelectorAll("[data-stream]").forEach((button) =>
    button.addEventListener("click", () =>
      host._stream(button.dataset.stream, button.dataset.mode)
    )
  );

};
