/* Akuvox SmartPlus local sidebar panel. No third-party frontend dependency. */
const PANEL_TAG = "akuvox-smartplus-panel";
const TAB_HASHES = {
  Devices: "overview",
  LatestActivity: "activity",
  CallHistory: "calls",
  TemporaryKeys: "keys",
  Settings: "settings",
  HelpInfo: "help",
};
const TAB_HASH_BY_ID = Object.fromEntries(
  Object.entries(TAB_HASHES).map(([hash, tab]) => [tab, hash])
);

const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
}[character]));

class AkuvoxSmartPlusPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._accounts = [];
    this._activeAccount = "";
    this._activeTab = "overview";
    this._settings = null;
    this._countryOptions = [];
    this._subdomainOptions = [];
    this._settingsEntryId = "";
    this._revealedSecrets = new Set();
    this._settingsDirty = false;
    this._settingsSaving = false;
    this._blockingRequest = false;
    this._modalCount = 0;
    this._loading = false;
    this._loadQueued = false;
    this._activityFilters = { Location: "", CaptureType: "", Initiator: "" };
    this._activitySort = { key: "CaptureTime", direction: "desc" };
    this._activityImages = new Map();
    this._activityImageFailures = new Map();
    this._callFilters = { callerName: "", calleeName: "", status: "" };
    this._callSort = { key: "startTime", direction: "desc" };
    this._keyFilters = { description: "", status: "" };
    this._keySort = { key: "description", direction: "asc" };
    this._selectingKeys = false;
    this._selectedKeyIds = new Set();
    this._copiedKeyCodes = new Map();
    this._panelDataSubscriptionActive = false;
    this._onHashChange = () => {
      const tab = TAB_HASHES[decodeURIComponent(window.location.hash.slice(1))];
      if (tab && tab !== this._activeTab) {
        this._activeTab = tab;
        this._render();
      }
    };
  }

  set hass(value) {
    this._hass = value;
    if (!this._hashListenerRegistered) {
      window.addEventListener("hashchange", this._onHashChange);
      this._hashListenerRegistered = true;
    }
    this._onHashChange();
    this._subscribeToPanelDataUpdates();
    this._requestLoad();
    if (!this._timer) this._timer = window.setInterval(() => this._requestLoad(), 15000);
  }

  disconnectedCallback() {
    window.clearInterval(this._timer);
    this._closeKeyActionsMenu();
    this._timer = undefined;
    this._subdomainOutsideAbort?.abort();
    this._copiedKeyCodes.forEach((timeout) => window.clearTimeout(timeout));
    this._copiedKeyCodes.clear();
    this._panelDataSubscriptionActive = false;
    this._unsubscribePanelDataUpdates?.();
    this._unsubscribePanelDataUpdates = undefined;
    if (this._hashListenerRegistered) window.removeEventListener("hashchange", this._onHashChange);
    this._hashListenerRegistered = false;
  }

  async _subscribeToPanelDataUpdates() {
    if (this._panelDataSubscriptionActive || !this._hass?.connection) return;
    this._panelDataSubscriptionActive = true;
    try {
      const unsubscribe = await this._hass.connection.subscribeEvents(
        () => {
          if (this._activeTab === "settings") this._settingsEntryId = "";
          this._requestLoad();
        },
        "akuvox_panel_data_updated",
      );
      if (this._panelDataSubscriptionActive) this._unsubscribePanelDataUpdates = unsubscribe;
      else unsubscribe();
    } catch (_) {
      this._panelDataSubscriptionActive = false;
    }
  }

  _requestLoad() {
    if (this._loading) {
      this._loadQueued = true;
      return;
    }
    void this._load();
  }

  _shouldDeferRender() {
    return this._settingsDirty || this._settingsSaving || this._blockingRequest || this._keyDialogOpen || this._modalCount > 0;
  }

  async _load() {
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
        this._accounts = result.accounts || [];
        this._error = undefined;
        if (!this._accounts.some((account) => account.entry_id === this._activeAccount)) {
          this._activeAccount = this._accounts[0]?.entry_id || "";
          this._settingsDirty = false;
        }
        if (this._activeAccount && this._settingsEntryId !== this._activeAccount) await this._loadSettings();
        if (!this._shouldDeferRender()) this._render();
      } while (this._loadQueued);
    } catch (error) {
      this._error = "Unable to load SmartPlus data.";
      if (!this._shouldDeferRender()) this._render();
    } finally {
      this._loading = false;
      if (this._loadQueued) this._requestLoad();
    }
  }

  _account() {
    return this._accounts.find((account) => account.entry_id === this._activeAccount);
  }

  _render() {
    this._subdomainOutsideAbort?.abort();
    this._subdomainOutsideAbort = undefined;
    const account = this._account();
    const requiresReauthentication = Boolean(account?.requires_reauthentication);
    this.toggleAttribute("data-mirror-activity-images", Boolean(this._settings?.mirror_activity_images));
    const tabs = [["overview", "Devices"], ["activity", "Latest activity"], ["calls", "Call history"], ["keys", "Temporary keys"], ["settings", "Settings"], ["help", "Help & Info"]]
      .map(([id, label]) => `<button class="tab ${this._activeTab === id ? "selected" : ""}" data-tab="${id}">${label}</button>`).join("");
    this.shadowRoot.innerHTML = `
      <style>
        :host { --aqua:#00a9ce; --navy:#003b5c; --mint:#76c8c3; color:var(--primary-text-color,#17212b); display:block; font:14px/1.45 var(--paper-font-body1_-_font-family,Arial,sans-serif); } .combobox { display:grid; grid-template-columns:1fr auto; position:relative; } .combobox input { min-width:0; border-radius:8px 0 0 8px; } .combobox-toggle { display:flex; align-items:center; justify-content:center; border:1px solid var(--divider-color,#bbb); border-left:0; border-radius:0 8px 8px 0; padding:0 12px; color:inherit; background:var(--card-background-color,#fff); } .combobox-toggle svg { display:block; width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:2; } .combobox-menu { position:absolute; z-index:1; top:calc(100% + 4px); left:0; right:0; max-height:220px; overflow:auto; border:1px solid var(--divider-color,#bbb); border-radius:8px; background:var(--card-background-color,#fff); box-shadow:0 8px 20px #0003; } .combobox-menu button { display:block; width:100%; border:0; padding:8px 10px; color:inherit; background:transparent; text-align:left; } .combobox-menu button:hover { background:var(--secondary-background-color,#eef7fa); }
        main { max-width:1440px; margin:auto; padding:24px; } main.reauthentication-required { box-sizing:border-box; min-height:100vh; display:flex; flex-direction:column; } header { display:flex; gap:16px; align-items:center; padding:22px; color:white; border-radius:18px; background:linear-gradient(135deg,#55d9e8 0%,#299fd8 52%,#0c63c9 100%); } .brand-mark { width:52px; height:52px; object-fit:contain; } h1 { margin:0; font-size:26px; } header p { margin:2px 0 0; opacity:.85; } header select { margin-left:auto; max-width:280px; padding:8px; border-radius:8px; } nav { display:flex; gap:5px; margin:20px 0; border-bottom:1px solid var(--divider-color,#ddd); } .auth-required-content { flex:1; display:grid; place-items:center; } .auth-notice { width:min(100%, 560px); text-align:center; } .auth-notice h2 { font-size:20px; } button { font:inherit; cursor:pointer; } .tab { border:0; background:transparent; padding:12px 14px; color:inherit; } .tab.selected { color:var(--aqua); border-bottom:3px solid var(--aqua); font-weight:700; } .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:16px; } .card { border:1px solid var(--divider-color,#ddd); border-radius:14px; padding:16px; background:var(--card-background-color,#fff); } .card h2 { font-size:16px; margin:0; } .section-heading { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:12px; } .camera, .relay { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 0; border-top:1px solid var(--divider-color,#eee); } .camera > span:first-child, .relay > span { flex:1; min-width:0; } .camera > span:last-child { display:flex; flex:0 0 auto; flex-direction:column; align-items:stretch; gap:8px; } .camera > span:last-child .action { min-width:104px; } .relay .action { flex:0 0 auto; min-width:98px; white-space:nowrap; } .camera:first-of-type,.relay:first-of-type{border-top:0} .action { color:white; background:#55bfe6; border:0; border-radius:8px; padding:8px 10px; } .success { color:white; background:#16a34a; border:0; border-radius:8px; padding:8px 10px; } .success:hover { background:#15803d; } .add-key { display:inline-flex; align-items:center; gap:5px; } .add-key .plus { font-size:20px; font-weight:800; line-height:12px; } .danger { color:white; background:#dc2626; border:0; border-radius:8px; padding:8px; } .danger:hover { background:#b91c1c; } .danger svg { display:block; width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:2; } .device-table { table-layout:fixed; } .device-table th:first-child { width:clamp(150px,32%,420px); } .device-table th:nth-child(2) { width:clamp(176px,29%,340px); } .device-table th:nth-child(3) { width:clamp(120px,24%,280px); } .device-table th:nth-child(4) { width:clamp(76px,15%,150px); } .device-table th:nth-child(n+2), .device-table td:nth-child(n+2) { text-align:center; } .device-table td { overflow-wrap:anywhere; } .device-table .actions { display:flex; min-width:0; flex-wrap:wrap; gap:8px; justify-content:center; } .device-table .action { width:104px; max-width:100%; white-space:nowrap; } .info-link { display:inline-flex; align-items:center; justify-content:center; gap:6px; color:var(--aqua); text-decoration:none; font-weight:600; } .info-link svg { width:17px; height:17px; fill:none; stroke:currentColor; stroke-width:2; } .muted { color:var(--secondary-text-color,#6b7280); } table { width:100%; border-collapse:collapse; overflow:auto; } th,td { padding:10px; text-align:left; border-bottom:1px solid var(--divider-color,#ddd); vertical-align:middle; } th { color:var(--secondary-text-color,#6b7280); } dialog { border:0; border-radius:14px; padding:24px; width:min(560px,calc(100vw - 48px)); color:inherit; background:var(--card-background-color,#fff); } dialog::backdrop { background:#003b5c99; } .modal-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:16px; } .modal-action, .modal-cancel { min-width:112px; height:40px; border:0; border-radius:8px; font:inherit; cursor:pointer; } .modal-action { color:white; background:#55bfe6; } .modal-cancel { color:#fff; background:#4b5563; } .modal-cancel:hover { background:#374151; } form { display:grid; gap:12px; } form label { display:grid; gap:4px; min-width:0; font-weight:600; } form input, form select { box-sizing:border-box; width:100%; padding:8px; border:1px solid var(--divider-color,#bbb); border-radius:8px; color:inherit; background:var(--card-background-color,#fff); font:inherit; } .subdomain-input { margin-top:4px; } fieldset { border:1px solid var(--divider-color,#ddd); border-radius:8px; display:grid; gap:7px; } .check { display:block; font-weight:400; } .check input { width:auto; margin-right:7px; } .notice { padding:12px; border-radius:10px; background:#e9f8fb; color:var(--navy); } @media(max-width:760px) { .device-table th:first-child { width:31%; } .device-table th:nth-child(2) { width:31%; } .device-table th:nth-child(3) { width:23%; } .device-table th:nth-child(4) { width:15%; } .device-table .actions{flex-direction:column;flex-wrap:nowrap;align-items:center} } @media(max-width:600px) { main{padding:12px} header{padding:16px;flex-wrap:wrap} header select{margin-left:0;width:100%} .device-table th,.device-table td{padding:8px 5px;font-size:13px} .device-table th:first-child{width:30%}.device-table th:nth-child(2){width:32%}.device-table th:nth-child(3){width:23%}.device-table th:nth-child(4){width:15%} .device-table .action{width:100%;font-size:12px;padding:8px 4px} }
      </style>
      <style>
        .activity-controls select { box-sizing:border-box; min-height:36px; padding:7px 34px 7px 10px; border:1px solid var(--divider-color,#8c99a3); border-radius:10px; color:inherit; background:var(--card-background-color,#fff); font:inherit; }
        .activity-controls select:focus { outline:2px solid var(--aqua); outline-offset:2px; }
        .help-card { display:grid; gap:20px; max-width:820px; } .help-card h2 { font-size:20px; } .help-card h3 { margin:0 0 6px; font-size:16px; } .help-card p { margin:0; } .help-list { margin:0; padding-left:20px; display:grid; gap:6px; } .help-link { color:var(--aqua); font-weight:700; } .disclaimer { padding:14px; border-left:4px solid var(--aqua); border-radius:8px; background:var(--secondary-background-color,#eef7fa); } .bmc-banner { display:inline-flex; align-items:center; gap:9px; margin-top:10px; min-height:44px; padding:0 17px; border-radius:10px; color:#111; background:#ffdd00; box-shadow:0 2px 0 #c9a800; font-weight:800; line-height:1; text-decoration:none; } .bmc-banner:hover { background:#ffe238; } .bmc-banner:focus-visible { outline:2px solid var(--aqua); outline-offset:3px; } .bmc-banner-icon { font-size:21px; line-height:1; }
        .activity-image-dialog { position:relative; } .activity-image-details { margin:10px 44px 0; font-weight:600; text-align:center; } .activity-image-nav { position:absolute; z-index:2; top:50%; transform:translateY(-50%); width:38px; height:48px; border:0; border-radius:8px; color:white; background:#003b5ccc; font-size:30px; line-height:1; } .activity-image-nav:hover { background:#003b5c; } .activity-image-nav.previous { left:12px; } .activity-image-nav.next { right:12px; }
      </style>
      <style>
        .brand-mark { filter: brightness(0) invert(1); }
        dialog { text-align:center; }
        dialog form { justify-items:center; }
        dialog form > label { width:min(100%, 420px); text-align:center; }
        dialog form input,
        dialog form select { text-align:center; }
        dialog fieldset { width:min(100%, 420px); text-align:center; justify-items:center; }
        dialog .relay-options { display:grid; justify-items:start; width:fit-content; max-width:100%; margin:auto; }
        dialog .check { text-align:left; }
        dialog .modal-actions { justify-content:center; }
        dialog .range-calendar-header { text-align:center; }
        dialog .range-times { width:min(100%, 420px); }
        .secret-input { display:grid; grid-template-columns:1fr auto; } .secret-input input { min-width:0; border-radius:8px 0 0 8px; } .secret-toggle { display:flex; align-items:center; justify-content:center; width:42px; border:1px solid var(--divider-color,#bbb); border-left:0; border-radius:0 8px 8px 0; color:inherit; background:var(--card-background-color,#fff); } .secret-toggle svg { width:19px; height:19px; fill:none; stroke:currentColor; stroke-width:2; }
        .device-table th:first-child { width:24%; }
        .device-table th:nth-child(2) { width:33%; }
        .device-table th:nth-child(3) { width:27%; }
        .device-table th:nth-child(4) { width:16%; }
        @media(max-width:760px) {
          .device-table th:first-child { width:22%; }
          .device-table th:nth-child(2) { width:35%; }
          .device-table th:nth-child(3) { width:28%; }
          .device-table th:nth-child(4) { width:15%; }
        }
        @media(max-width:600px) {
          .device-table th:first-child { width:20%; }
          .device-table th:nth-child(2) { width:37%; }
          .device-table th:nth-child(3) { width:28%; }
          .device-table th:nth-child(4) { width:15%; }
        }
        .device-table { table-layout:auto; }
        .device-table th:first-child,
        .device-table td:first-child { width:1%; white-space:nowrap; }
        .range-dialog { width:min(525px,calc(100vw - 32px)); }
        .device-table th:nth-child(2),
        .device-table th:nth-child(3),
        .device-table th:nth-child(4) { width:auto; }
        .modal-action:disabled { cursor:not-allowed; opacity:.5; }
        .date-range-field { display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; border:1px solid var(--divider-color,#bbb); border-radius:8px; padding:8px; color:inherit; background:var(--card-background-color,#fff); text-align:left; } .date-range-field svg { width:18px; height:18px; flex:0 0 auto; fill:none; stroke:currentColor; stroke-width:2; } .range-dialog { width:min(700px,calc(100vw - 32px)); } .range-calendar { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; margin:12px 0; } .range-calendar .weekday { padding:4px; color:var(--secondary-text-color,#6b7280); font-size:12px; font-weight:700; text-align:center; } .range-calendar .day { height:38px; min-width:32px; border:0; border-radius:7px; color:inherit; background:transparent; } .range-calendar .day:hover { background:#dff5fc; color:#17212b; } .range-calendar .day.selected { color:white; background:#55bfe6; } .range-calendar .day.in-range { color:#17212b; background:#dff5fc; } .range-calendar .day.empty { visibility:hidden; } .range-calendar-header { display:flex; align-items:center; justify-content:space-between; } .range-calendar-header button { width:36px; height:36px; border:0; border-radius:8px; color:inherit; background:transparent; font-size:22px; } .range-times { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; } .activity-controls { display:flex; flex-wrap:wrap; gap:10px; margin:12px 0; } .activity-controls label { display:grid; gap:3px; font-size:12px; font-weight:600; } .activity-controls select { min-width:130px; padding:6px 8px; } .sort-button { border:0; padding:0; color:inherit; background:transparent; font-weight:700; } .sort-button::after { content:" ↕"; color:var(--secondary-text-color,#6b7280); } .sort-button.active::after { content:" " attr(data-direction); color:var(--aqua); } .activity-thumbnail { position:relative; display:grid; align-content:center; place-items:center; width:76px; height:52px; margin:auto; padding:0; overflow:hidden; border:0; border-radius:7px; background:var(--secondary-background-color,#dbe5ea); } .activity-thumbnail img { display:block; align-content:center; width:100%; height:100%; object-fit:cover; } .activity-thumbnail svg { position:absolute; right:4px; bottom:4px; width:17px; height:17px; padding:3px; border-radius:50%; color:white; background:#003b5ccc; fill:none; stroke:currentColor; stroke-width:2; } .thumbnail-spinner { width:20px; height:20px; border:3px solid color-mix(in srgb, var(--aqua) 25%, transparent); border-top-color:var(--aqua); border-radius:50%; animation:thumbnail-spin .8s linear infinite; } @keyframes thumbnail-spin { to { transform:rotate(360deg); } } .activity-thumbnail-error { display:grid; place-items:center; width:76px; height:52px; margin:auto; border-radius:7px; color:var(--error-color,#dc2626); background:color-mix(in srgb, var(--error-color,#dc2626) 10%, transparent); font-size:12px; font-weight:700; } .activity-image-dialog { width:min(760px,calc(100vw - 32px)); padding:12px; } .activity-image-dialog h2 { margin:0 0 8px; } .activity-image-dialog .modal-actions { margin-top:8px; } .activity-image-dialog img { display:block; width:100%; max-height:75vh; object-fit:contain; border-radius:8px; } @media(max-width:500px) { .range-times { grid-template-columns:1fr; } }
      </style>
      <style>
        .key-heading { display:grid; grid-template-columns:1fr auto; } .key-heading-actions { display:flex; flex-wrap:wrap; grid-column:2; justify-self:end; justify-content:flex-end; gap:8px; } .key-filter-input { min-width:180px; } .key-row-selected { background:color-mix(in srgb, var(--aqua) 12%, transparent); } .key-select-cell { width:36px; text-align:center; } .key-select-cell input { width:18px; height:18px; accent-color:var(--aqua); } .key-code, .copied-code { display:inline-flex; align-items:center; gap:7px; } .copied-code { color:#62d394; font-weight:700; } .copied-code svg { width:17px; height:17px; fill:none; stroke:currentColor; stroke-width:2.5; } .copy-code { display:grid; place-items:center; width:28px; height:28px; padding:0; border:0; border-radius:6px; color:var(--aqua); background:transparent; } .copy-code:hover { background:color-mix(in srgb, var(--aqua) 15%, transparent); } .copy-code svg { width:17px; height:17px; fill:none; stroke:currentColor; stroke-width:2; } .key-actions { display:flex; align-items:center; justify-content:center; gap:8px; } .qr-action { display:inline-flex; align-items:center; gap:6px; } .qr-action svg { width:17px; height:17px; fill:none; stroke:white; stroke-width:2; } .readonly-key-fields { display:grid; gap:10px; } .readonly-key-field { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:16px; align-items:baseline; } .readonly-key-field > span { color:var(--secondary-text-color,#6b7280); font-weight:600; } .readonly-key-field > strong { overflow-wrap:anywhere; text-align:right; } .modal-icon { display:inline-flex; align-items:center; justify-content:center; } .modal-icon svg { width:19px; height:19px; fill:none; stroke:currentColor; stroke-width:2; } @media(max-width:600px) { .key-heading { grid-template-columns:1fr; } .key-heading-actions { grid-column:1; justify-self:stretch; } }
        .key-menu-button { display:grid; place-items:center; width:36px; height:36px; padding:0; font-size:22px; font-weight:800; line-height:1; } .key-row-submenu td { padding:0 10px 10px; background:color-mix(in srgb, var(--aqua) 6%, transparent); } .key-row-submenu-actions { display:flex; justify-content:flex-end; flex-wrap:wrap; gap:8px; padding-top:10px; } .key-row-submenu-actions .action[disabled], .key-modal-form .modal-action:disabled { cursor:not-allowed; opacity:.48; } .key-modal-form { display:grid; gap:14px; } .key-modal-form > label, .key-modal-form .key-form-extra-fields > label, .key-modal-form .readonly-key-field, .key-modal-form .key-relay-row { display:grid; grid-template-columns:minmax(30px,42%) minmax(0,1fr); align-items:center; gap:16px; width:min(100%,480px); margin-inline:auto; } .key-modal-form > label { font-weight:600; } .key-modal-form .key-form-extra-fields { display:grid; gap:14px; } .key-modal-form .readonly-key-fields { display:grid; gap:14px; } .key-modal-form .readonly-key-field > strong { text-align:left; } .key-modal-form .key-relay-row > span { color:var(--secondary-text-color,#6b7280); font-weight:600; } .key-modal-form fieldset.key-relay-row { box-sizing:border-box; } .key-modal-form fieldset.key-relay-row legend { grid-column:1; color:var(--secondary-text-color,#6b7280); font-weight:600; } .key-modal-form fieldset.key-relay-row .relay-options { grid-column:2; grid-row:1; } .key-modal-form .relay-options { margin:0; } .key-modal-form .modal-actions { width:min(100%,480px); margin-inline:auto; } @media(max-width:500px) { .key-modal-form > label, .key-modal-form .key-form-extra-fields > label, .key-modal-form .readonly-key-field, .key-modal-form .key-relay-row { grid-template-columns:1fr; gap:5px; } .key-modal-form fieldset.key-relay-row .relay-options { grid-column:1; grid-row:auto; } .key-row-submenu-actions { justify-content:stretch; } .key-row-submenu-actions .action { flex:1; } }
        .page-blocker { position:fixed; z-index:10000; inset:0; display:grid; place-items:center; opacity:0; pointer-events:auto; transition:opacity 180ms ease; } .page-blocker::before { position:absolute; inset:0; background:#0004; content:""; } .page-blocker.visible { opacity:1; } .page-blocker-spinner { position:relative; width:44px; height:44px; border:5px solid #ffffff66; border-top-color:#fff; border-radius:50%; animation:page-blocker-spin .8s linear infinite; } .temporary-key-qr-dialog { width:min(456px,calc(60vw - 20px)); } @keyframes page-blocker-spin { to { transform:rotate(360deg); } }
      </style>
      <style>.activity-thumbnail { align-content:center; } .activity-thumbnail img { width:100%; height:auto; object-position:center center; transform:none; }</style>
      <style>:host([data-mirror-activity-images]) .activity-thumbnail img { transform:scaleX(-1); } :host([data-mirror-activity-images]) .activity-image-dialog img { transform:scaleX(-1); }</style>
      <main class="${requiresReauthentication ? "reauthentication-required" : ""} ${this._settings?.mirror_activity_images ? "activity-images-mirrored" : ""}">
        <header><img class="brand-mark" src="/api/akuvox_panel/akuvox.svg" alt="Akuvox SmartPlus"><div><h1>Akuvox SmartPlus</h1><p>Doors, calls, cameras, and temporary access</p></div>
        ${this._accounts.length ? `<select aria-label="Akuvox account" data-account>${this._accounts.map((item) => `<option value="${escapeHtml(item.entry_id)}" ${item.entry_id === this._activeAccount ? "selected" : ""}>${escapeHtml(item.title || item.project_name || "SmartPlus account")}</option>`).join("")}</select>` : ""}</header>
        ${requiresReauthentication ? "" : `<nav>${tabs}</nav>`}
        <section class="${requiresReauthentication ? "auth-required-content" : ""}">${this._error ? `<p class="notice">${this._error}</p>` : this._content(account)}</section>
      </main>`;
    this.shadowRoot.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => { const hash = TAB_HASH_BY_ID[button.dataset.tab]; if (hash) window.location.hash = hash; }));
    this.shadowRoot.querySelector("[data-account]")?.addEventListener("change", async (event) => { this._activeAccount = event.target.value; this._settings = null; this._settingsEntryId = ""; this._settingsDirty = false; this._selectingKeys = false; this._selectedKeyIds.clear(); await this._loadSettings(); this._render(); });
    this.shadowRoot.querySelectorAll("[data-stream]").forEach((button) => button.addEventListener("click", () => this._stream(button.dataset.stream, button.dataset.mode)));
    this.shadowRoot.querySelectorAll("[data-activity-image]").forEach((button) => button.addEventListener("click", () => this._showActivityImage(button.dataset.activityImage)));
    this.shadowRoot.querySelectorAll("[data-call-image]").forEach((button) => button.addEventListener("click", () => this._showCallImage(button.dataset.callImage)));
    this.shadowRoot.querySelectorAll("[data-temp-key-qr]").forEach((button) => button.addEventListener("click", () => this._showTemporaryKeyQr(button.dataset.tempKeyQr)));
    this.shadowRoot.querySelectorAll("[data-copy-key-code]").forEach((button) => button.addEventListener("click", async () => {
      if (await this._copyText(button.dataset.copyKeyCode)) {
        const keyId = button.dataset.copyKeyId;
        window.clearTimeout(this._copiedKeyCodes.get(keyId));
        this._copiedKeyCodes.set(keyId, window.setTimeout(() => {
          this._copiedKeyCodes.delete(keyId);
          this._render();
        }, 2000));
        this._render();
      } else this._showNotice("The temporary key code could not be copied.", "Copy failed");
    }));
    this.shadowRoot.querySelectorAll("[data-activity-filter]").forEach((select) => select.addEventListener("change", () => { this._activityFilters[select.dataset.activityFilter] = select.value; this._render(); }));
    this.shadowRoot.querySelectorAll("[data-activity-sort]").forEach((button) => button.addEventListener("click", () => { const key = button.dataset.activitySort; this._activitySort = { key, direction: this._activitySort.key === key && this._activitySort.direction === "asc" ? "desc" : "asc" }; this._render(); }));
    this.shadowRoot.querySelectorAll("[data-call-filter]").forEach((select) => select.addEventListener("change", () => { this._callFilters[select.dataset.callFilter] = select.value; this._render(); }));
    this.shadowRoot.querySelectorAll("[data-call-sort]").forEach((button) => button.addEventListener("click", () => { const key = button.dataset.callSort; this._callSort = { key, direction: this._callSort.key === key && this._callSort.direction === "asc" ? "desc" : "asc" }; this._render(); }));
    this.shadowRoot.querySelectorAll("[data-key-filter]").forEach((input) => { const update = () => { this._keyFilters[input.dataset.keyFilter] = input.value; this._render(); }; input.addEventListener("input", update); input.addEventListener("change", update); });
    this.shadowRoot.querySelectorAll("[data-key-sort]").forEach((button) => button.addEventListener("click", () => { const key = button.dataset.keySort; this._keySort = { key, direction: this._keySort.key === key && this._keySort.direction === "asc" ? "desc" : "asc" }; this._render(); }));
    this.shadowRoot.querySelector("[data-toggle-key-selection]")?.addEventListener("click", () => { this._selectingKeys = !this._selectingKeys; this._selectedKeyIds.clear(); this._render(); });
    this.shadowRoot.querySelectorAll("[data-select-key]").forEach((input) => input.addEventListener("change", () => { if (input.checked) this._selectedKeyIds.add(input.dataset.selectKey); else this._selectedKeyIds.delete(input.dataset.selectKey); this._render(); }));
    this.shadowRoot.querySelector("[data-delete-selected]")?.addEventListener("click", () => this._deleteSelectedKeys());
    if (this._activeTab === "activity") void this._loadActivityThumbnails();
    this.shadowRoot.querySelectorAll("[data-relay]").forEach((button) => button.addEventListener("click", () => this._relay(button.dataset.mac, button.dataset.relay)));
    this.shadowRoot.querySelector("[data-key-form]")?.addEventListener("submit", (event) => this._createKey(event));
    this.shadowRoot.querySelector("[data-key-form]")?.addEventListener("input", () => this._updateCreateKeyState());
    this.shadowRoot.querySelector("[data-key-form]")?.addEventListener("change", () => this._updateCreateKeyState());
    this.shadowRoot.querySelector("[data-validity-picker]")?.addEventListener("click", () => this._showDateRangePicker());
    this.shadowRoot.querySelectorAll("[data-key-menu]").forEach((button) => button.addEventListener("click", (event) => this._showKeyActionsMenu(button, event)));
    this.shadowRoot.querySelectorAll("[data-edit-key]").forEach((button) => button.addEventListener("click", () => this._showEditKeyDialog(button.dataset.editKey)));
    this.shadowRoot.querySelectorAll("[data-delete-key]").forEach((button) => button.addEventListener("click", () => this._deleteKey(button.dataset.deleteKey)));
    this.shadowRoot.querySelector("[data-create-key]")?.addEventListener("click", () => this._showKeyDialog());
    this.shadowRoot.querySelectorAll("[data-close-key-dialog]").forEach((button) => button.addEventListener("click", () => this._closeKeyDialog()));
    const keyDialog = this.shadowRoot.querySelector("[data-key-dialog]");
    if (keyDialog) {
      this._closeOnBackdrop(keyDialog);
      keyDialog.addEventListener("close", () => { this._keyDialogOpen = false; this._requestLoad(); });
    }
    const settingsForm = this.shadowRoot.querySelector("[data-settings-form]");
    if (settingsForm) {
      const panelAccess = settingsForm.querySelector("fieldset");
      const panelOptionsLegend = panelAccess?.querySelector("legend");
      if (panelOptionsLegend) panelOptionsLegend.textContent = "Panel Options";
      if (panelAccess) {
        const label = this.shadowRoot.ownerDocument.createElement("label");
        label.className = "check";
        label.innerHTML = `<input name="mirror_activity_images" type="checkbox" ${this._settings?.mirror_activity_images ? "checked" : ""}> Mirror activity images`;
        panelAccess.append(label);
        const debug = this.shadowRoot.ownerDocument.createElement("label");
        debug.className = "check";
        debug.innerHTML = `<input name="debug_logging" type="checkbox" ${this._settings?.debug_logging ? "checked" : ""}> Enable debug logging`;
        panelAccess.append(debug);
      }
    }
    settingsForm?.addEventListener("submit", (event) => this._saveSettings(event));
    settingsForm?.addEventListener("input", () => { this._settingsDirty = true; });
    settingsForm?.addEventListener("change", () => { this._settingsDirty = true; });
    this.shadowRoot.querySelectorAll("[data-toggle-secret]").forEach((button) => button.addEventListener("click", () => {
      const input = this.shadowRoot.querySelector(`[name="${button.dataset.toggleSecret}"]`);
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      if (visible) this._revealedSecrets.delete(button.dataset.toggleSecret);
      else this._revealedSecrets.add(button.dataset.toggleSecret);
      button.setAttribute("aria-label", visible ? `Show ${button.dataset.toggleSecret.replace("_", " ")}` : `Hide ${button.dataset.toggleSecret.replace("_", " ")}`);
      button.innerHTML = visible
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10.9 10.9 0 0 1 12 4c5.5 0 9.5 4.5 10 8-.2 1.4-1.1 3.1-2.6 4.5M6.6 6.6C4.6 8 3.3 10.2 2 12c.7 3.5 4.5 8 10 8 1.3 0 2.5-.2 3.6-.7"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
    }));
    const subdomainInput = this.shadowRoot.querySelector("[data-subdomain-input]");
    const subdomainMenu = this.shadowRoot.querySelector("[data-subdomain-menu]");
    this.shadowRoot.querySelector("[data-subdomain-toggle]")?.addEventListener("click", () => {
      subdomainMenu.hidden = !subdomainMenu.hidden;
      if (!subdomainMenu.hidden) subdomainInput.focus();
    });
    this.shadowRoot.querySelectorAll("[data-subdomain-value]").forEach((option) => option.addEventListener("click", () => {
      subdomainInput.value = option.dataset.subdomainValue;
      this._settingsDirty = true;
      subdomainInput.dispatchEvent(new Event("change", { bubbles: true }));
      subdomainMenu.hidden = true;
      subdomainInput.focus();
    }));
    if (subdomainMenu) {
      this._subdomainOutsideAbort = new AbortController();
      this.shadowRoot.ownerDocument.addEventListener("click", (event) => {
        if (!event.composedPath().includes(subdomainMenu.parentElement)) subdomainMenu.hidden = true;
      }, { capture: true, signal: this._subdomainOutsideAbort.signal });
    }
  }

  _content(account) {
    if (!account) {
      if (this._activeTab === "help") return this._helpContent();
      return `<div class="card auth-notice"><p>No active Akuvox account is available.</p><a class="action" href="/config/integrations/dashboard/add?domain=akuvox">Add Akuvox account</a></div>`;
    }
    if (account.requires_reauthentication) return `<div class="card auth-notice"><h2>Re-authentication required</h2><p>SmartPlus no longer accepts this account’s session. Re-authenticate the integration to restore access to your cameras, doors, and temporary keys.</p><a class="action" href="/config/integrations/integration/akuvox">Re-authenticate Akuvox SmartPlus</a></div>`;
    if (this._activeTab === "activity") return this._activity(account);
    if (this._activeTab === "calls") return this._calls(account);
    if (this._activeTab === "keys") return this._keys(account);
    if (this._activeTab === "settings") return this._settingsContent();
    if (this._activeTab === "help") return this._helpContent();
    return `<div class="card table-wrap"><h2>Devices</h2>${this._devices(account)}</div>`;
  }

  _devices(account) {
    const devices = new Map();
    (account.cameras || []).forEach((camera) => devices.set(camera.name, { name: camera.name, camera, relays: [], deviceId: camera.device_id }));
    (account.relays || []).forEach((relay) => { const device = devices.get(relay.name) || { name: relay.name || relay.door_name, camera: null, relays: [], deviceId: relay.device_id }; if (!device.deviceId) device.deviceId = relay.device_id; device.relays.push(relay); devices.set(relay.name, device); });
    const rows = [...devices.values()].map((device) => `<tr><td><strong>${escapeHtml(device.name)}</strong>${device.relays.length ? `<br><small class="muted">${escapeHtml(device.relays.map((relay) => `${relay.door_name} (relay ${relay.relay_id})`).join(", "))}</small>` : ""}</td><td><div class="actions">${device.camera ? `<button class="action" data-stream="${escapeHtml(device.camera.name)}" data-mode="open">Open stream</button><button class="action" data-stream="${escapeHtml(device.camera.name)}" data-mode="copy">Copy RTSP</button>` : '<span class="muted">No camera</span>'}</div></td><td><div class="actions">${device.relays.map((relay) => `<button class="action" data-relay="${escapeHtml(relay.relay_id)}" data-mac="${escapeHtml(relay.mac)}">Open door</button>`).join("") || '<span class="muted">No relay</span>'}</div></td><td>${device.deviceId ? `<a class="info-link" href="/config/devices/device/${encodeURIComponent(device.deviceId)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7M21 3l-9 9M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"/></svg>Open</a>` : '<span class="muted">Unavailable</span>'}</td></tr>`).join("");
    return `<table class="device-table"><thead><tr><th>Device</th><th>Camera</th><th>Relays</th><th>Info</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No devices discovered.</td></tr>'}</tbody></table>`;
  }

  _activityImageKey(captureTime) { return `${this._activeAccount}|${captureTime}`; }
  _calls(account) { const calls = account.calls || []; const options = (key) => [...new Set(calls.map((call) => key === "status" ? (call.isAnswer ? "Answered" : "Missed") : String(call[key] || "")).filter(Boolean))].sort().map((value) => `<option value="${escapeHtml(value)}" ${this._callFilters[key] === value ? "selected" : ""}>${escapeHtml(value)}</option>`).join(""); const filtered = calls.filter((call) => (!this._callFilters.callerName || call.callerName === this._callFilters.callerName) && (!this._callFilters.calleeName || call.calleeName === this._callFilters.calleeName) && (!this._callFilters.status || (call.isAnswer ? "Answered" : "Missed") === this._callFilters.status)).sort((a, b) => { const value = (call) => this._callSort.key === "status" ? (call.isAnswer ? "Answered" : "Missed") : this._callSort.key === "image" ? String(Boolean(call.has_image)) : String(call[this._callSort.key] || ""); return value(a).localeCompare(value(b)) * (this._callSort.direction === "asc" ? 1 : -1); }); const heading = (label, key) => `<button class="sort-button ${this._callSort.key === key ? "active" : ""}" data-call-sort="${key}" data-direction="${this._callSort.direction === "asc" ? "↑" : "↓"}">${label}</button>`; return `<div class="card table-wrap"><h2>Call history</h2><p class="muted">The latest SmartPlus call history is refreshed alongside activity polling and retained across restarts.</p><div class="activity-controls"><label>Caller<select data-call-filter="callerName"><option value="">All callers</option>${options("callerName")}</select></label><label>Callee<select data-call-filter="calleeName"><option value="">All callees</option>${options("calleeName")}</select></label><label>Status<select data-call-filter="status"><option value="">All statuses</option>${options("status")}</select></label></div><table><thead><tr><th>${heading("Time", "startTime")}</th><th>${heading("Caller", "callerName")}</th><th>${heading("Callee", "calleeName")}</th><th>${heading("Status", "status")}</th><th>${heading("Duration", "callDuration")}</th><th>${heading("Image", "image")}</th></tr></thead><tbody>${filtered.map((call) => `<tr><td>${escapeHtml(call.startTime || "")}</td><td>${escapeHtml(call.callerName || "")}</td><td>${escapeHtml(call.calleeName || "")}</td><td><span style="color:${call.isAnswer ? "#16a34a" : "#dc2626"};font-weight:700">${call.isAnswer ? "Answered" : "Missed"}</span></td><td>${escapeHtml(call.callDuration || "")}</td><td>${call.has_image ? `<button class="action activity-image-button" data-call-image="${escapeHtml(call.id)}">View</button>` : '<span class="muted">Unavailable</span>'}</td></tr>`).join("") || '<tr><td colspan="6">No matching calls.</td></tr>'}</tbody></table></div>`; }
  _activity(account) { const activity = account.activity || []; const options = (key) => [...new Set(activity.map((item) => String(item[key] || "")).filter(Boolean))].sort((a, b) => a.localeCompare(b)).map((value) => `<option value="${escapeHtml(value)}" ${this._activityFilters[key] === value ? "selected" : ""}>${escapeHtml(value)}</option>`).join(""); const filtered = activity.filter((item) => Object.entries(this._activityFilters).every(([key, value]) => !value || String(item[key] || "") === value)).sort((a, b) => String(a[this._activitySort.key] || "").localeCompare(String(b[this._activitySort.key] || "")) * (this._activitySort.direction === "asc" ? 1 : -1)); const heading = (label, key) => `<button class="sort-button ${this._activitySort.key === key ? "active" : ""}" data-activity-sort="${key}" data-direction="${this._activitySort.direction === "asc" ? "↑" : "↓"}">${label}</button>`; const thumbnail = (item) => { if (!item.has_image) return '<span class="muted">Unavailable</span>'; const imageKey = this._activityImageKey(item.CaptureTime); if (this._activityImageFailures.has(imageKey)) return '<span class="activity-thumbnail-error">Error</span>'; const image = this._activityImages.get(imageKey); const ready = image && typeof image.then !== "function"; if (!ready) return '<span class="activity-thumbnail loading" role="status" aria-label="Loading activity image"><span class="thumbnail-spinner" aria-hidden="true"></span></span>'; return `<button class="activity-thumbnail" aria-label="View activity image" data-activity-image="${escapeHtml(item.CaptureTime)}"><img alt="" src="data:${image.content_type};base64,${image.data}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 5 5"/></svg></button>`; }; return `<div class="card table-wrap"><h2>Latest activity</h2><p class="muted">Recent SmartPlus activity is retained across Home Assistant restarts and refreshed by polling.</p><div class="activity-controls"><label>Door<select data-activity-filter="Location"><option value="">All doors</option>${options("Location")}</select></label><label>Event<select data-activity-filter="CaptureType"><option value="">All events</option>${options("CaptureType")}</select></label><label>Initiator<select data-activity-filter="Initiator"><option value="">All initiators</option>${options("Initiator")}</select></label></div><table><thead><tr><th>${heading("Time", "CaptureTime")}</th><th>${heading("Door", "Location")}</th><th>${heading("Event", "CaptureType")}</th><th>${heading("Initiator", "Initiator")}</th><th>Image</th></tr></thead><tbody>${filtered.map((item) => `<tr><td>${escapeHtml(item.CaptureTime || "")}</td><td>${escapeHtml(item.Location || "")}</td><td>${escapeHtml(item.CaptureType || "")}</td><td>${escapeHtml(item.Initiator || "")}</td><td>${thumbnail(item)}</td></tr>`).join("") || '<tr><td colspan="5">No matching activity.</td></tr>'}</tbody></table></div>`; }

  _keys(account) {
    const relayOptions = (account.relays || []).map((relay) => `<label class="check"><input type="checkbox" name="relay" value="${escapeHtml(relay.mac)}|${escapeHtml(relay.relay_id)}"> ${escapeHtml(relay.name || relay.door_name)} - ${escapeHtml(relay.door_name)} (relay ${escapeHtml(relay.relay_id)})</label>`).join("");
    const keys = account.temporary_keys || [];
    const filtered = keys.filter((key) => {
      const description = String(key.description || "").toLocaleLowerCase();
      const status = key.expired ? "expired" : "active";
      return (!this._keyFilters.description || description.includes(this._keyFilters.description.toLocaleLowerCase()))
        && (!this._keyFilters.status || status === this._keyFilters.status);
    }).sort((left, right) => {
      const value = (key) => {
        if (this._keySort.key === "validity") return String(key.begin_time || "");
        if (this._keySort.key === "uses") return `${Number(key.access_times || 0)}/${Number(key.allowed_times || 0)}`;
        if (this._keySort.key === "status") return key.expired ? "Expired" : "Active";
        return String(key[this._keySort.key] || "");
      };
      return value(left).localeCompare(value(right), undefined, { numeric: true }) * (this._keySort.direction === "asc" ? 1 : -1);
    });
    const heading = (label, key) => `<button class="sort-button ${this._keySort.key === key ? "active" : ""}" data-key-sort="${key}" data-direction="${this._keySort.direction === "asc" ? "↑" : "↓"}">${label}</button>`;
    const selectionColumn = this._selectingKeys ? "<th class=\"key-select-cell\" aria-label=\"Select\"></th>" : "";
    const selectedCount = this._selectedKeyIds.size;
    const rows = filtered.map((key) => {
      const selected = this._selectedKeyIds.has(String(key.key_id));
      const selector = this._selectingKeys ? `<td class="key-select-cell"><input type="checkbox" aria-label="Select ${escapeHtml(key.description)}" data-select-key="${escapeHtml(key.key_id)}" ${selected ? "checked" : ""}></td>` : "";
      const copied = this._copiedKeyCodes.has(String(key.key_id));
      const code = copied
        ? `<span class="copied-code" role="status"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>Copied</span>`
        : `<span class="key-code"><button class="copy-code" type="button" data-copy-key-id="${escapeHtml(key.key_id)}" data-copy-key-code="${escapeHtml(key.key_code)}" aria-label="Copy code to clipboard" title="Copy code to clipboard"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/></svg></button><code>${escapeHtml(key.key_code)}</code></span>`;
      const menu = key.expired
        ? `<button class="danger key-menu-button" type="button" data-delete-key="${escapeHtml(key.key_code)}" aria-label="Delete temporary key" title="Delete temporary key"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></button>`
        : `<button class="action key-menu-button" type="button" data-key-menu="${escapeHtml(key.key_id)}" data-key-code="${escapeHtml(key.key_code)}" data-key-expired="false" data-key-has-qr="${Boolean(key.has_qr_code)}" aria-label="Key actions" aria-haspopup="menu">⋯</button>`;
      return `<tr class="${selected ? "key-row-selected" : ""}">${selector}<td>${escapeHtml(key.description)}</td><td>${code}</td><td>${escapeHtml(key.begin_time)}</td><td>${escapeHtml(key.end_time)}</td><td>${escapeHtml(key.access_times)}/${escapeHtml(key.allowed_times)}</td><td>${key.expired ? "Expired" : "Active"}</td><td><div class="key-actions">${menu}</div></td></tr>`;
    }).join("") || `<tr><td colspan="${this._selectingKeys ? 8 : 7}">No matching temporary keys found.</td></tr>`;
    return `<div class="card table-wrap"><div class="section-heading key-heading"><h2>Temporary keys</h2><div class="key-heading-actions">${selectedCount ? `<button class="danger" data-delete-selected>Delete Selected (${selectedCount})</button>` : ""}<button class="action" data-toggle-key-selection>${this._selectingKeys ? "Cancel selection" : "Select"}</button><button class="success add-key" data-create-key><span class="plus">+</span> Add Key</button></div></div><div class="activity-controls"><label>Description<input class="key-filter-input" type="search" placeholder="Filter by name" value="${escapeHtml(this._keyFilters.description)}" data-key-filter="description"></label><label>Status<select data-key-filter="status"><option value="">All keys</option><option value="active" ${this._keyFilters.status === "active" ? "selected" : ""}>Active</option><option value="expired" ${this._keyFilters.status === "expired" ? "selected" : ""}>Expired</option></select></label></div><table><thead><tr>${selectionColumn}<th>${heading("Name", "description")}</th><th>${heading("Code", "key_code")}</th><th>${heading("Valid From", "begin_time")}</th><th>${heading("Valid To", "end_time")}</th><th>${heading("Uses", "uses")}</th><th style="min-width:90px">${heading("Status", "status")}</th><th></th></tr></thead><tbody>${rows}</tbody></table><dialog data-key-dialog><h2>Create Temporary Key</h2><p class="muted">Choose the validity, usage limit, and permitted relays.</p><form data-key-form class="key-modal-form"><label><span>Key name</span><input required name="description" maxlength="100" placeholder="e.g. Cleaner access"></label><label><span>Validity period</span><input required name="begin_time" type="hidden"><input required name="end_time" type="hidden"><button type="button" class="date-range-field" data-validity-picker><span data-validity-label>Select date and time range</span><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg></button></label><label><span>Allowed uses</span><input required name="counts" type="number" min="1" value="1"></label><div class="key-relay-row"><span>Permitted relays</span><div class="relay-options">${relayOptions || '<span class="muted">No relays are available.</span>'}</div></div><div class="modal-actions"><button class="modal-action" type="submit" data-create-key-submit disabled>Create</button><button class="modal-cancel" type="button" data-close-key-dialog>Cancel</button></div></form></dialog></div>`;
  }

  _helpContent() {
    return `<div class="card help-card"><div><h2>Help &amp; Info</h2><p class="muted">Manage your SmartPlus devices, activity, calls, and temporary access from Home Assistant.</p></div><div><h3>Using this integration</h3><ul class="help-list"><li><strong>Devices</strong> lists cameras and relays. Use Open stream to view a camera, Copy RTSP to copy its credential-bearing stream URL, and Open door to operate a relay.</li><li><strong>Latest activity</strong> and <strong>Call history</strong> are refreshed by polling. Use the filters and column headings to narrow and sort the displayed records.</li><li><strong>Temporary keys</strong> lets administrators add and edit keys. Expired keys are read-only because SmartPlus does not allow them to be modified.</li><li><strong>Settings</strong> contains your connection, polling, display, and panel-access options. Keep authentication and session tokens private.</li></ul></div><div><h3>Documentation and support</h3><p><a class="help-link" href="https://github.com/nimroddolev/akuvox" target="_blank" rel="noreferrer noopener">Read the integration documentation on GitHub</a> · <a class="help-link" href="https://github.com/nimroddolev/akuvox/issues" target="_blank" rel="noreferrer noopener">Report an issue</a></p></div><div class="disclaimer"><h3>Independent-project disclaimer</h3><p>This integration is an independent community project. It is not produced by, affiliated with, sponsored by, or endorsed by Akuvox. It is provided “as is” and “as available”, without warranties of any kind. To the maximum extent permitted by applicable law, the authors and contributors disclaim all liability for losses, damage, or other claims arising from or related to its use. You are responsible for verifying its suitability and for using it safely in your environment.</p></div><div><h3>Support the project</h3><p>If this integration is useful to you, please support its development.</p><a class="bmc-banner" href="https://www.buymeacoffee.com/nimroddolev" target="_blank" rel="noreferrer noopener"><span class="bmc-banner-icon" aria-hidden="true">☕</span><span>Buy me a coffee</span></a></div></div>`;
  }

  _settingsContent() {
    if (!this._settings) return `<div class="card"><h2>Integration settings</h2><p class="muted">Loading settings…</p></div>`;
    const settings = this._settings;
    const countries = this._countryOptions.map((country) => `<option value="${escapeHtml(country.code)}" ${country.code === settings.country_code ? "selected" : ""}>${escapeHtml(country.label)}</option>`).join("");
    const subdomains = this._subdomainOptions.map((subdomain) => `<button type="button" role="option" data-subdomain-value="${escapeHtml(subdomain)}">${escapeHtml(subdomain)}</button>`).join("");
    const authTokenType = this._revealedSecrets.has("auth_token") ? "text" : "password";
    const sessionTokenType = this._revealedSecrets.has("token") ? "text" : "password";
    const authToggleLabel = this._revealedSecrets.has("auth_token") ? "Hide authentication token" : "Show authentication token";
    const sessionToggleLabel = this._revealedSecrets.has("token") ? "Hide session token" : "Show session token";
    const tokenUpdate = settings.token_update || {};
    const tokenUpdatedAt = tokenUpdate.timestamp ? new Date(tokenUpdate.timestamp) : null;
    const tokenUpdateStatus = tokenUpdatedAt && !Number.isNaN(tokenUpdatedAt.valueOf())
      ? `<p class="muted">Tokens were last ${tokenUpdate.type === "refreshed" ? "refreshed" : "modified"} on <time datetime="${escapeHtml(tokenUpdate.timestamp)}">${escapeHtml(tokenUpdatedAt.toLocaleString())}</time>.</p>`
      : "";
    return `<div class="card"><h2>Integration settings</h2><p class="muted">Changes are saved securely and reload the Akuvox account automatically.</p><form data-settings-form><div class="grid"><label>Phone country <select name="country_code">${countries}</select></label><label>Regional API subdomain <span class="combobox"><input required data-subdomain-input name="subdomain" autocomplete="off" value="${escapeHtml(settings.subdomain)}"><button type="button" class="combobox-toggle" aria-label="Show regional API subdomains" aria-haspopup="listbox" data-subdomain-toggle><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><span class="combobox-menu" role="listbox" data-subdomain-menu hidden>${subdomains}</span></span></label><label>Event screenshot delivery <select name="event_screenshot_options"><option value="asap" ${settings.event_screenshot_options === "asap" ? "selected" : ""}>As soon as available</option><option value="wait" ${settings.event_screenshot_options === "wait" ? "selected" : ""}>Wait for screenshot URLs</option></select></label><label>Polling interval (seconds) <input required name="door_log_poll_interval" type="number" min="30" max="3600" value="${escapeHtml(settings.door_log_poll_interval)}"></label><label>Maximum retry backoff (seconds) <input required name="door_log_max_backoff" type="number" min="60" max="3600" value="${escapeHtml(settings.door_log_max_backoff)}"></label></div><fieldset><legend>Panel access</legend><label class="check"><input name="panel_enabled" type="checkbox" ${settings.panel_enabled ? "checked" : ""}> Show the SmartPlus panel in the sidebar</label><label class="check"><input name="panel_admin_only" type="checkbox" ${settings.panel_admin_only ? "checked" : ""}> Restrict panel access to administrators</label></fieldset><fieldset><legend>SmartPlus credentials</legend><p class="muted">These private values are shown only to Home Assistant administrators and are never saved in config-entry data.</p><label>Authentication token <span class="secret-input"><input required autocomplete="off" name="auth_token" type="${authTokenType}" value="${escapeHtml(settings.auth_token)}"><button type="button" class="secret-toggle" data-toggle-secret="auth_token" aria-label="${authToggleLabel}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10.9 10.9 0 0 1 12 4c5.5 0 9.5 4.5 10 8-.2 1.4-1.1 3.1-2.6 4.5M6.6 6.6C4.6 8 3.3 10.2 2 12c.7 3.5 4.5 8 10 8 1.3 0 2.5-.2 3.6-.7"/></svg></button></span></label><label>Session token <span class="secret-input"><input required autocomplete="off" name="token" type="${sessionTokenType}" value="${escapeHtml(settings.token)}"><button type="button" class="secret-toggle" data-toggle-secret="token" aria-label="${sessionToggleLabel}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10.9 10.9 0 0 1 12 4c5.5 0 9.5 4.5 10 8-.2 1.4-1.1 3.1-2.6 4.5M6.6 6.6C4.6 8 3.3 10.2 2 12c.7 3.5 4.5 8 10 8 1.3 0 2.5-.2 3.6-.7"/></svg></button></span></label>${tokenUpdateStatus}</fieldset><button class="action" type="submit">Save settings</button></form></div>`;
  }

  async _loadSettings() { const entryId = this._activeAccount; try { const result = await this._hass.callWS({ type: "akuvox/panel_settings", entry_id: entryId }); if (entryId !== this._activeAccount) return; this._settings = result.settings; this._countryOptions = result.country_options || []; this._subdomainOptions = result.subdomain_options || []; this._settingsEntryId = entryId; } catch (_) { this._error = "Unable to load SmartPlus settings."; } }
  async _saveSettings(event) { event.preventDefault(); if (this._settingsSaving) return; const form = new FormData(event.target); const polling = Number(form.get("door_log_poll_interval")); const backoff = Number(form.get("door_log_max_backoff")); const subdomain = String(form.get("subdomain")).trim(); if (backoff < polling) { this._showNotice("Maximum backoff must not be shorter than the polling interval.", "Check settings"); return; } this._settingsSaving = true; try { const saved = { country_code: String(form.get("country_code")), subdomain, event_screenshot_options: String(form.get("event_screenshot_options")), door_log_poll_interval: polling, door_log_max_backoff: backoff, panel_enabled: form.get("panel_enabled") === "on", panel_admin_only: form.get("panel_admin_only") === "on", auth_token: String(form.get("auth_token")).trim(), token: String(form.get("token")).trim() }; await this._hass.callWS({ type: "akuvox/panel_save_settings", entry_id: this._activeAccount, ...saved }); this._settings = { ...this._settings, ...saved }; this._settingsDirty = false; await this._load(); this._showNotice("SmartPlus settings saved. The account is reloading."); } catch (_) { this._showNotice("The SmartPlus settings could not be saved. Check that both tokens are present and the values are valid.", "Could not save settings"); } finally { this._settingsSaving = false; } }

  async _saveSettings(event) { event.preventDefault(); if (this._settingsSaving) return; const form = new FormData(event.target); const polling = Number(form.get("door_log_poll_interval")); const backoff = Number(form.get("door_log_max_backoff")); const subdomain = String(form.get("subdomain")).trim(); if (backoff < polling) { this._showNotice("Maximum backoff must not be shorter than the polling interval.", "Check settings"); return; } this._settingsSaving = true; try { const saved = { country_code: String(form.get("country_code")), subdomain, event_screenshot_options: String(form.get("event_screenshot_options")), door_log_poll_interval: polling, door_log_max_backoff: backoff, panel_enabled: form.get("panel_enabled") === "on", panel_admin_only: form.get("panel_admin_only") === "on", mirror_activity_images: form.get("mirror_activity_images") === "on", debug_logging: form.get("debug_logging") === "on", auth_token: String(form.get("auth_token")).trim(), token: String(form.get("token")).trim() }; const result = await this._hass.callWS({ type: "akuvox/panel_save_settings", entry_id: this._activeAccount, ...saved }); this._settings = { ...this._settings, ...saved, token_update: result.token_update || this._settings?.token_update }; this._settingsDirty = false; await this._load(); this._showNotice("SmartPlus settings saved. The account is reloading."); } catch (_) { this._showNotice("The SmartPlus settings could not be saved. Check that both tokens are present and the values are valid.", "Could not save settings"); } finally { this._settingsSaving = false; } }
  async _stream(cameraName, mode) { if (mode === "open") { this._openCamera(cameraName); return; } if (!await this._confirm("This copies a credential-bearing RTSP link. Continue?", "Copy RTSP link", "Copy link")) return; try { const result = await this._callWsWithBlocker({ type:"akuvox/panel_stream", entry_id:this._activeAccount, camera_name:cameraName, confirmed:true }); if (await this._copyText(result.stream_url)) this._showNotice("RTSP link copied."); else window.prompt("Copy the RTSP link:", result.stream_url); } catch (_) { this._showNotice("The stream link could not be retrieved.", "Could not retrieve stream"); } }
  async _getActivityImage(captureTime) { const key = this._activityImageKey(captureTime); const cached = this._activityImages.get(key); if (cached !== undefined) return cached; const pending = this._hass.callWS({ type:"akuvox/panel_activity_image", entry_id:this._activeAccount, capture_time:captureTime }).then((image) => { this._activityImages.set(key, image); this._activityImageFailures.delete(key); return image; }).catch(() => { this._activityImages.delete(key); this._activityImageFailures.set(key, Date.now()); return null; }).finally(() => { if (this._activeTab === "activity" && !this._shouldDeferRender()) this._render(); }); this._activityImages.set(key, pending); return pending; }
  async _loadActivityThumbnails() { const account = this._account(); const now = Date.now(); const retryDelay = 30000; const missing = (account?.activity || []).filter((item) => { if (!item.has_image || this._activityImages.has(this._activityImageKey(item.CaptureTime))) return false; const failedAt = this._activityImageFailures.get(this._activityImageKey(item.CaptureTime)); return !failedAt || now - failedAt >= retryDelay; }); if (!missing.length) return; let next = 0; const worker = async () => { while (next < missing.length) { const item = missing[next++]; await this._getActivityImage(item.CaptureTime); if (next < missing.length) await new Promise((resolve) => window.setTimeout(resolve, 100)); } }; await Promise.all(Array.from({ length: Math.min(2, missing.length) }, worker)); if (this._activeTab === "activity" && !this._shouldDeferRender()) this._render(); }
  async _showActivityImage(captureTime) {
    const matchesFilters = (item) => Object.entries(this._activityFilters).every(
      ([key, value]) => !value || String(item[key] || "") === value
    );
    const events = (this._account()?.activity || []).filter(
      (item) => item.has_image && matchesFilters(item)
    ).sort((left, right) => String(left[this._activitySort.key] || "").localeCompare(
      String(right[this._activitySort.key] || "")
    ) * (this._activitySort.direction === "asc" ? 1 : -1));
    let index = events.findIndex((item) => item.CaptureTime === captureTime);
    if (index < 0) return;
    const dialog = this.shadowRoot.ownerDocument.createElement("dialog");
    const heading = this.shadowRoot.ownerDocument.createElement("h2");
    const picture = this.shadowRoot.ownerDocument.createElement("img");
    const details = this.shadowRoot.ownerDocument.createElement("p");
    const previous = this.shadowRoot.ownerDocument.createElement("button");
    const next = this.shadowRoot.ownerDocument.createElement("button");
    const actions = this.shadowRoot.ownerDocument.createElement("div");
    const closeButton = this.shadowRoot.ownerDocument.createElement("button");
    heading.textContent = "Activity image";
    details.className = "activity-image-details";
    previous.type = next.type = "button";
    previous.className = "activity-image-nav previous";
    next.className = "activity-image-nav next";
    previous.setAttribute("aria-label", "Previous activity image");
    next.setAttribute("aria-label", "Next activity image");
    previous.textContent = "‹";
    next.textContent = "›";
    actions.className = "modal-actions";
    closeButton.type = "button";
    closeButton.className = "modal-action";
    closeButton.textContent = "Close";
    const renderEvent = async () => {
      const event = events[index];
      const image = await this._getActivityImage(event.CaptureTime);
      if (!image || !dialog.open) return;
      picture.alt = `SmartPlus activity at ${event.CaptureTime}`;
      picture.src = `data:${image.content_type};base64,${image.data}`;
      details.textContent = `${event.Initiator || "Unknown"} - ${event.Location || "Unknown door"} - ${event.CaptureTime || "Unknown time"}`;
      previous.hidden = index === 0;
      next.hidden = index === events.length - 1;
    };
    previous.addEventListener("click", () => { if (index > 0) { index -= 1; void renderEvent(); } });
    next.addEventListener("click", () => { if (index < events.length - 1) { index += 1; void renderEvent(); } });
    closeButton.addEventListener("click", () => dialog.close());
    actions.append(closeButton);
    dialog.className = "activity-image-dialog";
    dialog.append(heading, previous, picture, next, details, actions);
    this._closeOnBackdrop(dialog);
    this._modalCount += 1;
    dialog.addEventListener("close", () => { this._modalCount -= 1; dialog.remove(); this._requestLoad(); }, { once:true });
    this.shadowRoot.append(dialog);
    dialog.showModal();
    await renderEvent();
    closeButton.focus();
  }
  _openCamera(cameraName) { const entityId = Object.entries(this._hass.states).find(([id, state]) => id.startsWith("camera.") && state.attributes.friendly_name === cameraName)?.[0]; if (!entityId) { this._showNotice("The Home Assistant camera entity was not found.", "Camera unavailable"); return; } this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true })); }
  async _copyText(text) { try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (_) { /* Fall through to the browser-compatible copy method. */ } const area = document.createElement("textarea"); area.value = text; area.style.cssText = "position:fixed;opacity:0"; document.body.append(area); area.select(); const copied = document.execCommand("copy"); area.remove(); return copied; }
  _closeOnBackdrop(dialog) { requestAnimationFrame(() => dialog.addEventListener("click", (event) => { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close(); })); }
  async _callWsWithBlocker(message) { const documentRef = this.shadowRoot.ownerDocument; const blocker = documentRef.createElement("div"); const spinner = documentRef.createElement("span"); this._blockingRequest = true; blocker.className = "page-blocker"; blocker.setAttribute("aria-busy", "true"); spinner.className = "page-blocker-spinner"; spinner.setAttribute("aria-label", "Saving"); spinner.setAttribute("role", "status"); blocker.append(spinner); this.shadowRoot.append(blocker); requestAnimationFrame(() => blocker.classList.add("visible")); try { return await this._hass.callWS(message); } finally { blocker.classList.remove("visible"); await new Promise((resolve) => window.setTimeout(resolve, 180)); blocker.remove(); this._blockingRequest = false; if (this._loadQueued) this._requestLoad(); } }
  _showNotice(message, title = "Akuvox SmartPlus") { const documentRef = this.shadowRoot.ownerDocument; const dialog = documentRef.createElement("dialog"); const heading = documentRef.createElement("h2"); const text = documentRef.createElement("p"); const actions = documentRef.createElement("div"); const closeButton = documentRef.createElement("button"); heading.textContent = title; text.textContent = message; actions.className = "modal-actions"; closeButton.type = "button"; closeButton.className = "modal-action"; closeButton.textContent = "OK"; closeButton.addEventListener("click", () => dialog.close()); actions.append(closeButton); dialog.append(heading, text, actions); this._closeOnBackdrop(dialog); this._modalCount += 1; dialog.addEventListener("close", () => { this._modalCount -= 1; dialog.remove(); this._requestLoad(); }, { once: true }); this.shadowRoot.append(dialog); dialog.showModal(); closeButton.focus(); }
  _confirm(message, title, actionLabel) { return new Promise((resolve) => { const documentRef = this.shadowRoot.ownerDocument; const dialog = documentRef.createElement("dialog"); const heading = documentRef.createElement("h2"); const text = documentRef.createElement("p"); const actions = documentRef.createElement("div"); const cancelButton = documentRef.createElement("button"); const actionButton = documentRef.createElement("button"); let confirmed = false; heading.textContent = title; text.textContent = message; actions.className = "modal-actions"; cancelButton.type = "button"; cancelButton.className = "modal-cancel"; cancelButton.textContent = "Cancel"; actionButton.type = "button"; actionButton.className = "modal-action"; actionButton.textContent = actionLabel; cancelButton.addEventListener("click", () => dialog.close()); actionButton.addEventListener("click", () => { confirmed = true; dialog.close(); }); actions.append(cancelButton, actionButton); dialog.append(heading, text, actions); this._closeOnBackdrop(dialog); this._modalCount += 1; dialog.addEventListener("close", () => { this._modalCount -= 1; dialog.remove(); this._requestLoad(); resolve(confirmed); }, { once: true }); this.shadowRoot.append(dialog); dialog.showModal(); cancelButton.focus(); }); }
  async _relay(mac, relayId) { if (!await this._confirm("Open this door relay now?", "Open door", "Open door")) return; try { await this._callWsWithBlocker({ type:"akuvox/panel_open_relay", entry_id:this._activeAccount, mac, relay_id:relayId, confirmed:true }); } catch (_) { this._showNotice("The relay could not be opened.", "Could not open door"); } }
  _applyKeyFormRowLayout(form) {
    form.querySelectorAll(":scope > label, .key-form-extra-fields > label, .readonly-key-field, .key-relay-row").forEach((row) => {
      row.style.cssText += ";display:grid;grid-template-columns:minmax(160px,30%) minmax(0,1fr);align-items:center;gap:8px;width:100%;margin-inline:auto;";
    });
    form.querySelectorAll(":scope > label > span, .key-form-extra-fields > label > span, .readonly-key-field > span, .key-relay-row > span").forEach((label) => {
      label.style.cssText += ";justify-self:start;text-align:left;color:inherit;font-weight:600;";
    });
    form.querySelectorAll(":scope > label input, .key-form-extra-fields > label input, :scope > label .date-range-field").forEach((field) => {
      field.style.cssText += ";box-sizing:border-box;width:100%;min-width:0;";
    });
    form.querySelectorAll(".readonly-key-field > strong").forEach((value) => {
      value.style.cssText += ";justify-self:start;text-align:left;";
    });
    const relayRow = form.querySelector(".key-relay-row");
    if (relayRow) {
      relayRow.style.alignItems = "start";
      const label = relayRow.querySelector(":scope > span, :scope > legend");
      if (label) label.style.cssText += ";align-self:start;text-align:left;color:inherit;font-weight:600;";
    }
  }
  _showKeyDialog() { const dialog = this.shadowRoot.querySelector("[data-key-dialog]"); if (dialog) { const form = dialog.querySelector("form"); if (!form.querySelector("[data-key-identifiers]")) { const identifiers = this.shadowRoot.ownerDocument.createElement("div"); identifiers.className = "key-form-extra-fields"; identifiers.dataset.keyIdentifiers = ""; identifiers.style.display = "contents"; identifiers.innerHTML = '<label><span>Access ID</span><input name="id_number" maxlength="100" autocomplete="off"></label><label><span>Vehicle registration</span><input name="license_plate" maxlength="100" autocomplete="off"></label><label><span>UHF card</span><input name="uhf_card" maxlength="100" autocomplete="off"></label>'; form.querySelector(".key-relay-row").before(identifiers); } this._applyKeyFormRowLayout(form); this._keyDialogOpen = true; dialog.showModal(); this._updateCreateKeyState(); } }
  _closeKeyDialog() { this.shadowRoot.querySelector("[data-key-dialog]")?.close(); }
  _updateCreateKeyState() { const form = this.shadowRoot.querySelector("[data-key-form]"); if (!form) return; const begin = new Date(String(form.querySelector('[name="begin_time"]')?.value || "")); const end = new Date(String(form.querySelector('[name="end_time"]')?.value || "")); const enabled = form.checkValidity() && Boolean(String(form.querySelector('[name="description"]')?.value || "").trim()) && !Number.isNaN(begin.valueOf()) && !Number.isNaN(end.valueOf()) && end > begin && form.querySelectorAll('[name="relay"]:checked').length > 0; form.querySelector("[data-create-key-submit]").disabled = !enabled; }
  _updateEditKeyState(form) { const save = form.querySelector("[data-edit-key-submit]"); if (save) save.disabled = !form.checkValidity(); }
  _showDateRangePicker(targetForm = this.shadowRoot.querySelector("[data-key-form]"), labelSelector = "[data-validity-label]") {
    const form = targetForm;
    const beginInput = form.querySelector('[name="begin_time"]'); const endInput = form.querySelector('[name="end_time"]');
    const iso = (date) => date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
    const now = new Date(); const currentMinute = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes()); let start = beginInput.value ? new Date(beginInput.value) : currentMinute; if (start < currentMinute) start = currentMinute; let end = endInput.value ? new Date(endInput.value) : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1); let month = new Date(start.getFullYear(), start.getMonth(), 1);
    const dialog = this.shadowRoot.ownerDocument.createElement("dialog"); dialog.className = "range-dialog";
    const render = () => {
      const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay(); const dayCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
      const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => '<span class="weekday">' + day + "</span>").join("");
      const blanks = Array.from({ length: firstDay }, () => '<span class="day empty"></span>').join("");
      const days = Array.from({ length: dayCount }, (_, index) => { const date = new Date(month.getFullYear(), month.getMonth(), index + 1); const selected = iso(date) === iso(start) || (end && iso(date) === iso(end)); const inRange = end && date > start && date < end; return '<button type="button" class="day' + (selected ? " selected" : "") + (inRange ? " in-range" : "") + '" data-range-day="' + iso(date) + '">' + (index + 1) + "</button>"; }).join("");
      dialog.innerHTML = '<h2>Select validity period</h2><p class="muted">Choose a start date, then an end date.</p><div class="range-calendar-header"><button type="button" data-range-month="-1" aria-label="Previous month">‹</button><strong>' + month.toLocaleString(undefined, { month: "long", year: "numeric" }) + '</strong><button type="button" data-range-month="1" aria-label="Next month">›</button></div><div class="range-calendar">' + weekdays + blanks + days + '</div><div class="range-times"><label>Start time <input data-range-start-time type="time" value="' + (beginInput.value.slice(11, 16) || String(currentMinute.getHours()).padStart(2, "0") + ":" + String(currentMinute.getMinutes()).padStart(2, "0")) + '"></label><label>End time <input data-range-end-time type="time" value="' + (endInput.value.slice(11, 16) || "23:59") + '"></label></div><div class="modal-actions"><button type="button" class="modal-cancel" data-range-cancel>Cancel</button><button type="button" class="modal-action" data-range-apply>Apply</button></div>';
      dialog.querySelectorAll("[data-range-month]").forEach((button) => button.addEventListener("click", () => { month = new Date(month.getFullYear(), month.getMonth() + Number(button.dataset.rangeMonth), 1); render(); }));
      dialog.querySelectorAll("[data-range-day]").forEach((button) => button.addEventListener("click", () => { let chosen = new Date(button.dataset.rangeDay + "T00:00:00"); if (chosen < currentMinute) chosen = currentMinute; if (end || chosen < start) { start = chosen; end = null; } else { end = chosen; } render(); }));
      dialog.querySelector("[data-range-cancel]").addEventListener("click", () => dialog.close());
      dialog.querySelector("[data-range-apply]").addEventListener("click", () => { if (!start || !end) return; let selectedStart = new Date(iso(start) + "T" + dialog.querySelector("[data-range-start-time]").value); if (selectedStart < currentMinute) selectedStart = currentMinute; const selectedEnd = new Date(iso(end) + "T" + dialog.querySelector("[data-range-end-time]").value); if (selectedEnd <= selectedStart) { this._showNotice("The end of the validity period must be after the current start time.", "Choose a later end time"); return; } beginInput.value = iso(selectedStart) + "T" + String(selectedStart.getHours()).padStart(2, "0") + ":" + String(selectedStart.getMinutes()).padStart(2, "0"); endInput.value = iso(selectedEnd) + "T" + dialog.querySelector("[data-range-end-time]").value; form.querySelector(labelSelector).textContent = selectedStart.toLocaleDateString() + " " + beginInput.value.slice(11, 16) + " – " + selectedEnd.toLocaleDateString() + " " + endInput.value.slice(11, 16); if (form.matches("[data-key-form]")) this._updateCreateKeyState(); dialog.close(); });
    };
    render(); this._closeOnBackdrop(dialog); dialog.addEventListener("close", () => dialog.remove(), { once: true }); this.shadowRoot.append(dialog); dialog.showModal();
  }
  async _createKey(event) { event.preventDefault(); const form = new FormData(event.target); const selected = form.getAll("relay"); const description = String(form.get("description")).trim(); if (!description) { this._showNotice("Enter a name for the temporary key.", "Key name required"); return; } if (!form.get("begin_time") || !form.get("end_time")) { this._showNotice("Choose a validity period before creating the key.", "Validity period required"); return; } if (!selected.length) { this._showNotice("Select at least one relay.", "Relay required"); return; } const devs = new Map(); selected.forEach((value) => { const [mac, relay] = value.split("|"); devs.set(mac, [...(devs.get(mac) || []), relay]); }); const begin = String(form.get("begin_time")).replace("T", " ") + ":00"; const end = String(form.get("end_time")).replace("T", " ") + ":00"; const count = Number(form.get("counts")); try { await this._callWsWithBlocker({ type:"akuvox/panel_create_temp_key", entry_id:this._activeAccount, description, begin_time:begin, end_time:end, counts:count, id_number:String(form.get("id_number") || "").trim(), license_plate:String(form.get("license_plate") || "").trim(), uhf_card:String(form.get("uhf_card") || "").trim(), dev_list:[...devs].map(([mac, relays]) => ({ mac, relay:relays.join(";") })), confirmed:true }); this._closeKeyDialog(); await this._load(); } catch (_) { this._showNotice("The temporary key could not be created. Check the Home Assistant log for the SmartPlus response.", "Could not create temporary key"); } }
  _showEditKeyDialog(keyId) {
    const account = this._account();
    const key = account?.temporary_keys?.find((item) => String(item.key_id) === String(keyId));
    if (!key) return;
    const toInput = (value) => {
      const match = String(value).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})|(?:\d{2})-(\d{2})-(\d{4})[ T](\d{2}:\d{2})/);
      return match ? (match[1] ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}` : `${match[7]}-${match[6]}-${match[5]}T${match[8]}`) : "";
    };
    const selected = new Set((key.doors || []).map((door) => `${door.mac}|${door.relay}`));
    const relays = (account.relays || []).map((relay) => `<label class="check"><input type="checkbox" disabled ${selected.has(`${relay.mac}|${relay.relay_id}`) ? "checked" : ""}> ${escapeHtml(relay.name || relay.door_name)} - ${escapeHtml(relay.door_name)} (relay ${escapeHtml(relay.relay_id)})</label>`).join("");
    const beginTime = toInput(key.begin_time);
    const endTime = toInput(key.end_time);
    const displayPeriod = beginTime && endTime ? `${new Date(beginTime).toLocaleDateString()} ${beginTime.slice(11, 16)} – ${new Date(endTime).toLocaleDateString()} ${endTime.slice(11, 16)}` : "Select date and time range";
    const dialog = this.shadowRoot.ownerDocument.createElement("dialog");
    dialog.innerHTML = `<h2>Edit Temporary Key</h2><p class="muted">Update optional access identifiers.</p><form><input required name="begin_time" type="hidden" value="${escapeHtml(beginTime)}"><input required name="end_time" type="hidden" value="${escapeHtml(endTime)}"><div class="readonly-key-fields"><div class="readonly-key-field"><span>Key name</span><strong>${escapeHtml(key.description)}</strong></div><div class="readonly-key-field"><span>Validity period</span><strong>${escapeHtml(displayPeriod)}</strong></div><div class="readonly-key-field"><span>Allowed uses</span><strong>${escapeHtml(key.allowed_times || 1)}</strong></div></div><div class="grid"><label>Access ID <input name="id_number" maxlength="100" autocomplete="off" value="${escapeHtml(key.id_number || "")}"></label><label>Vehicle registration <input name="license_plate" maxlength="100" autocomplete="off" value="${escapeHtml(key.license_plate || "")}"></label><label>UHF card <input name="uhf_card" maxlength="100" autocomplete="off" value="${escapeHtml(key.uhf_card || "")}"></label></div><div class="key-relay-row"><span>Permitted relays</span><div class="relay-options">${relays || '<span class="muted">No relays are available.</span>'}</div></div><div class="modal-actions"><button class="danger" type="button" data-edit-delete>Delete</button><button class="modal-cancel" type="button" data-edit-cancel>Cancel</button><button class="modal-action" type="submit">Save</button></div></form>`;
    const form = dialog.querySelector("form");
    form.className = "key-modal-form";
    const readOnlyFields = dialog.querySelector(".readonly-key-fields");
    if (readOnlyFields) readOnlyFields.style.display = "contents";
    const identifierFields = dialog.querySelector(".grid");
    identifierFields?.classList.replace("grid", "key-form-extra-fields");
    if (identifierFields) identifierFields.style.display = "contents";
    form.querySelectorAll(".key-form-extra-fields > label").forEach((label) => {
      const textNode = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      if (!textNode) return;
      const caption = this.shadowRoot.ownerDocument.createElement("span");
      caption.textContent = textNode.textContent.trim();
      textNode.replaceWith(caption);
    });
    this._applyKeyFormRowLayout(form);
    dialog.querySelector("[data-edit-delete]")?.remove();
    const saveButton = form.querySelector('[type="submit"]');
    saveButton.dataset.editKeySubmit = "";
    dialog.querySelector("[data-edit-cancel]").addEventListener("click", () => dialog.close());
    form.addEventListener("input", () => this._updateEditKeyState(form));
    form.addEventListener("change", () => this._updateEditKeyState(form));
    this._updateEditKeyState(form);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = new FormData(form);
      const grouped = new Map();
      (key.doors || []).forEach((door) => grouped.set(String(door.mac), [...(grouped.get(String(door.mac)) || []), String(door.relay)]));
      if (!grouped.size) { this._showNotice("No permitted relay data is available for this key.", "Relay data unavailable"); return; }
      const saveWidth = saveButton.getBoundingClientRect().width;
      saveButton.style.width = `${saveWidth}px`;
      saveButton.disabled = true;
      saveButton.setAttribute("aria-label", "Saving temporary key");
      saveButton.innerHTML = '<span role="status" aria-label="Saving" style="display:inline-block;width:16px;height:16px;border:2px solid #ffffff80;border-top-color:#fff;border-radius:50%;animation:page-blocker-spin .8s linear infinite"></span>';
      try {
        await this._callWsWithBlocker({ type:"akuvox/panel_edit_temp_key", entry_id:this._activeAccount, key_id:String(key.key_id), description:String(key.description), begin_time:String(values.get("begin_time")).replace("T", " ") + ":00", end_time:String(values.get("end_time")).replace("T", " ") + ":00", counts:Number(key.allowed_times || 1), id_number:String(values.get("id_number") || "").trim(), license_plate:String(values.get("license_plate") || "").trim(), uhf_card:String(values.get("uhf_card") || "").trim(), dev_list:[...grouped].map(([mac, relays]) => ({mac, relay:relays.join(";")})) });
        dialog.close(); await this._load();
      } catch (error) {
        saveButton.style.width = "";
        saveButton.disabled = false;
        saveButton.removeAttribute("aria-label");
        saveButton.textContent = "Save";
        this._showNotice(error?.message || "The temporary key could not be saved. Check the Home Assistant log for the SmartPlus response.", "Could not save temporary key");
      }
    });
    this._closeOnBackdrop(dialog); this._modalCount += 1;
    dialog.addEventListener("close", () => { this._modalCount -= 1; dialog.remove(); this._requestLoad(); }, {once:true});
    this.shadowRoot.append(dialog); dialog.showModal();
  }
  async _deleteSelectedKeys() { const keys = (this._account()?.temporary_keys || []).filter((key) => this._selectedKeyIds.has(String(key.key_id))); if (!keys.length) return; if (!await this._confirm(`Permanently delete ${keys.length} selected temporary ${keys.length === 1 ? "key" : "keys"}?`, "Delete selected temporary keys", "Delete selected")) return; try { for (const key of keys) await this._callWsWithBlocker({ type:"akuvox/panel_delete_temp_key", entry_id:this._activeAccount, temp_key:String(key.key_code), confirmed:true }); this._selectedKeyIds.clear(); this._selectingKeys = false; await this._load(); } catch (_) { this._showNotice("One or more temporary keys could not be deleted. The keys deleted before the error remain deleted.", "Could not delete selected keys"); await this._load(); } }
  _closeKeyActionsMenu() {
    this._keyActionsMenu?.remove();
    this._keyActionsMenu = undefined;
    this._keyActionsMenuAbort?.abort();
    this._keyActionsMenuAbort = undefined;
  }
  _showKeyActionsMenu(trigger, event) {
    event.stopPropagation();
    const keyId = trigger.dataset.keyMenu;
    const keyCode = trigger.dataset.keyCode;
    const expired = trigger.dataset.keyExpired === "true";
    const hasQrCode = trigger.dataset.keyHasQr === "true";
    if (!keyId || !keyCode) return;
    if (this._keyActionsMenu?.dataset.keyId === keyId) { this._closeKeyActionsMenu(); return; }
    this._closeKeyActionsMenu();
    const documentRef = this.shadowRoot.ownerDocument;
    const menu = documentRef.createElement("div");
    const bounds = trigger.getBoundingClientRect();
    menu.dataset.keyId = keyId;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Temporary key actions");
    menu.style.cssText = `position:fixed;z-index:10001;top:${bounds.bottom + 8}px;left:12px;width:max-content;max-width:calc(100vw - 24px);padding:8px;border:1px solid var(--divider-color,#d1d5db);border-radius:14px;background:var(--card-background-color,#fff);box-shadow:0 14px 32px #0003;`;
    menu.innerHTML = `${!expired && hasQrCode ? `<button type="button" role="menuitem" data-menu-qr><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg><span>QR Code</span></button>` : ""}${!expired ? `<button type="button" role="menuitem" data-menu-edit><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.1-.8L19 8.3 15.7 5 4.8 15.9 4 20Z"/><path d="m13.9 6.8 3.3 3.3"/></svg><span>Edit</span></button>` : ""}<button type="button" role="menuitem" data-menu-delete class="delete-action"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg><span>Delete</span></button>`;
    menu.querySelectorAll("button").forEach((button) => {
      button.style.cssText = "display:flex;align-items:center;gap:10px;width:100%;border:0;border-radius:9px;padding:11px 12px;color:inherit;background:transparent;font:600 14px/1.3 inherit;text-align:left;white-space:nowrap;";
      button.addEventListener("mouseenter", () => {
        if (button.disabled) return;
        button.style.background = button.classList.contains("delete-action") ? "#dc2626" : "#55bfe6";
        if (button.classList.contains("delete-action")) button.style.color = "#fff";
      });
      button.addEventListener("mouseleave", () => {
        button.style.background = "transparent";
        if (button.classList.contains("delete-action")) button.style.color = "var(--error-color,#dc2626)";
      });
    });
    menu.querySelectorAll("svg").forEach((icon) => { icon.style.cssText = "width:19px;height:19px;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:2;"; });
    menu.querySelector(".delete-action").style.color = "var(--error-color,#dc2626)";
    menu.querySelector("[data-menu-qr]")?.addEventListener("click", () => { this._closeKeyActionsMenu(); this._showTemporaryKeyQr(keyId); });
    menu.querySelector("[data-menu-edit]")?.addEventListener("click", () => { this._closeKeyActionsMenu(); this._showEditKeyDialog(keyId); });
    menu.querySelector("[data-menu-delete]")?.addEventListener("click", () => { this._closeKeyActionsMenu(); this._deleteKey(keyCode); });
    const abort = new AbortController();
    documentRef.addEventListener("pointerdown", (outsideEvent) => {
      const clickPath = outsideEvent.composedPath();
      if (!clickPath.includes(menu) && !clickPath.includes(trigger)) this._closeKeyActionsMenu();
    }, { capture:true, signal:abort.signal });
    documentRef.addEventListener("keydown", (keyEvent) => { if (keyEvent.key === "Escape") this._closeKeyActionsMenu(); }, { signal:abort.signal });
    this._keyActionsMenu = menu;
    this._keyActionsMenuAbort = abort;
    documentRef.body.append(menu);
    const menuWidth = menu.getBoundingClientRect().width;
    menu.style.left = `${Math.max(12, Math.min(bounds.right - menuWidth, window.innerWidth - menuWidth - 12))}px`;
  }
  async _deleteKey(tempKey) { const key = this._account()?.temporary_keys?.find((item) => item.key_code === tempKey); const name = key?.description || tempKey; if (!await this._confirm(`Permanently delete temporary key ${name}?`, "Delete temporary key", "Delete key")) return; try { await this._callWsWithBlocker({ type:"akuvox/panel_delete_temp_key", entry_id:this._activeAccount, temp_key:tempKey, confirmed:true }); await this._load(); } catch (_) { this._showNotice("The temporary key could not be deleted.", "Could not delete temporary key"); } }
  async _showCallImage(callId) {
    try {
      const image = await this._hass.callWS({ type:"akuvox/panel_call_image", entry_id:this._activeAccount, call_id:callId });
      const dialog = this.shadowRoot.ownerDocument.createElement("dialog");
      const picture = this.shadowRoot.ownerDocument.createElement("img");
      const close = this.shadowRoot.ownerDocument.createElement("button");
      dialog.className = "activity-image-dialog";
      picture.src = `data:${image.content_type};base64,${image.data}`;
      picture.alt = "SmartPlus call image";
      close.className = "modal-action";
      close.textContent = "Close";
      close.addEventListener("click", () => dialog.close());
      dialog.append(picture, close);
      this._closeOnBackdrop(dialog);
      this._modalCount += 1;
      dialog.addEventListener("close", () => { this._modalCount -= 1; dialog.remove(); this._requestLoad(); }, {once:true});
      this.shadowRoot.append(dialog);
      dialog.showModal();
    } catch (_) { this._showNotice("The SmartPlus call image could not be retrieved.", "Image unavailable"); }
  }
  async _showTemporaryKeyQr(keyId) {
    try {
      const key = this._account()?.temporary_keys?.find((item) => String(item.key_id) === String(keyId));
      const image = await this._hass.callWS({ type:"akuvox/panel_temp_key_qr", entry_id:this._activeAccount, key_id:keyId });
      const documentRef = this.shadowRoot.ownerDocument;
      const dialog = documentRef.createElement("dialog");
      const heading = documentRef.createElement("h2");
      const picture = documentRef.createElement("img");
      const actions = documentRef.createElement("div");
      const save = documentRef.createElement("button");
      const close = documentRef.createElement("button");
      const imageUrl = `data:${image.content_type};base64,${image.data}`;
      const extension = image.content_type === "image/jpeg" ? "jpg" : image.content_type === "image/webp" ? "webp" : "png";
      const fileName = `akuvox-temporary-key-${String(key?.key_code || keyId).replace(/[^a-z0-9_-]/gi, "-")}.${extension}`;
      dialog.className = "activity-image-dialog temporary-key-qr-dialog";
      heading.textContent = `${key?.description || "Temporary key"} QR code`;
      picture.src = imageUrl;
      picture.alt = heading.textContent;
      actions.className = "modal-actions";
      save.className = "modal-action modal-icon";
      save.type = "button";
      save.setAttribute("aria-label", "Download QR code");
      save.title = "Download QR code";
      save.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 21h14v-4"/></svg>';
      save.addEventListener("click", () => { const download = documentRef.createElement("a"); download.href = imageUrl; download.download = fileName; documentRef.body.append(download); download.click(); download.remove(); });
      close.className = "modal-cancel";
      close.type = "button";
      close.textContent = "Close";
      close.addEventListener("click", () => dialog.close());
      actions.append(save, close);
      dialog.append(heading, picture, actions);
      this._closeOnBackdrop(dialog);
      this._modalCount += 1;
      dialog.addEventListener("close", () => { this._modalCount -= 1; dialog.remove(); this._requestLoad(); }, {once:true});
      this.shadowRoot.append(dialog);
      dialog.showModal();
    } catch (_) { this._showNotice("The temporary key QR code could not be retrieved.", "QR code unavailable"); }
  }
}
if (!customElements.get(PANEL_TAG)) {
  customElements.define(PANEL_TAG, AkuvoxSmartPlusPanel);
}
