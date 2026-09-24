/**
 * Akuvox SmartPlus local sidebar panel for Home Assistant.
 * Entry point web component coordinating state, views, and WebSocket subscriptions.
 * Module version is cache-busted by this entry file's modification time (sip-pdf-password-confirmation-20260821).
 */

import { PANEL_TAG, TAB_HASHES, TAB_HASH_BY_ID, TABS } from "./utils/constants.js";
import { escapeHtml } from "./utils/dom.js";
import { copyText } from "./utils/clipboard.js";
import { settingsRenderSignature } from "./utils/settings-signature.js";
import { getPanelStyles } from "./styles/index.js?v=20260923-pairing-link-copy-single-row";
import { showNotice, confirmModal, callWsWithBlocker } from "./components/dialogs.js";
import { installCameraRelayActions } from "./components/camera-actions.js?v=20260830-camera-modal-unlock";
import { closeKeyActionsMenu } from "./components/key-menu.js";

import { renderDevicesView, bindDevicesEvents } from "./views/devices-view.js?v=20260917-list-drop-position";
import {
  renderActivityView,
  bindActivityEvents,
  visibleActivityEvents,
} from "./views/activity-view.js?v=20260917-ha-device-names";
import { renderCallsView, bindCallsEvents } from "./views/calls-view.js?v=20260922-call-status-badges";
import {
  renderKeysView,
  bindKeysEvents,
  deleteSelectedKeys,
} from "./views/keys-view.js?v=20260922-scoped-edit-permission";
import { renderSettingsView, bindSettingsEvents, updateActivityStorageProgress, updateRemoteShareConnectionStatus } from "./views/settings-view.js?v=20260924-live-pairing-url";
import { renderHelpView } from "./views/help-view.js";

const ROW_VIEW_MODE_STORAGE_KEY = "akuvox-panel-row-view-mode";
const TILE_ORDER_STORAGE_PREFIX = "akuvox-panel-tile-order";

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
    this._renderDeferredForNativeSelect = false;

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
    this._keyTileSortMode = null;
    // A presentation preference shared by the Devices and Temporary keys tabs.
    // Local storage is best-effort because it can be unavailable in restricted
    // browser contexts.
    try {
      this._rowViewMode = localStorage.getItem(ROW_VIEW_MODE_STORAGE_KEY) === "tiles"
        ? "tiles"
        : "table";
    } catch (_) {
      this._rowViewMode = "table";
    }
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

      if (button.matches("[data-refresh-shared-credentials]")) {
        event.stopPropagation();
        this._refreshSharedCredentials();
        return;
      }

      if (button.matches("[data-apply-remote-share-link]")) {
        event.stopPropagation();
        this._applyRemoteShareLink();
        return;
      }

      if (button.matches("[data-toggle-key-selection]")) {
        event.stopPropagation();
        this._selectingKeys = !this._selectingKeys;
        this._selectedKeyIds.clear();
        this._render();
        return;
      }

      if (button.matches("[data-row-view-mode]")) {
        event.stopPropagation();
        this._rowViewMode = button.dataset.rowViewMode === "tiles" ? "tiles" : "table";
        try {
          localStorage.setItem(ROW_VIEW_MODE_STORAGE_KEY, this._rowViewMode);
        } catch (_) {
          // The selected layout remains available for this panel instance.
        }
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

    // Native select menus are owned by the browser and are dismissed when the
    // underlying element is replaced. Panel updates can arrive while one is
    // open, so wait until focus leaves it before applying a deferred redraw.
    this.shadowRoot.addEventListener("focusout", (event) => {
      if (!(event.target instanceof HTMLSelectElement)) return;
      window.clearTimeout(this._selectFocusReleaseTimer);
      this._selectFocusReleaseTimer = window.setTimeout(() => {
        this._selectFocusReleaseTimer = undefined;
        if (!this._renderDeferredForNativeSelect || this._hasFocusedNativeSelect()) return;
        this._renderDeferredForNativeSelect = false;
        this._requestLoad({ forceRender: true });
      }, 0);
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
    window.clearTimeout(this._selectFocusReleaseTimer);
    this._selectFocusReleaseTimer = undefined;
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
    if (this._hasFocusedNativeSelect()) {
      this._renderDeferredForNativeSelect = true;
      return true;
    }
    return (
      (this._settingsDirty && this._activeTab === "settings") ||
      this._settingsSaving ||
      this._blockingRequest ||
      this._keyDialogOpen ||
      this._modalCount > 0
    );
  }

  _hasFocusedNativeSelect() {
    return this.shadowRoot.activeElement instanceof HTMLSelectElement;
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
        if (activeAccountChanged) this._keyTileSortMode = null;
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
    const leftHidden = !showLeft;
    const rightHidden = !showRight;
    const changed = left.hidden !== leftHidden || right.hidden !== rightHidden;
    left.hidden = leftHidden;
    right.hidden = rightHidden;
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
      updateRemoteShareConnectionStatus(this, this._settings.remote_last_sync);
      // Storage usage changes independently of saved options, so it must not
      // rebuild the Settings form while a native select is open.
      // Receiver sync timestamps are runtime status, not editable settings.
      // Including them here rebuilds the form every 15 seconds and closes
      // an open native dropdown.
      const settingsSignature = settingsRenderSignature(this._settings);
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
    // Fetch only the rows currently rendered. Fetching every historical image and
    // rebuilding the table after each response can keep the UI thread busy long
    // enough for a thumbnail click to appear unresponsive.
    const { visible } = visibleActivityEvents(this, account?.activity || []);
    const missing = visible.filter((item) => {
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

    const relays = (this._account()?.relays || []).filter(
      (relay) => (relay.source_name || relay.name) === cameraName
    );
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

    if (account.credential_source_problem) {
      return this._remoteCredentialSourceNotice(account);
    }

    if (this._activeTab === "activity") return renderActivityView(this, account);
    if (this._activeTab === "calls") return renderCallsView(this, account);
    if (this._activeTab === "keys") return renderKeysView(this, account);
    if (this._activeTab === "settings") return renderSettingsView(this);
    return renderDevicesView(this, account);
  }

  _remoteCredentialSourceNotice(account) {
    const problem = account.credential_source_problem;
    const sourceUrl = String(account.remote_source_url || "");
    const sourceLink = sourceUrl.startsWith("https://")
      ? `<a href="${escapeHtml(sourceUrl)}">${escapeHtml(sourceUrl)}</a>`
      : "the host instance";
    const details = {
      unreachable: {
        title: "Cannot reach the credential source",
        text: `This Home Assistant cannot reach the host instance that supplies this account’s SmartPlus credentials: ${sourceLink}<br />Cached credentials may continue to work until they expire.`,
      },
      revoked: {
        title: "Credential sharing was revoked",
        text: "The host Home Assistant revoked this instance’s access. Re-pair this account from the local Akuvox integration after the host creates a new pairing link.",
      },
      source_needs_reauth: {
        title: "The host supplied invalid SmartPlus credentials",
        text: "SmartPlus rejected the token received from the host Home Assistant. Re-authenticate Akuvox SmartPlus on the host, then refresh shared credentials here.",
      },
    }[problem] || {
      title: "Shared credentials need attention",
      text: "The credentials supplied by the host Home Assistant could not be used. Refresh them or re-authenticate on the host.",
    };
    return `
      <div class="card auth-notice">
        <h2>${details.title}</h2>
        <p>${details.text}</p>
        <button class="action" type="button" data-refresh-shared-credentials>Refresh shared credentials</button>
        ${problem === "unreachable" ? '<button class="action" type="button" data-apply-remote-share-link>Apply new share link</button>' : ""}
        <p class="muted">Re-authentication must be completed in the Akuvox integration on the host Home Assistant.</p>
      </div>
    `;
  }

  _requestRemoteShareLink() {
    return new Promise((resolve) => {
      const dialog = this.shadowRoot.ownerDocument.createElement("dialog");
      dialog.innerHTML = `<h2>Apply New Share Link</h2>
        <p>Paste the replacement pairing link from the host Home Assistant.</p>
        <form method="dialog">
          <label>Share link<input data-share-link required autocomplete="off"></label>
          <p class="form-error" data-share-link-error hidden></p>
          <div class="modal-actions"><button class="modal-cancel" value="cancel">Cancel</button><button class="modal-action" value="apply">Apply</button></div>
        </form>`;
      const form = dialog.querySelector("form");
      const input = dialog.querySelector("[data-share-link]");
      form.addEventListener("submit", (event) => {
        if (event.submitter?.value !== "apply") return;
        if (input.value.trim()) return;
        event.preventDefault();
        const error = dialog.querySelector("[data-share-link-error]");
        error.textContent = "Paste a share link.";
        error.hidden = false;
      });
      dialog.addEventListener("close", () => {
        const value = dialog.returnValue === "apply" ? input.value.trim() : "";
        dialog.remove();
        resolve(value || null);
      }, { once: true });
      this._modalCount = (this._modalCount || 0) + 1;
      dialog.addEventListener("close", () => {
        this._modalCount = Math.max(0, (this._modalCount || 1) - 1);
      }, { once: true });
      this.shadowRoot.append(dialog);
      dialog.showModal();
      input.focus();
    });
  }

  async _applyRemoteShareLink() {
    const pairingLink = await this._requestRemoteShareLink();
    if (!pairingLink) return;
    try {
      await callWsWithBlocker(this, {
        type: "akuvox/panel_apply_remote_share_link",
        entry_id: this._activeAccount,
        pairing_link: pairingLink,
      });
      await this._load();
      showNotice(
        this,
        "The new share link was saved. Cached devices and credentials remain available until the new source synchronizes.",
        "New Share Link Applied"
      );
    } catch (error) {
      showNotice(this, error?.message || "The share link could not be applied.", "Could Not Apply Share Link");
    }
  }

  async _refreshSharedCredentials() {
    try {
      const result = await callWsWithBlocker(this, {
        type: "akuvox/panel_refresh_shared_credentials",
        entry_id: this._activeAccount,
      });
      await this._load();
      showNotice(
        this,
        result.updated
          ? "New credentials were received from the host Home Assistant."
          : "The host is reachable; its shared credentials are already current.",
        "Shared credentials refreshed"
      );
    } catch (error) {
      await this._load();
      showNotice(
        this,
        error?.message || "Could not reach the Home Assistant that shares these credentials.",
        "Could not refresh shared credentials"
      );
    }
  }

  /** Return items in the saved local order, with new items appended. */
  _orderTiles(scope, items, getId) {
    let savedOrder = [];
    try {
      const value = localStorage.getItem(
        `${TILE_ORDER_STORAGE_PREFIX}-${scope}-${this._activeAccount}`
      );
      const parsed = JSON.parse(value || "[]");
      savedOrder = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      // The server order is a safe fallback when storage cannot be read.
    }
    const positions = new Map(savedOrder.map((id, index) => [id, index]));
    return [...items].sort((left, right) => {
      const leftPosition = positions.get(String(getId(left)));
      const rightPosition = positions.get(String(getId(right)));
      return (leftPosition ?? Number.MAX_SAFE_INTEGER) - (rightPosition ?? Number.MAX_SAFE_INTEGER);
    });
  }

  /** Whether a saved manual tile sequence exists for the active account. */
  _hasTileOrder(scope) {
    try {
      const value = localStorage.getItem(
        `${TILE_ORDER_STORAGE_PREFIX}-${scope}-${this._activeAccount}`
      );
      const savedOrder = JSON.parse(value || "[]");
      return Array.isArray(savedOrder) && savedOrder.length > 0;
    } catch (_) {
      return false;
    }
  }

  /** Save a tile sequence for the active account. */
  _saveTileOrder(scope, ids) {
    try {
      localStorage.setItem(
        `${TILE_ORDER_STORAGE_PREFIX}-${scope}-${this._activeAccount}`,
        JSON.stringify(ids)
      );
    } catch (_) {
      // Reordering remains visible until the next render in restricted contexts.
    }
  }

  /** Remove a saved tile sequence so an explicit sort can take effect. */
  _clearTileOrder(scope) {
    try {
      localStorage.removeItem(`${TILE_ORDER_STORAGE_PREFIX}-${scope}-${this._activeAccount}`);
    } catch (_) {
      // The current render still uses the selected sort when storage is unavailable.
    }
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
            this._accounts.length > 1
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
    // Account selector event listener
    this.shadowRoot.querySelector("[data-account]")?.addEventListener("change", async (event) => {
      this._activeAccount = event.target.value;
      this._keyTileSortMode = null;
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

    // Restore first, then bring the selected tab into view. Reversing these
    // calls makes the two scroll assignments compete on mobile Safari when a
    // tab near the end of the strip is selected.
    this._restoreScrollPosition(scrollPosition);
    this._setupTabScrolling();
  }
}

if (!customElements.get(PANEL_TAG)) {
  customElements.define(PANEL_TAG, AkuvoxSmartPlusPanel);
}
