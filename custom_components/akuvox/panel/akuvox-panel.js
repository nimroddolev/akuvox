/**
 * Akuvox SmartPlus local sidebar panel for Home Assistant.
 * Entry point web component coordinating state, views, and WebSocket subscriptions.
 * Module version is cache-busted by this entry file's modification time (sip-pdf-password-confirmation-20260821).
 */

import { PANEL_TAG, TAB_HASHES, TAB_HASH_BY_ID, TABS } from "./utils/constants.js";
import { escapeHtml } from "./utils/dom.js";
import { copyText } from "./utils/clipboard.js";
import { getPanelStyles } from "./styles/index.js?v=20260830-mobile-topbar-breakpoint";
import { showNotice, confirmModal, callWsWithBlocker } from "./components/dialogs.js";
import { installCameraRelayActions } from "./components/camera-actions.js?v=20260830-camera-modal-unlock";
import { closeKeyActionsMenu } from "./components/key-menu.js";

import { renderDevicesView, bindDevicesEvents } from "./views/devices-view.js?v=20260830-device-action-gradients";
import { renderActivityView, bindActivityEvents } from "./views/activity-view.js?v=20260829-updated-status-red";
import { renderCallsView, bindCallsEvents } from "./views/calls-view.js?v=20260827-multi-table-filters-outside-click";
import {
  renderKeysView,
  bindKeysEvents,
  deleteSelectedKeys,
} from "./views/keys-view.js?v=20260827-multi-table-filters-outside-click";
import { renderSettingsView, bindSettingsEvents, updateActivityStorageProgress } from "./views/settings-view.js?v=20260830-debug-section";
import { renderHelpView } from "./views/help-view.js";

class AkuvoxSmartPlusPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this._accounts = [];
    this._activeAccount = "";
    this._activeTab = "overview";
    this._settings = null;
    this._settingsEntryId = "";
    this._settingsDirty = false;
    this._settingsSaving = false;
    this._blockingRequest = false;
    this._modalCount = 0;
    this._loading = false;
    this._loadQueued = false;
    this._panelDataSignature = null;
    this._settingsSignature = null;

    this._activityFilters = { Location: [], CaptureType: [], Initiator: [] };
    this._activitySort = { key: "CaptureTime", direction: "desc" };
    this._activityVisibleCount = 20;
    this._activityPaginationObserver = null;
    this._activityImages = new Map();
    this._activityImageFailures = new Map();

    this._callFilters = { callerName: [], calleeName: [], status: [] };
    this._callSort = { key: "startTime", direction: "desc" };

    this._keyFilters = { description: "", status: [] };
    this._keySort = { key: "description", direction: "asc" };
    this._selectingKeys = false;
    this._selectedKeyIds = new Set();
    this._copiedKeyCodes = new Map();
    this._openFilterMenu = "";

    this._panelDataSubscriptionActive = false;
    this._tabResizeObserver = null;
    this._onTabWindowResize = () => this._updateTabScrollControls();

    this._onHashChange = () => {
      const tab = TAB_HASHES[decodeURIComponent(window.location.hash.slice(1))];
      if (tab && tab !== this._activeTab) {
        this._activeTab = tab;
        this._render();
      }
    };

    // Keep essential navigation and temporary-key actions available even if a
    // view-specific binding fails during a later render. Capture these events
    // so the regular per-view handlers do not run a second time.
    this.shadowRoot.addEventListener("click", (event) => {
      const button = event.target.closest?.("button");
      if (!button) return;

      if (button.matches("[data-tab]")) {
        event.stopPropagation();
        const hash = TAB_HASH_BY_ID[button.dataset.tab];
        if (hash) window.location.hash = hash;
        return;
      }

      if (button.matches("[data-toggle-key-selection]")) {
        event.stopPropagation();
        this._selectingKeys = !this._selectingKeys;
        this._selectedKeyIds.clear();
        this._render();
        return;
      }

      if (button.matches("[data-delete-selected]")) {
        event.stopPropagation();
        void deleteSelectedKeys(this);
      }
    }, { capture: true });

    this.shadowRoot.addEventListener("change", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.matches("[data-select-key]")) return;
      event.stopPropagation();
      if (input.checked) this._selectedKeyIds.add(input.dataset.selectKey);
      else this._selectedKeyIds.delete(input.dataset.selectKey);
      this._render();
    }, { capture: true });
  }

  set hass(value) {
    this._hass = value;
    if (!this._hashListenerRegistered) {
      window.addEventListener("hashchange", this._onHashChange);
      this._hashListenerRegistered = true;
    }
    this._onHashChange();
    this._subscribeToPanelDataUpdates();
    if (!this._tabResizeListenerRegistered) {
      window.addEventListener("resize", this._onTabWindowResize);
      this._tabResizeListenerRegistered = true;
    }
    this._requestLoad({ forceRender: true });
    if (!this._timer) {
      this._timer = window.setInterval(() => this._requestLoad(), 15000);
    }
  }

  disconnectedCallback() {
    window.clearInterval(this._timer);
    closeKeyActionsMenu(this);
    this._timer = undefined;
    this._multiFilterOutsideAbort?.abort();
    this._copiedKeyCodes.forEach((timeout) => window.clearTimeout(timeout));
    this._copiedKeyCodes.clear();
    this._panelDataSubscriptionActive = false;
    this._unsubscribePanelDataUpdates?.();
    this._unsubscribePanelDataUpdates = undefined;
    this._tabResizeObserver?.disconnect();
    this._activityPaginationObserver?.disconnect();
    window.clearInterval(this._activityUpdatedTimer);
    this._activityUpdatedTimer = undefined;
    this._tabResizeObserver = null;
    if (this._tabResizeListenerRegistered) {
      window.removeEventListener("resize", this._onTabWindowResize);
      this._tabResizeListenerRegistered = false;
    }
    if (this._hashListenerRegistered) {
      window.removeEventListener("hashchange", this._onHashChange);
    }
    this._hashListenerRegistered = false;
  }

  async _subscribeToPanelDataUpdates() {
    if (this._panelDataSubscriptionActive || !this._hass?.connection) return;
    this._panelDataSubscriptionActive = true;
    try {
      const unsubscribe = await this._hass.connection.subscribeEvents(
        (event) => {
          const update = event?.data || {};
          if (
            update.entry_id === this._activeAccount &&
            Object.hasOwn(update, "activity_storage_usage_bytes")
          ) {
            updateActivityStorageProgress(this, update.activity_storage_usage_bytes);
          }
          if (this._activeTab === "settings") this._settingsEntryId = "";
          this._requestLoad();
        },
        "akuvox_panel_data_updated"
      );
      if (this._panelDataSubscriptionActive) {
        this._unsubscribePanelDataUpdates = unsubscribe;
      } else {
        unsubscribe();
      }
    } catch (_) {
      this._panelDataSubscriptionActive = false;
    }
  }

  _requestLoad({ forceRender = false } = {}) {
    if (this._loading) {
      this._loadQueued = true;
      this._loadQueuedForceRender = this._loadQueuedForceRender || forceRender;
      return;
    }
    void this._load({ forceRender });
  }

  _shouldDeferRender() {
    return (
      (this._settingsDirty && this._activeTab === "settings") ||
      this._settingsSaving ||
      this._blockingRequest ||
      this._keyDialogOpen ||
      this._modalCount > 0
    );
  }

  async _load({ forceRender = true } = {}) {
    if (!this._hass) return;
    if (this._loading) {
      this._loadQueued = true;
      return;
    }
    this._loading = true;
    try {
      do {
        this._loadQueued = false;
        const result = await this._hass.callWS({ type: "akuvox/panel_data" });
        const panelDataSignature = JSON.stringify(result.accounts || []);
        const panelDataChanged = panelDataSignature !== this._panelDataSignature;
        this._panelDataSignature = panelDataSignature;
        const previousActiveAccount = this._activeAccount;
        this._accounts = result.accounts || [];
        const hadError = Boolean(this._error);
        this._error = undefined;
        if (!this._accounts.some((account) => account.entry_id === this._activeAccount)) {
          this._activeAccount = this._accounts[0]?.entry_id || "";
          this._settingsDirty = false;
        }
        const activeAccountChanged = previousActiveAccount !== this._activeAccount;
        let settingsChanged = false;
        const shouldRefreshSettings =
          this._activeAccount &&
          (this._settingsEntryId !== this._activeAccount ||
            (this._activeTab === "settings" &&
              !this._settingsDirty &&
              !this._settingsSaving));
        if (shouldRefreshSettings) {
          settingsChanged = await this._loadSettings();
        }
        if (
          !this._shouldDeferRender() &&
          // Door-log updates change panel data frequently, but do not affect
          // the Settings markup. Avoid rebuilding that form and closing a
          // native select while the user is choosing an option.
          (forceRender ||
            (panelDataChanged && this._activeTab !== "settings") ||
            activeAccountChanged ||
            settingsChanged ||
            hadError)
        ) {
          this._render();
        }
        forceRender = this._loadQueuedForceRender || false;
        this._loadQueuedForceRender = false;
      } while (this._loadQueued);
    } catch (error) {
      const errorChanged = this._error !== "Unable to load SmartPlus data.";
      this._error = "Unable to load SmartPlus data.";
      if (!this._shouldDeferRender() && (forceRender || errorChanged)) this._render();
    } finally {
      this._loading = false;
      if (this._loadQueued) {
        const queuedForceRender = this._loadQueuedForceRender || false;
        this._loadQueuedForceRender = false;
        this._requestLoad({ forceRender: queuedForceRender });
      }
    }
  }

  _account() {
    return this._accounts.find((account) => account.entry_id === this._activeAccount);
  }

  _updateTabScrollControls() {
    const viewport = this.shadowRoot.querySelector("[data-tab-scroll-viewport]");
    if (!viewport) return;

    const left = this.shadowRoot.querySelector('[data-tab-scroll="left"]');
    const right = this.shadowRoot.querySelector('[data-tab-scroll="right"]');
    if (!left || !right) return;

    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const showLeft = viewport.scrollLeft > 1;
    const showRight = viewport.scrollLeft < maxScroll - 1;
    const changed = left.hidden === showLeft || right.hidden === showRight;
    left.hidden = !showLeft;
    right.hidden = !showRight;
    if (changed) requestAnimationFrame(() => this._updateTabScrollControls());
  }

  _setupTabScrolling() {
    this._tabResizeObserver?.disconnect();
    const viewport = this.shadowRoot.querySelector("[data-tab-scroll-viewport]");
    if (!viewport) return;

    viewport.addEventListener("scroll", () => this._updateTabScrollControls(), {
      passive: true,
    });
    this.shadowRoot.querySelectorAll("[data-tab-scroll]").forEach((button) =>
      button.addEventListener("click", () => {
        const direction = button.dataset.tabScroll === "left" ? -1 : 1;
        viewport.scrollBy({ left: direction * Math.max(160, viewport.clientWidth * 0.75), behavior: "smooth" });
      })
    );
    if (typeof ResizeObserver !== "undefined") {
      this._tabResizeObserver = new ResizeObserver(() => this._updateTabScrollControls());
      this._tabResizeObserver.observe(viewport);
    }
    const selectedTab = viewport.querySelector(".tab.selected");
    if (selectedTab) {
      const tabStart = selectedTab.offsetLeft;
      const tabEnd = tabStart + selectedTab.offsetWidth;
      if (tabStart < viewport.scrollLeft) viewport.scrollLeft = tabStart;
      else if (tabEnd > viewport.scrollLeft + viewport.clientWidth) {
        viewport.scrollLeft = tabEnd - viewport.clientWidth;
      }
    }
    requestAnimationFrame(() => this._updateTabScrollControls());
  }

  async _loadSettings() {
    const entryId = this._activeAccount;
    try {
      const result = await this._hass.callWS({
        type: "akuvox/panel_settings",
        entry_id: entryId,
      });
      if (entryId !== this._activeAccount) return;
      this._settings = result.settings;
      this._settingsEntryId = entryId;
      // Storage usage changes independently of saved options, so it must not
      // rebuild the Settings form while a native select is open.
      const { activity_history_storage_bytes: _usageBytes, ...savedSettings } = this._settings;
      const settingsSignature = JSON.stringify(savedSettings);
      const changed = settingsSignature !== this._settingsSignature;
      this._settingsSignature = settingsSignature;
      return changed;
    } catch (_) {
      const errorChanged = this._error !== "Unable to load SmartPlus settings.";
      this._error = "Unable to load SmartPlus settings.";
      return errorChanged;
    }
  }

  _captureScrollPosition() {
    const positions = [];
    const seen = new Set();
    let node = this;
    while (node) {
      if (
        node instanceof HTMLElement &&
        !seen.has(node) &&
        (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth)
      ) {
        positions.push({ node, top: node.scrollTop, left: node.scrollLeft });
        seen.add(node);
      }
      if (node.parentElement) {
        node = node.parentElement;
      } else {
        const root = node.getRootNode?.();
        node = root instanceof ShadowRoot ? root.host : null;
      }
    }
    return {
      positions,
      windowLeft: window.scrollX,
      windowTop: window.scrollY,
      activeTab: this._activeTab,
      tabScrollLeft: this.shadowRoot.querySelector("[data-tab-scroll-viewport]")?.scrollLeft,
    };
  }

  _restoreScrollPosition(position) {
    const restore = () => {
      position.positions.forEach(({ node, top, left }) => node.scrollTo(left, top));
      window.scrollTo(position.windowLeft, position.windowTop);
      const viewport = this.shadowRoot.querySelector("[data-tab-scroll-viewport]");
      if (
        viewport &&
        position.activeTab === this._activeTab &&
        position.tabScrollLeft !== undefined
      ) {
        viewport.scrollLeft = position.tabScrollLeft;
      }
      this._updateTabScrollControls();
    };
    requestAnimationFrame(restore);
  }

  _activityImageKey(captureTime) {
    return `${this._activeAccount}|${captureTime}`;
  }

  async _getActivityImage(captureTime) {
    const key = this._activityImageKey(captureTime);
    const cached = this._activityImages.get(key);
    if (cached !== undefined) return cached;

    const pending = this._hass
      .callWS({
        type: "akuvox/panel_activity_image",
        entry_id: this._activeAccount,
        capture_time: captureTime,
      })
      .then((image) => {
        this._activityImages.set(key, image);
        this._activityImageFailures.delete(key);
        return image;
      })
      .catch(() => {
        this._activityImages.delete(key);
        this._activityImageFailures.set(key, Date.now());
        return null;
      })
      .finally(() => {
        if (this._activeTab === "activity" && !this._shouldDeferRender()) {
          this._render();
        }
      });

    this._activityImages.set(key, pending);
    return pending;
  }

  async _loadActivityThumbnails() {
    const account = this._account();
    const now = Date.now();
    const retryDelay = 30000;
    const missing = (account?.activity || []).filter((item) => {
      if (!item.has_image || this._activityImages.has(this._activityImageKey(item.CaptureTime))) {
        return false;
      }
      const failedAt = this._activityImageFailures.get(this._activityImageKey(item.CaptureTime));
      return !failedAt || now - failedAt >= retryDelay;
    });

    if (!missing.length) return;

    let next = 0;
    const worker = async () => {
      while (next < missing.length) {
        const item = missing[next++];
        await this._getActivityImage(item.CaptureTime);
        if (next < missing.length) {
          await new Promise((resolve) => window.setTimeout(resolve, 100));
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(2, missing.length) }, worker));
    if (this._activeTab === "activity" && !this._shouldDeferRender()) {
      this._render();
    }
  }

  async _stream(cameraName, mode) {
    if (mode === "open") {
      this._openCamera(cameraName);
      return;
    }
    if (
      !(await confirmModal(
        this,
        "This copies a credential-bearing RTSP link. Continue?",
        "Copy RTSP link",
        "Copy link"
      ))
    ) {
      return;
    }
    try {
      const result = await callWsWithBlocker(this, {
        type: "akuvox/panel_stream",
        entry_id: this._activeAccount,
        camera_name: cameraName,
        confirmed: true,
      });
      if (await copyText(result.stream_url)) {
        showNotice(this, "RTSP link copied.");
      } else {
        window.prompt("Copy the RTSP link:", result.stream_url);
      }
    } catch (_) {
      showNotice(this, "The stream link could not be retrieved.", "Could not retrieve stream");
    }
  }

  _openCamera(cameraName) {
    const entityId = Object.entries(this._hass.states).find(
      ([id, state]) => id.startsWith("camera.") && state.attributes.friendly_name === cameraName
    )?.[0];

    if (!entityId) {
      showNotice(this, "The Home Assistant camera entity was not found.", "Camera unavailable");
      return;
    }

    const relays = (this._account()?.relays || []).filter((relay) => relay.name === cameraName);
    const settings = this._settings || {};
    const orientation = settings.custom_camera_stream_orientations
      ? settings.camera_stream_orientations?.[cameraName] || "none"
      : "none";
    this.dispatchEvent(
      new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true })
    );

    if (relays.length) {
      installCameraRelayActions(this, relays, orientation);
    } else if (orientation !== "none") {
      installCameraRelayActions(this, [], orientation);
    }
  }

  async _relay(mac, relayId) {
    if (
      !(await confirmModal(
        this,
        "Open this door relay now?",
        "Open door",
        "Open door"
      ))
    ) {
      return;
    }

    try {
      await callWsWithBlocker(this, {
        type: "akuvox/panel_open_relay",
        entry_id: this._activeAccount,
        mac,
        relay_id: relayId,
        confirmed: true,
      });
    } catch (_) {
      showNotice(this, "The relay could not be opened.", "Could not open door");
    }
  }

  _content(account) {
    if (this._activeTab === "help") return renderHelpView();

    if (!account) {
      return `
        <div class="card auth-notice">
          <p>No active Akuvox account is available.</p>
          <a class="action" href="/config/integrations/dashboard/add?domain=akuvox">Add Akuvox account</a>
        </div>
      `;
    }

    if (account.requires_reauthentication) {
      return `
        <div class="card auth-notice">
          <h2>Re-authentication required</h2>
          <p>SmartPlus no longer accepts this account’s session. Re-authenticate the integration to restore access to your cameras, doors, and temporary keys.</p>
          <a class="action" href="/config/integrations/integration/akuvox">Re-authenticate Akuvox SmartPlus</a>
        </div>
      `;
    }

    if (this._activeTab === "activity") return renderActivityView(this, account);
    if (this._activeTab === "calls") return renderCallsView(this, account);
    if (this._activeTab === "keys") return renderKeysView(this, account);
    if (this._activeTab === "settings") return renderSettingsView(this);
    return renderDevicesView(account);
  }

  _render() {
    // A panel-data refresh can complete between opening a dialog and the next
    // paint. Replacing the shadow DOM at that point removes the dialog and
    // leaves the initiating action looking as though it did nothing. Defer the
    // refresh until the dialog or blocking operation has finished instead.
    if (this._modalCount > 0 || this._blockingRequest) {
      this._loadQueued = true;
      return;
    }

    const scrollPosition = this._captureScrollPosition();
    window.clearInterval(this._activityUpdatedTimer);
    this._activityUpdatedTimer = undefined;
    this._tabResizeObserver?.disconnect();

    const account = this._account();
    const requiresReauthentication = Boolean(account?.requires_reauthentication);
    const availableTabs = requiresReauthentication
      ? TABS.filter(([id]) => id === "help")
      : TABS;
    const tabsMarkup = availableTabs.map(
      ([id, label]) =>
        `<button class="tab ${this._activeTab === id ? "selected" : ""}" data-tab="${id}">${label}</button>`
    ).join("");

    this.shadowRoot.innerHTML = `
      ${getPanelStyles()}
      <main class="${requiresReauthentication ? "reauthentication-required" : ""}">
        <header>
          <button class="mobile-menu-toggle" type="button" data-mobile-menu aria-label="Open Home Assistant menu">
            <span></span><span></span><span></span>
          </button>
          <div class="logo-text-container">
            <div class="logo-text">
              <div class="logo-title-row">
                <img class="brand-mark" src="/api/akuvox_panel/akuvox.svg" alt="Akuvox SmartPlus">
                <h1>Akuvox SmartPlus</h1>
              </div>
              <p>Access your SmartPlus account from Home Assistant</p>
            </div>
          </div>
          ${
            this._accounts.length
              ? `<select aria-label="Akuvox account" data-account>
                  ${this._accounts
                    .map(
                      (item) =>
                        `<option value="${escapeHtml(item.entry_id)}" ${item.entry_id === this._activeAccount ? "selected" : ""}>
                          ${escapeHtml(item.title || item.project_name || "SmartPlus account")}
                        </option>`
                    )
                    .join("")}
                </select>`
              : ""
          }
        </header>
        ${
          `<div class="tab-navigation">
                <button class="tab-scroll-arrow" type="button" data-tab-scroll="left" aria-label="Show previous tabs" hidden>‹</button>
                <div class="tab-scroll-viewport" data-tab-scroll-viewport>
                  <nav>${tabsMarkup}</nav>
                </div>
                <button class="tab-scroll-arrow" type="button" data-tab-scroll="right" aria-label="Show more tabs" hidden>›</button>
              </div>`
        }
        <section class="${requiresReauthentication ? "auth-required-content" : ""}">
          ${this._error && this._activeTab !== "help" ? `<p class="notice">${this._error}</p>` : this._content(account)}
        </section>
      </main>
    `;

    // Tab navigation event listeners
    this.shadowRoot.querySelectorAll("[data-tab]").forEach((button) =>
      button.addEventListener("click", () => {
        const hash = TAB_HASH_BY_ID[button.dataset.tab];
        if (hash) window.location.hash = hash;
      })
    );

    this.shadowRoot.querySelector("[data-mobile-menu]")?.addEventListener("click", () => {
      this.dispatchEvent(
        new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true })
      );
    });
    this._setupTabScrolling();

    // Account selector event listener
    this.shadowRoot.querySelector("[data-account]")?.addEventListener("change", async (event) => {
      this._activeAccount = event.target.value;
      this._settings = null;
      this._settingsEntryId = "";
      this._settingsSignature = null;
      this._settingsDirty = false;
      this._selectingKeys = false;
      this._selectedKeyIds.clear();
      await this._loadSettings();
      this._render();
    });

    // Tab-specific event bindings
    if (this._activeTab === "overview") {
      bindDevicesEvents(this);
    } else if (this._activeTab === "activity") {
      bindActivityEvents(this);
      void this._loadActivityThumbnails();
    } else if (this._activeTab === "calls") {
      bindCallsEvents(this);
    } else if (this._activeTab === "keys") {
      bindKeysEvents(this);
    } else if (this._activeTab === "settings") {
      bindSettingsEvents(this);
    }

    this._restoreScrollPosition(scrollPosition);
  }
}

if (!customElements.get(PANEL_TAG)) {
  customElements.define(PANEL_TAG, AkuvoxSmartPlusPanel);
}
