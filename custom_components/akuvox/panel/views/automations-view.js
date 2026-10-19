/**
 * Door-event notification automations for the active Akuvox account.
 */

import { confirmModal, showNotice } from "../components/dialogs.js?v=20261003-i18n-3";
import { escapeHtml } from "../utils/dom.js";
import { icons } from "../utils/icons.js";
import { t } from "../utils/i18n.js?v=20261005-automation-actions-menu";
import {
  buildDoorNotificationAutomation,
  requestDoorNotificationAutomation,
  showDoorNotificationCreated,
} from "./settings-view.js?v=20261019-skip-nonmobile-notification-options";

const captureTypesForOpened = ["Face Unlock", "Unlock on SmartPlus"];
const temporaryKeyCaptureType = "Temp Key Unlock";
const isDisabled = (value) => ["off", "false", "disabled"].includes(String(value).toLowerCase());
const AUTOMATION_ID_CACHE_PREFIX = "akuvox-panel-door-notification-automation-ids";

const automationIdCacheKey = (host) => `${AUTOMATION_ID_CACHE_PREFIX}-${host._activeAccount || "default"}`;

const cachedAutomationIds = (host) => {
  try {
    const value = JSON.parse(localStorage.getItem(automationIdCacheKey(host)) || "[]");
    return Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === "string" && id))] : [];
  } catch (_) {
    return [];
  }
};

const persistAutomationIds = (host, ids) => {
  try {
    localStorage.setItem(automationIdCacheKey(host), JSON.stringify([...new Set(ids)]));
  } catch (_) {
    // Automation discovery remains functional when persistent storage is unavailable.
  }
};

const fetchAutomationConfigs = async (host, ids) => {
  const pending = [...ids];
  const configs = [];
  const worker = async () => {
    while (pending.length) {
      const id = pending.shift();
      try {
        configs.push([id, await host._hass.callApi(
          "GET", `config/automation/config/${encodeURIComponent(id)}`
        )]);
      } catch (_) {
        // Automations managed outside automations.yaml cannot be edited by the
        // native config endpoint and are not candidates for this wizard.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, pending.length) }, worker));
  return configs;
};

const accountDoors = (host) => {
  const doors = new Map();
  const add = (item) => {
    if (item?.device_id) doors.set(item.device_id, item.name || item.door_name || "Unnamed door");
  };
  const account = host._account?.() || {};
  (account.cameras || []).forEach(add);
  (account.relays || []).forEach(add);
  return doors;
};

const readJsonArray = (template, expression) => {
  const match = String(template || "").match(expression);
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]);
    return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
  } catch (_) {
    return null;
  }
};

const notificationServices = (actions) => {
  if (!Array.isArray(actions) || !actions.length) return null;
  const services = actions.map((action) => action?.action || action?.service);
  return services.every((service) => typeof service === "string" && service.startsWith("notify."))
    ? services
    : null;
};

/** Return the wizard values when config can be faithfully represented by it. */
export const asDoorNotification = (config, doors) => {
  const triggers = config.triggers || config.trigger;
  if (!Array.isArray(triggers) || !triggers.length) return null;
  const doorIds = triggers.map((trigger) => trigger?.device_id);
  if (!triggers.every((trigger) => (
    trigger?.trigger === "device" && trigger?.domain === "akuvox" &&
    trigger?.type === "door_unlocked" && doors.has(trigger.device_id)
  ))) return null;

  const conditions = config.conditions || config.condition || [];
  if (!Array.isArray(conditions) || !conditions.length) return null;
  let captureTypes = null;
  const callerRules = [];
  for (const condition of conditions) {
    if (condition?.condition !== "template") return null;
    const template = condition.value_template;
    const captures = readJsonArray(template, /(?:capture_type|CaptureType)\s+in\s+(\[[\s\S]*?\])/);
    if (captures) {
      if (captureTypes) return null;
      captureTypes = captures;
      continue;
    }
    const callers = readJsonArray(template, /(?:initiator|Initiator)[\s\S]*?\s+(?:not\s+)?in\s+(\[[\s\S]*?\])/);
    const temporaryKeys = readJsonArray(template, /(?:temporary_key_id|TemporaryKeyId)[\s\S]*?\s+(?:not\s+)?in\s+(\[[\s\S]*?\])/);
    if (!callers && !temporaryKeys) return null;
    const operator = /(?:initiator|Initiator|temporary_key_id|TemporaryKeyId)[\s\S]*?\s+not\s+in\s+/.test(template) ? "is_not" : "is";
    callerRules.push(
      ...(callers || []).map((name) => ({ name, operator })),
      ...(temporaryKeys || []).map((keyId) => ({ type: "temporary_key", keyId, name: keyId, operator })),
    );
  }
  const includeOpened = captureTypesForOpened.every((type) => captureTypes?.includes(type));
  const includeCalls = captureTypes?.includes("Call");
  const expectedCaptureTypes = [
    ...(includeOpened ? [...captureTypesForOpened, temporaryKeyCaptureType] : []),
    ...(includeCalls ? ["Call"] : []),
  ];
  if (!captureTypes || (!includeOpened && !includeCalls) ||
      !captureTypes.every((type) => expectedCaptureTypes.includes(type)) ||
      new Set(callerRules.map((rule) => rule.operator)).size > 1) return null;

  const actions = config.actions || config.action;
  if (!Array.isArray(actions) || !actions.length) return null;
  let imageChoice = actions[0];
  let includeRelayAction = false;
  let requireActionAuthentication = false;
  if (actions.length > 1) {
    const [variables, notification, waitForAction, relayChoice] = actions;
    const actionVariables = variables?.variables;
    const actionNames = actionVariables && Object.keys(actionVariables);
    const waitTriggers = waitForAction?.wait_for_trigger;
    const relayChoices = relayChoice?.choose;
    const validRelayActions = Array.isArray(actionNames) && actionNames.length > 0 &&
      actionNames.every((name, index) => (
        name === `akuvox_relay_action_${index}` &&
        actionVariables[name] === `AKUVOX_OPEN_RELAY_${index}_{{ context.id }}`
      )) &&
      Array.isArray(waitTriggers) && waitTriggers.length === actionNames.length &&
      waitTriggers.every((trigger, index) => (
        trigger?.trigger === "event" && trigger?.event_type === "mobile_app_notification_action" &&
        trigger?.event_data?.action === `{{ akuvox_relay_action_${index} }}`
      )) &&
      waitForAction?.timeout === "00:05:00" && waitForAction?.continue_on_timeout === false &&
      Array.isArray(relayChoices) && relayChoices.length === actionNames.length &&
      relayChoices.every((choice, index) => (
        choice?.conditions?.[0]?.condition === "template" &&
        choice.conditions[0].value_template === `{{ wait.trigger.event.data.action == akuvox_relay_action_${index} }}` &&
        choice?.sequence?.length === 1 && choice.sequence[0]?.action === "button.press" &&
        typeof choice.sequence[0]?.target?.entity_id === "string"
      ));
    if (!validRelayActions || actions.length !== 4) return null;
    const notificationChoice = notification?.choose?.[0];
    if (!Array.isArray(notification?.choose) || !notification.choose.length ||
        !Array.isArray(notificationChoice?.sequence) || notificationChoice.sequence.length !== 1 ||
        !/trigger\.event\.data\.device_id/.test(notificationChoice.conditions?.[0]?.value_template || "")) return null;
    imageChoice = notificationChoice.sequence[0];
    includeRelayAction = true;
  }
  if (!Array.isArray(imageChoice?.choose) || imageChoice.choose.length !== 1) return null;
  const imageConditions = imageChoice.choose[0]?.conditions;
  const imageServices = notificationServices(imageChoice.choose[0]?.sequence);
  const services = notificationServices(imageChoice.default);
  if (!services || !imageServices || services.join("\0") !== imageServices.join("\0") ||
      !Array.isArray(imageConditions) || imageConditions.length !== 1 ||
      imageConditions[0]?.condition !== "template" ||
      !/trigger\.event\.data\.(?:pic_url|PicUrl)/.test(imageConditions[0]?.value_template || "") ||
      (config.mode !== undefined && config.mode !== "parallel") ||
      (config.max !== undefined && config.max !== 10) || !String(config.alias || "").trim()) return null;

  const representativeNotification = [
    ...(imageChoice.choose[0]?.sequence || []),
    ...(imageChoice.default || []),
  ].find((action) => String(action?.action || action?.service || "").startsWith("notify.mobile_app_"));
  const notificationData = representativeNotification?.data?.data || {};
  requireActionAuthentication = Boolean(notificationData.actions?.some(
    (action) => action?.authenticationRequired === true
  ));
  const includeImage = Boolean(imageChoice.choose[0]?.sequence?.some(
    (action) => action?.data?.data?.image
  ));

  return {
    name: String(config.alias || ""),
    doorIds,
    includeOpened,
    includeCalls,
    callerRules,
    callerOperator: callerRules[0]?.operator || "is",
    services,
    ...(includeRelayAction ? { includeRelayAction } : {}),
    ...(requireActionAuthentication ? { requireActionAuthentication } : {}),
    ...(!includeImage ? { includeImage } : {}),
    initialState: isDisabled(config.initial_state) ? false : undefined,
  };
};

const loadAutomations = async (host) => {
  try {
    const entityRegistry = await host._hass.callWS({ type: "config/entity_registry/list" });
    const entityStates = Object.values(host._hass.states || {});
    const statesByEntityId = new Map((entityStates || []).map((state) => [state.entity_id, state.state]));
    const automationEntries = (entityRegistry || [])
      .filter((entry) => String(entry.entity_id || "").startsWith("automation."))
      .filter((entry) => String(entry.unique_id || ""));
    const entityIdsByAutomationId = new Map(automationEntries.map((entry) => [
      String(entry.unique_id), String(entry.entity_id),
    ]));
    const automationIds = [...entityIdsByAutomationId.keys()];
    const savedIds = new Set(cachedAutomationIds(host));
    const cachedCandidateIds = savedIds.size
      ? automationIds.filter((id) => savedIds.has(id))
      : automationIds;
    const candidateIds = savedIds.size && !cachedCandidateIds.length
      ? automationIds
      : cachedCandidateIds;
    const configs = await fetchAutomationConfigs(host, candidateIds);
    const doors = accountDoors(host);
    host._doorNotificationAutomations = configs
      .map(([id, config]) => {
        const selection = asDoorNotification(config, doors);
        const entityId = entityIdsByAutomationId.get(id);
        if (selection && isDisabled(statesByEntityId.get(entityId))) {
          selection.initialState = false;
        }
        return { id, entityId, selection };
      })
      .filter((automation) => automation.id && automation.selection)
      .sort((left, right) => left.selection.name.localeCompare(right.selection.name));
    persistAutomationIds(host, host._doorNotificationAutomations.map((automation) => automation.id));
  } catch (error) {
    host._doorNotificationAutomations = [];
    host._doorNotificationAutomationsError = error?.message || "Home Assistant could not load automations.";
  } finally {
    host._automationDiscoveryLoading = false;
  }
};

const triggerLabels = (host, selection) => [
  ...(selection.includeCalls ? [t(host, "Doorbell call")] : []),
  ...(selection.includeOpened ? [t(host, "Door open / unlock")] : []),
];

/** Immediately reflect a saved automation while Home Assistant updates its registry. */
const upsertAutomation = (host, id, selection) => {
  const existing = Array.isArray(host._doorNotificationAutomations)
    ? host._doorNotificationAutomations.find((automation) => automation.id === id)
    : undefined;
  const automations = Array.isArray(host._doorNotificationAutomations)
    ? host._doorNotificationAutomations.filter((automation) => automation.id !== id)
    : [];
  automations.push({ id, entityId: existing?.entityId, selection });
  host._doorNotificationAutomations = automations.sort(
    (left, right) => left.selection.name.localeCompare(right.selection.name)
  );
  persistAutomationIds(host, host._doorNotificationAutomations.map((automation) => automation.id));
};

const automationCard = (host, automation, doors) => {
  const { selection } = automation;
  const isDisabled = selection.initialState === false;
  const doorNames = selection.doorIds.map((id) => doors.get(id) || "Unknown door");
  const name = selection.name || "Unnamed automation";
  const serviceCount = selection.services.length;
  return `<article class="automation-row${isDisabled ? " is-disabled" : ""}">
    <div class="automation-row-icon" aria-hidden="true">${icons.bell}</div>
    <div class="automation-row-copy">
      <div class="automation-row-title"><h3>${escapeHtml(name)}</h3><span class="automation-status${isDisabled ? " is-disabled" : ""}">${isDisabled ? "Disabled" : "Active"}</span></div>
      <p class="automation-doors">${escapeHtml(doorNames.join(", "))}</p>
      <div class="automation-metadata">
        <span><b>${t(host, "Triggers")}</b>${escapeHtml(triggerLabels(host, selection).join(" · "))}</span>
        <span><b>${t(host, "Notifications")}</b>${escapeHtml(t(host, serviceCount === 1 ? "{count} service" : "{count} services", { count: serviceCount }))}</span>
      </div>
    </div>
    <div class="automation-row-actions">
      <button type="button" class="settings-inline-action automation-menu-trigger" data-automation-menu="${escapeHtml(automation.id)}" aria-label="${escapeHtml(t(host, "Automation actions"))}" aria-haspopup="menu">⋯</button>
    </div>
  </article>`;
};

const closeAutomationActionsMenu = (host) => {
  host._automationActionsMenu?.remove();
  host._automationActionsMenu = undefined;
  host._automationActionsMenuAbort?.abort();
  host._automationActionsMenuAbort = undefined;
};

const showAutomationActionsMenu = (host, trigger, event, automation, { onEdit, onToggle, onDelete }) => {
  event.stopPropagation();
  if (host._automationActionsMenu?.dataset.automationId === automation.id) {
    closeAutomationActionsMenu(host);
    return;
  }
  closeAutomationActionsMenu(host);

  const documentRef = host.shadowRoot.ownerDocument;
  const menu = documentRef.createElement("div");
  const bounds = trigger.getBoundingClientRect();
  const disabled = automation.selection.initialState === false;
  menu.dataset.automationId = automation.id;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", t(host, "Automation actions"));
  menu.style.cssText = `position:fixed;z-index:10001;top:${bounds.bottom + 8}px;left:12px;width:max-content;min-width:190px;max-width:calc(100vw - 24px);padding:8px;border:1px solid var(--divider-color,#d1d5db);border-radius:14px;color:var(--primary-text-color,#111);background:var(--card-background-color,#fff);box-shadow:0 14px 32px #0003;direction:${host.getAttribute("dir") === "rtl" ? "rtl" : "ltr"};`;
  menu.innerHTML = `
    <button type="button" role="menuitem" data-menu-edit>${icons.edit}<span>${escapeHtml(t(host, "Edit"))}</span></button>
    <a role="menuitem" data-menu-open href="/config/automation/edit/${encodeURIComponent(automation.id)}">${icons.externalLink}<span>${escapeHtml(t(host, "Open in Home Assistant"))}</span></a>
    <button type="button" role="menuitem" data-menu-toggle><i class="automation-menu-state-switch ${disabled ? "enable" : "disable"}" aria-hidden="true"><span></span></i><span>${escapeHtml(t(host, disabled ? "Enable" : "Disable"))}</span></button>
    <button type="button" role="menuitem" data-menu-delete class="delete-action">${icons.trash}<span>${escapeHtml(t(host, "Delete"))}</span></button>
  `;
  menu.querySelectorAll("button, a").forEach((item) => {
    item.style.cssText = "display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;border:0;border-radius:9px;padding:11px 12px;color:inherit;background:transparent;font:600 14px/1.3 inherit;text-align:start;text-decoration:none;white-space:nowrap;cursor:pointer;";
    item.addEventListener("mouseenter", () => { item.style.background = item.classList.contains("delete-action") ? "#dc2626" : "#55bfe6"; if (item.classList.contains("delete-action")) item.style.color = "#fff"; });
    item.addEventListener("mouseleave", () => { item.style.background = "transparent"; if (item.classList.contains("delete-action")) item.style.color = "var(--error-color,#dc2626)"; });
  });
  menu.querySelectorAll("svg").forEach((icon) => { icon.style.cssText = "width:19px;height:19px;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:2;"; });
  menu.querySelectorAll(".automation-menu-state-switch").forEach((toggle) => {
    const enabled = toggle.classList.contains("enable");
    toggle.style.cssText = `position:relative;display:inline-flex;width:28px;height:16px;flex:0 0 28px;align-items:center;border-radius:999px;background:${enabled ? "#16803c" : "#dc2626"};`;
    toggle.firstElementChild.style.cssText = `position:absolute;width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 1px 2px #0005;transform:translateX(${enabled ? "14px" : "2px"});`;
  });
  menu.querySelector(".delete-action").style.color = "var(--error-color,#dc2626)";
  menu.querySelector("[data-menu-edit]").addEventListener("click", () => { closeAutomationActionsMenu(host); onEdit(); });
  menu.querySelector("[data-menu-toggle]").addEventListener("click", () => { closeAutomationActionsMenu(host); void onToggle(); });
  menu.querySelector("[data-menu-delete]").addEventListener("click", () => { closeAutomationActionsMenu(host); void onDelete(); });
  menu.querySelector("[data-menu-open]").addEventListener("click", () => closeAutomationActionsMenu(host));

  const abort = new AbortController();
  // Defer outside-click dismissal until the opening click has fully settled.
  // This avoids treating the trigger's originating pointer sequence as an
  // outside interaction in browsers that dispatch it late.
  window.setTimeout(() => documentRef.addEventListener("pointerdown", (outsideEvent) => {
    const path = outsideEvent.composedPath();
    if (!path.includes(menu) && !path.includes(trigger)) closeAutomationActionsMenu(host);
  }, { capture: true, signal: abort.signal }), 0);
  documentRef.addEventListener("keydown", (keyEvent) => { if (keyEvent.key === "Escape") closeAutomationActionsMenu(host); }, { signal: abort.signal });
  host._automationActionsMenu = menu;
  host._automationActionsMenuAbort = abort;
  documentRef.body.append(menu);
  const menuWidth = menu.getBoundingClientRect().width;
  menu.style.left = `${Math.max(12, Math.min(bounds.right - menuWidth, window.innerWidth - menuWidth - 12))}px`;
};

export const renderAutomationsView = (host) => {
  const automations = host._doorNotificationAutomations;
  if (automations === null) {
    return `<div class="card"><h2>Automations</h2><p class="muted">Loading automations…</p></div>`;
  }
  const doors = accountDoors(host);
  const activeCount = automations.filter((automation) => automation.selection.initialState !== false).length;
  const disabledCount = automations.length - activeCount;
  return `<div class="card automations-page">
    <div class="automations-heading">
      <div class="automations-heading-copy">
        <div class="automations-heading-primary">
          <div><h2>${t(host, "Automations")}</h2></div>
          <button class="action" type="button" data-create-door-notification>${icons.plus}<span>Create automation</span></button>
        </div>
        <span class="automations-heading-description">${t(host, "Create and manage notification automations for doors in this Akuvox account.")}</span>
        <p>${escapeHtml(t(host, "{active} active · {disabled} disabled · {total} total", { active: activeCount, disabled: disabledCount, total: automations.length }))}</p>
      </div>
    </div>
    ${host._doorNotificationAutomationsError ? `<p class="form-error">${escapeHtml(host._doorNotificationAutomationsError)}</p>` : ""}
    <div class="automation-list">
      ${automations.map((automation) => automationCard(host, automation, doors)).join("") || (host._automationDiscoveryLoading
        ? `<p class="muted">${escapeHtml(t(host, "Loading automations…"))}</p>`
        : `<section class="automation-empty">
        <div class="automation-empty-icon" aria-hidden="true">${icons.automation}</div>
        <h3>No automations yet</h3>
        <p>Start with a notification for doorbell calls, door opens, or unlocks.</p>
      </section>`)}
    </div>
  </div>`;
};

export const bindAutomationsEvents = (host) => {
  const refresh = async () => {
    host._doorNotificationAutomationsError = "";
    host._doorNotificationAutomations ??= [];
    host._automationDiscoveryLoading = true;
    host._render();
    await loadAutomations(host);
    host._render();
  };
  if (host._doorNotificationAutomations === null) {
    void refresh();
    return;
  }
  const editAutomation = async (automation) => {
    const selection = await requestDoorNotificationAutomation(host, automation.selection);
    if (!selection) return;
    try {
      await host._hass.callApi("POST", `config/automation/config/${encodeURIComponent(automation.id)}`,
        buildDoorNotificationAutomation({ ...selection, localize: (source, values) => t(host, source, values) }));
      upsertAutomation(host, automation.id, selection);
      host._render();
      showDoorNotificationCreated(host, automation.id, true);
    } catch (error) {
      showNotice(host, error?.message || "Could not update the notification automation.", "Automation update failed");
    }
  };
  const toggleAutomation = async (automation) => {
    const disabled = automation.selection.initialState === false;
    try {
      await host._hass.callService("automation", disabled ? "turn_on" : "turn_off", {
        entity_id: automation.entityId,
      });
      automation.selection.initialState = disabled ? undefined : false;
      host._render();
    } catch (error) {
      showNotice(host, error?.message || "Could not update automation state.", "Automation update failed");
    }
  };
  const deleteAutomation = async (automation) => {
    if (!await confirmModal(
      host,
      "",
      t(host, "Delete {name} from Home Assistant?", { name: `“${automation.selection.name || t(host, "this automation")}”` }),
      "Delete"
    )) return;
    try {
      await host._hass.callApi("DELETE", `config/automation/config/${encodeURIComponent(automation.id)}`);
      persistAutomationIds(host, host._doorNotificationAutomations
        .filter((item) => item.id !== automation.id)
        .map((item) => item.id));
      await refresh();
      showNotice(host, "", "Automation Deleted");
    } catch (error) {
      showNotice(host, error?.message || "Could not delete the notification automation.", "Automation deletion failed");
    }
  };
  host.shadowRoot.querySelectorAll("[data-create-door-notification]").forEach((button) => button.addEventListener("click", async () => {
    const selection = await requestDoorNotificationAutomation(host);
    if (!selection) return;
    const automationId = String(Date.now());
    try {
      await host._hass.callApi("POST", `config/automation/config/${encodeURIComponent(automationId)}`,
        buildDoorNotificationAutomation({ ...selection, localize: (source, values) => t(host, source, values) }));
      upsertAutomation(host, automationId, selection);
      host._render();
      showDoorNotificationCreated(host, automationId);
    } catch (error) {
      showNotice(host, error?.message || "Could not create the notification automation.", "Automation creation failed");
    }
  }));
  host.shadowRoot.querySelectorAll("[data-edit-automation]").forEach((button) => button.addEventListener("click", async () => {
    const automation = host._doorNotificationAutomations.find((item) => item.id === button.dataset.editAutomation);
    if (!automation) return;
    await editAutomation(automation);
  }));
  host.shadowRoot.querySelectorAll("[data-delete-automation]").forEach((button) => button.addEventListener("click", async () => {
    const automation = host._doorNotificationAutomations.find((item) => item.id === button.dataset.deleteAutomation);
    if (automation) await deleteAutomation(automation);
  }));
  host.shadowRoot.querySelectorAll("[data-automation-menu]").forEach((button) => button.addEventListener("click", (event) => {
    const automation = host._doorNotificationAutomations.find((item) => item.id === button.dataset.automationMenu);
    if (!automation) return;
    showAutomationActionsMenu(host, button, event, automation, {
      onEdit: () => editAutomation(automation),
      onToggle: () => toggleAutomation(automation),
      onDelete: () => deleteAutomation(automation),
    });
  }));
};
