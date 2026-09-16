import { escapeHtml, closeOnBackdrop, applyKeyFormRowLayout } from "../utils/dom.js";
import {
  bindMultiSelectFilters,
  matchesSelectedFilter,
  renderMultiSelectFilter,
} from "../utils/multi-select-filter.js?v=20260827-multi-table-filters";
import { icons } from "../utils/icons.js";
import {
  parseDateTimeInput,
  normaliseUhfCard,
  LICENSE_PLATE_PATTERN,
  LICENSE_PLATE_TITLE,
  LICENSE_PLATE_REGEX,
  LICENSE_PLATE_ERROR_MSG,
  UHF_CARD_PATTERN,
  UHF_CARD_TITLE,
  UHF_CARD_REGEX,
  UHF_CARD_ERROR_MSG,
  tableTimestampFormatter,
} from "../utils/formatters.js?v=20260820-table-timestamps";
import { copyText } from "../utils/clipboard.js";
import { showNotice, confirmModal, callWsWithBlocker } from "../components/dialogs.js";
import { showDateRangePicker } from "../components/date-range-picker.js?v=20260823-normalise-past-validity-start";
import { showTemporaryKeyQrDialog } from "../components/qr-dialog.js";
import { showKeyActionsMenu, closeKeyActionsMenu } from "../components/key-menu.js";
import { bindTileOrdering } from "../utils/tile-ordering.js?v=20260915-manual-key-sort";

/**
 * Update visibility of validation error messages under vehicle registration and UHF card fields.
 * @param {HTMLFormElement} form
 */
export const updateFormFieldErrors = (form) => {
  if (!form) return;

  const licenseInput = form.querySelector('[name="license_plate"]');
  const licenseError = form.querySelector('[data-error-for="license_plate"]');
  if (licenseInput && licenseError) {
    const value = licenseInput.value;
    const isInvalid =
      value.length > 0 &&
      (!licenseInput.checkValidity() || !LICENSE_PLATE_REGEX.test(value));
    licenseError.hidden = !isInvalid;
  }

  const uhfInput = form.querySelector('[name="uhf_card"]');
  const uhfError = form.querySelector('[data-error-for="uhf_card"]');
  if (uhfInput && uhfError) {
    const value = uhfInput.value;
    const isInvalid =
      value.length > 0 && (!uhfInput.checkValidity() || !UHF_CARD_REGEX.test(value));
    uhfError.hidden = !isInvalid;
  }
};

/**
 * Render HTML content for the Temporary Keys tab.
 * @param {HTMLElement} host
 * @param {object} account
 * @returns {string}
 */
export const renderKeysView = (host, account) => {
  const relayOptions = (account.relays || [])
    .map(
      (relay) => `
      <label class="check">
        <input type="checkbox" name="relay" value="${escapeHtml(relay.mac)}|${escapeHtml(relay.relay_id)}">
        ${escapeHtml(relay.name || relay.door_name)} - ${escapeHtml(relay.door_name)} (relay ${escapeHtml(relay.relay_id)})
      </label>
    `
    )
    .join("");

  const keys = account.temporary_keys || [];
  const isManualTileOrder =
    host._rowViewMode === "tiles" &&
    (host._keySort.key === "manual" ||
      (host._keyTileSortMode !== "sorted" && host._hasTileOrder("keys")));
  let filtered = keys
    .filter((key) => {
      const description = String(key.description || "").toLocaleLowerCase();
      const status = key.expired ? "expired" : "active";
      return (
        (!host._keyFilters.description ||
          description.includes(host._keyFilters.description.toLocaleLowerCase())) &&
        matchesSelectedFilter(host._keyFilters.status, status)
      );
    })
    .sort((left, right) => {
      if (isManualTileOrder) return 0;
      const getValue = (key) => {
        if (host._keySort.key === "manual") return String(key.description || "");
        if (host._keySort.key === "validity") return String(key.begin_time || "");
        if (host._keySort.key === "uses") {
          return `${Number(key.access_times || 0)}/${Number(key.allowed_times || 0)}`;
        }
        if (host._keySort.key === "status") return key.expired ? "Expired" : "Active";
        return String(key[host._keySort.key] || "");
      };
      return (
        getValue(left).localeCompare(getValue(right), undefined, { numeric: true }) *
        (host._keySort.direction === "asc" ? 1 : -1)
      );
    });

  if (isManualTileOrder) {
    filtered = host._orderTiles("keys", filtered, (key) => key.key_id);
  }

  const heading = (label, key) =>
    `<button class="sort-button ${host._keySort.key === key ? "active" : ""}" data-key-sort="${key}" data-direction="${host._keySort.direction === "asc" ? "↑" : "↓"}">${label}</button>`;
  const formatTimestamp = tableTimestampFormatter(
    filtered.flatMap((key) => [key.begin_time, key.end_time])
  );

  const selectionColumn = host._selectingKeys
    ? '<th class="key-select-cell" aria-label="Select"></th>'
    : "";
  const selectedCount = host._selectedKeyIds.size;

  const rows = filtered
    .map((key) => {
      const selected = host._selectedKeyIds.has(String(key.key_id));
      const selector = host._selectingKeys
        ? `<td class="key-select-cell"><input type="checkbox" aria-label="Select ${escapeHtml(key.description)}" data-select-key="${escapeHtml(key.key_id)}" ${selected ? "checked" : ""}></td>`
        : "";
      const copied = host._copiedKeyCodes.has(String(key.key_id));
      const code = copied
        ? `<span class="copied-code" role="status">${icons.check}Copied</span>`
        : `<span class="key-code"><button class="copy-code" type="button" data-copy-key-id="${escapeHtml(key.key_id)}" data-copy-key-code="${escapeHtml(key.key_code)}" aria-label="Copy code to clipboard" title="Copy code to clipboard">${icons.copy}</button><code>${escapeHtml(key.key_code)}</code></span>`;
      const menu = key.expired
        ? `<button class="danger key-menu-button" type="button" data-delete-key="${escapeHtml(key.key_id)}" aria-label="Delete temporary key" title="Delete temporary key">${icons.trash}</button>`
        : `<button class="action key-menu-button" type="button" data-key-menu="${escapeHtml(key.key_id)}" data-key-code="${escapeHtml(key.key_code)}" data-key-expired="false" data-key-has-qr="${Boolean(key.has_qr_code)}" aria-label="Key actions" aria-haspopup="menu">⋯</button>`;

      return `
        <tr class="${selected ? "key-row-selected" : ""}">
          ${selector}
          <td>${escapeHtml(key.description)}</td>
          <td>${code}</td>
          <td>${escapeHtml(formatTimestamp(key.begin_time))}</td>
          <td>${escapeHtml(formatTimestamp(key.end_time))}</td>
          <td>${escapeHtml(key.access_times)}/${escapeHtml(key.allowed_times)}</td>
          <td>${key.expired ? "Expired" : "Active"}</td>
          <td><div class="key-actions">${menu}</div></td>
        </tr>
      `;
    })
    .join("") ||
    `<tr><td colspan="${host._selectingKeys ? 8 : 7}">No matching temporary keys found.</td></tr>`;

  const keyTiles = filtered
    .map((key) => {
      const selected = host._selectedKeyIds.has(String(key.key_id));
      const copied = host._copiedKeyCodes.has(String(key.key_id));
      const code = copied
        ? `<span class="copied-code" role="status">${icons.check}Copied</span>`
        : `<span class="key-code"><button class="copy-code" type="button" data-copy-key-id="${escapeHtml(key.key_id)}" data-copy-key-code="${escapeHtml(key.key_code)}" aria-label="Copy code to clipboard" title="Copy code to clipboard">${icons.copy}</button><code>${escapeHtml(key.key_code)}</code></span>`;
      const menu = key.expired
        ? `<button class="danger key-menu-button" type="button" data-delete-key="${escapeHtml(key.key_id)}" aria-label="Delete temporary key" title="Delete temporary key">${icons.trash}</button>`
        : `<button class="action key-menu-button" type="button" data-key-menu="${escapeHtml(key.key_id)}" data-key-code="${escapeHtml(key.key_code)}" data-key-expired="false" data-key-has-qr="${Boolean(key.has_qr_code)}" aria-label="Key actions" aria-haspopup="menu">⋯</button>`;
      return `
        <article class="tile-card key-tile ${key.expired ? "key-tile-expired" : "key-tile-active"} ${selected ? "key-row-selected" : ""}" data-tile-order-id="${escapeHtml(key.key_id)}">
          <div class="tile-card-heading">
            <div>
              <div class="tile-title"><button type="button" class="tile-grab" data-tile-grab aria-label="Reorder ${escapeHtml(key.description)}" title="Drag to reorder">⠿</button><h3>${escapeHtml(key.description)}</h3></div>
              <span class="key-status ${key.expired ? "expired" : "active"}">${key.expired ? "Expired" : "Active"}</span>
            </div>
            <div class="key-actions">
              ${host._selectingKeys ? `<input class="key-tile-select" type="checkbox" aria-label="Select ${escapeHtml(key.description)}" data-select-key="${escapeHtml(key.key_id)}" ${selected ? "checked" : ""}>` : ""}
              ${menu}
            </div>
          </div>
          <dl class="tile-details">
            <div><dt>Code</dt><dd>${code}</dd></div>
            <div><dt>Valid from</dt><dd>${escapeHtml(formatTimestamp(key.begin_time))}</dd></div>
            <div><dt>Valid to</dt><dd>${escapeHtml(formatTimestamp(key.end_time))}</dd></div>
            <div><dt>Uses</dt><dd>${escapeHtml(key.access_times)}/${escapeHtml(key.allowed_times)}</dd></div>
          </dl>
        </article>
      `;
    })
    .join("") || '<p>No matching temporary keys found.</p>';

  return `
    <div class="card table-wrap">
      <div class="section-heading key-heading">
        <h2>Temporary keys</h2>
        <div class="key-heading-actions">
          ${selectedCount ? `<button type="button" class="danger" data-delete-selected>Delete Selected (${selectedCount})</button>` : ""}
          <button type="button" class="action" data-toggle-key-selection>${host._selectingKeys ? "Cancel selection" : "Select"}</button>
          <button class="success add-key" data-create-key><span class="plus">+</span> Add Key</button>
          <div class="view-mode-toggle" role="group" aria-label="Temporary keys layout">
            <button type="button" class="action ${host._rowViewMode === "tiles" ? "" : "active"}" data-row-view-mode="table" aria-pressed="${host._rowViewMode !== "tiles"}">Table</button>
            <button type="button" class="action ${host._rowViewMode === "tiles" ? "active" : ""}" data-row-view-mode="tiles" aria-pressed="${host._rowViewMode === "tiles"}">Tiles</button>
          </div>
        </div>
      </div>
      <div class="activity-controls">
        <label>
          Description
          <input class="key-filter-input" type="search" placeholder="Filter by name" value="${escapeHtml(host._keyFilters.description)}" data-key-filter="description">
        </label>
        ${renderMultiSelectFilter({ scope: "key", key: "status", label: "Status", allLabel: "All keys", values: ["active", "expired"], selected: host._keyFilters.status, openMenu: host._openFilterMenu })}
        ${host._rowViewMode === "tiles" ? `<div class="tile-sort-control"><label>Sort by<select data-key-tile-sort><option value="manual" ${isManualTileOrder ? "selected" : ""}>Manual</option><option value="description" ${!isManualTileOrder && host._keySort.key === "description" ? "selected" : ""}>Name</option><option value="key_code" ${!isManualTileOrder && host._keySort.key === "key_code" ? "selected" : ""}>Code</option><option value="validity" ${!isManualTileOrder && host._keySort.key === "validity" ? "selected" : ""}>Valid from</option><option value="uses" ${!isManualTileOrder && host._keySort.key === "uses" ? "selected" : ""}>Uses</option><option value="status" ${!isManualTileOrder && host._keySort.key === "status" ? "selected" : ""}>Status</option></select></label><button type="button" class="tile-sort-direction" data-key-tile-sort-direction aria-label="Sort ${host._keySort.direction === "asc" ? "ascending" : "descending"}" title="Sort ${host._keySort.direction === "asc" ? "ascending" : "descending"}" ${isManualTileOrder ? "disabled" : ""}>${host._keySort.direction === "asc" ? "↑" : "↓"}</button></div>` : ""}
      </div>
      ${host._rowViewMode === "tiles" ? `<div class="tile-grid key-tile-grid" data-tile-grid="keys">${keyTiles}</div>` : `<table>
        <thead>
          <tr>
            ${selectionColumn}
            <th>${heading("Name", "description")}</th>
            <th>${heading("Code", "key_code")}</th>
            <th>${heading("Valid From", "begin_time")}</th>
            <th>${heading("Valid To", "end_time")}</th>
            <th>${heading("Uses", "uses")}</th>
            <th style="min-width:90px">${heading("Status", "status")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`}

      <dialog data-key-dialog>
        <h2>Create Temporary Key</h2>
        <p class="muted">Choose the validity, usage limit, and permitted relays.</p>
        <form data-key-form class="key-modal-form">
          <label>
            <span>Key name<sup class="required-asterisk">*</sup></span>
            <input required name="description" maxlength="100" placeholder="e.g. Cleaner access">
          </label>
          <label>
            <span>Validity period<sup class="required-asterisk">*</sup></span>
            <input required name="begin_time" type="hidden">
            <input required name="end_time" type="hidden">
            <button type="button" class="date-range-field" data-validity-picker>
              <span data-validity-label>Select date and time range</span>
              ${icons.calendar}
            </button>
          </label>
          <label>
            <span>Allowed uses<sup class="required-asterisk">*</sup></span>
            <input required name="counts" type="number" min="1" value="1">
          </label>
          <div class="key-relay-row">
            <span>Permitted relays<sup class="required-asterisk">*</sup></span>
            <div class="relay-options">
              ${relayOptions || '<span class="muted">No relays are available.</span>'}
            </div>
          </div>
          <div class="modal-actions">
            <button class="modal-action" type="submit" data-create-key-submit disabled>
              <span data-create-key-label>Create</span><span class="key-create-spinner" data-create-key-spinner hidden aria-hidden="true"></span>
            </button>
            <button class="modal-cancel" type="button" data-close-key-dialog>Cancel</button>
          </div>
        </form>
      </dialog>
    </div>
  `;
};

/**
 * Update submit button state on the Create Key form based on field validity.
 * @param {HTMLElement} host
 */
const updateCreateKeyState = (host) => {
  const form = host.shadowRoot.querySelector("[data-key-form]");
  if (!form) return;
  if (form.dataset.creating === "true") return;
  updateFormFieldErrors(form);

  const begin = new Date(String(form.querySelector('[name="begin_time"]')?.value || ""));
  const end = new Date(String(form.querySelector('[name="end_time"]')?.value || ""));
  const licensePlate = form.querySelector('[name="license_plate"]')?.value || "";
  const uhfCard = form.querySelector('[name="uhf_card"]')?.value || "";

  const enabled =
    form.checkValidity() &&
    Boolean(String(form.querySelector('[name="description"]')?.value || "").trim()) &&
    !Number.isNaN(begin.valueOf()) &&
    !Number.isNaN(end.valueOf()) &&
    end > begin &&
    LICENSE_PLATE_REGEX.test(licensePlate) &&
    UHF_CARD_REGEX.test(uhfCard) &&
    form.querySelectorAll('[name="relay"]:checked').length > 0;
  const submitBtn = form.querySelector("[data-create-key-submit]");
  if (submitBtn) submitBtn.disabled = !enabled;
};

/**
 * Open the Create Key modal dialog.
 * @param {HTMLElement} host
 */
const showCreateKeyDialog = (host) => {
  const dialog = host.shadowRoot.querySelector("[data-key-dialog]");
  if (!dialog) return;

  const form = dialog.querySelector("form");
  if (!form.querySelector("[data-key-identifiers]")) {
    const identifiers = host.shadowRoot.ownerDocument.createElement("div");
    identifiers.className = "key-form-extra-fields";
    identifiers.dataset.keyIdentifiers = "";
    identifiers.style.display = "contents";
    identifiers.innerHTML = `
      <label><span>Access ID</span><input name="id_number" maxlength="100" autocomplete="off"></label>
      <label>
        <span>Vehicle registration</span>
        <span class="field-input-wrap">
          <input name="license_plate" maxlength="16" pattern="${LICENSE_PLATE_PATTERN}" title="${LICENSE_PLATE_TITLE}" autocomplete="off">
          <span class="field-error" data-error-for="license_plate" hidden>${LICENSE_PLATE_ERROR_MSG}</span>
        </span>
      </label>
      <label>
        <span>UHF card</span>
        <span class="field-input-wrap">
          <input name="uhf_card" maxlength="24" pattern="${UHF_CARD_PATTERN}" title="${UHF_CARD_TITLE}" autocomplete="off">
          <span class="field-error" data-error-for="uhf_card" hidden>${UHF_CARD_ERROR_MSG}</span>
        </span>
      </label>
    `;
    form.querySelector(".key-relay-row").before(identifiers);
  }

  applyKeyFormRowLayout(form);
  host._keyDialogOpen = true;
  dialog.showModal();
  updateCreateKeyState(host);
};

/**
 * Open the Edit Key modal dialog.
 * @param {HTMLElement} host
 * @param {string} keyId
 */
export const showEditKeyDialog = (host, keyId) => {
  const account = host._account();
  const key = account?.temporary_keys?.find((item) => String(item.key_id) === String(keyId));
  if (!key) return;

  const selected = new Set((key.doors || []).map((door) => `${door.mac}|${door.relay}`));
  const relays = (account.relays || [])
    .map(
      (relay) => `
      <label class="check">
        <input type="checkbox" disabled ${selected.has(`${relay.mac}|${relay.relay_id}`) ? "checked" : ""}>
        ${escapeHtml(relay.name || relay.door_name)} - ${escapeHtml(relay.door_name)} (relay ${escapeHtml(relay.relay_id)})
      </label>
    `
    )
    .join("");

  const beginTime = parseDateTimeInput(key.begin_time);
  const endTime = parseDateTimeInput(key.end_time);
  const displayPeriod =
    beginTime && endTime
      ? `${new Date(beginTime).toLocaleDateString()} ${beginTime.slice(11, 16)} – ${new Date(endTime).toLocaleDateString()} ${endTime.slice(11, 16)}`
      : "Select date and time range";

  const dialog = host.shadowRoot.ownerDocument.createElement("dialog");
  dialog.innerHTML = `
    <h2>Edit Temporary Key</h2>
    <p class="muted">Update optional access identifiers.</p>
    <form>
      <input required name="begin_time" type="hidden" value="${escapeHtml(beginTime)}">
      <input required name="end_time" type="hidden" value="${escapeHtml(endTime)}">
      <input name="id_number" type="hidden" value="${escapeHtml(key.id_number || "")}">
      <div class="readonly-key-fields">
        <div class="readonly-key-field"><span>Key name</span><strong>${escapeHtml(key.description)}</strong></div>
        <div class="readonly-key-field"><span>Validity period</span><strong>${escapeHtml(displayPeriod)}</strong></div>
        <div class="readonly-key-field"><span>Allowed uses</span><strong>${escapeHtml(key.allowed_times || 1)}</strong></div>
        <div class="readonly-key-field"><span>Access ID</span><strong>${escapeHtml(key.id_number || "—")}</strong></div>
      </div>
      <div class="key-form-extra-fields">
        <label>
          <span>Vehicle registration</span>
          <span class="field-input-wrap">
            <input name="license_plate" maxlength="16" pattern="${LICENSE_PLATE_PATTERN}" title="${LICENSE_PLATE_TITLE}" autocomplete="off" value="${escapeHtml(key.license_plate || "")}">
            <span class="field-error" data-error-for="license_plate" hidden>${LICENSE_PLATE_ERROR_MSG}</span>
          </span>
        </label>
        <label>
          <span>UHF card</span>
          <span class="field-input-wrap">
            <input name="uhf_card" maxlength="24" pattern="${UHF_CARD_PATTERN}" title="${UHF_CARD_TITLE}" autocomplete="off" value="${escapeHtml(key.uhf_card || "")}">
            <span class="field-error" data-error-for="uhf_card" hidden>${UHF_CARD_ERROR_MSG}</span>
          </span>
        </label>
      </div>
      <div class="key-relay-row">
        <span>Permitted relays</span>
        <div class="relay-options">${relays || '<span class="muted">No relays are available.</span>'}</div>
      </div>
      <div class="modal-actions">
        <button class="modal-cancel" type="button" data-edit-cancel>Cancel</button>
        <button class="modal-action" type="submit">Save</button>
      </div>
    </form>
  `;

  const form = dialog.querySelector("form");
  form.className = "key-modal-form";
  const readOnlyFields = dialog.querySelector(".readonly-key-fields");
  if (readOnlyFields) readOnlyFields.style.display = "contents";

  const identifierFields = dialog.querySelector(".key-form-extra-fields");
  if (identifierFields) identifierFields.style.display = "contents";

  applyKeyFormRowLayout(form);
  const saveButton = form.querySelector('[type="submit"]');
  saveButton.dataset.editKeySubmit = "";

  const updateEditKeyState = () => {
    updateFormFieldErrors(form);
    const licensePlate = form.querySelector('[name="license_plate"]')?.value || "";
    const uhfCard = form.querySelector('[name="uhf_card"]')?.value || "";
    saveButton.disabled =
      !form.checkValidity() ||
      !LICENSE_PLATE_REGEX.test(licensePlate) ||
      !UHF_CARD_REGEX.test(uhfCard);
  };

  dialog.querySelector("[data-edit-cancel]").addEventListener("click", () => dialog.close());
  form.addEventListener("input", (event) => {
    normaliseUhfCard(event.target);
    updateEditKeyState();
  });
  form.addEventListener("change", () => updateEditKeyState());

  normaliseUhfCard(form.querySelector('[name="uhf_card"]'));
  updateEditKeyState();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const grouped = new Map();
    (key.doors || []).forEach((door) =>
      grouped.set(String(door.mac), [...(grouped.get(String(door.mac)) || []), String(door.relay)])
    );
    if (!grouped.size) {
      showNotice(host, "No permitted relay data is available for this key.", "Relay data unavailable");
      return;
    }

    const licensePlate = String(values.get("license_plate") || "").trim();
    if (licensePlate && !LICENSE_PLATE_REGEX.test(licensePlate)) {
      showNotice(host, LICENSE_PLATE_ERROR_MSG, "Invalid vehicle registration");
      return;
    }

    const uhfCard = String(values.get("uhf_card") || "").trim();
    if (uhfCard && !UHF_CARD_REGEX.test(uhfCard)) {
      showNotice(host, UHF_CARD_ERROR_MSG, "Invalid UHF card");
      return;
    }

    const saveWidth = saveButton.getBoundingClientRect().width;
    saveButton.style.width = `${saveWidth}px`;
    saveButton.disabled = true;
    saveButton.setAttribute("aria-label", "Saving temporary key");
    saveButton.innerHTML =
      '<span role="status" aria-label="Saving" style="display:inline-block;width:16px;height:16px;border:2px solid #ffffff80;border-top-color:#fff;border-radius:50%;animation:page-blocker-spin .8s linear infinite"></span>';

    try {
      await callWsWithBlocker(host, {
        type: "akuvox/panel_edit_temp_key",
        entry_id: host._activeAccount,
        key_id: String(key.key_id),
        description: String(key.description),
        begin_time: String(values.get("begin_time")).replace("T", " ") + ":00",
        end_time: String(values.get("end_time")).replace("T", " ") + ":00",
        counts: Number(key.allowed_times || 1),
        id_number: String(values.get("id_number") || "").trim(),
        license_plate: licensePlate,
        uhf_card: uhfCard,
        dev_list: [...grouped].map(([mac, doors]) => ({ mac, relay: doors.join(";") })),
      });
      dialog.close();
      await host._load();
    } catch (error) {
      saveButton.style.width = "";
      saveButton.disabled = false;
      saveButton.removeAttribute("aria-label");
      saveButton.textContent = "Save";
      showNotice(
        host,
        error?.message ||
          "The temporary key could not be saved. Check the Home Assistant log for the SmartPlus response.",
        "Could not save temporary key"
      );
    }
  });

  closeOnBackdrop(dialog);
  host._modalCount = (host._modalCount || 0) + 1;
  dialog.addEventListener(
    "close",
    () => {
      host._modalCount -= 1;
      dialog.remove();
      host._requestLoad?.();
    },
    { once: true }
  );

  host.shadowRoot.append(dialog);
  dialog.showModal();
};

/**
 * Handle creation of a new temporary key from form submission.
 * @param {HTMLElement} host
 * @param {SubmitEvent} event
 */
const handleCreateKey = async (host, event) => {
  event.preventDefault();
  const keyForm = event.target;
  if (keyForm.dataset.creating === "true") return;
  const form = new FormData(keyForm);
  const selected = form.getAll("relay");
  const description = String(form.get("description")).trim();

  if (!description) {
    showNotice(host, "Enter a name for the temporary key.", "Key name required");
    return;
  }
  if (!form.get("begin_time") || !form.get("end_time")) {
    showNotice(host, "Choose a validity period before creating the key.", "Validity period required");
    return;
  }
  if (!selected.length) {
    showNotice(host, "Select at least one relay.", "Relay required");
    return;
  }

  const licensePlate = String(form.get("license_plate") || "").trim();
  if (licensePlate && !LICENSE_PLATE_REGEX.test(licensePlate)) {
    showNotice(
      host,
      "Vehicle registration must be 0–16 characters and cannot contain , % & \\ < > ' \"",
      "Invalid vehicle registration"
    );
    return;
  }

  const uhfCard = String(form.get("uhf_card") || "").trim();
  if (uhfCard && !UHF_CARD_REGEX.test(uhfCard)) {
    showNotice(host, UHF_CARD_ERROR_MSG, "Invalid UHF card");
    return;
  }

  const devs = new Map();
  selected.forEach((value) => {
    const [mac, relay] = value.split("|");
    devs.set(mac, [...(devs.get(mac) || []), relay]);
  });

  const begin = String(form.get("begin_time")).replace("T", " ") + ":00";
  const end = String(form.get("end_time")).replace("T", " ") + ":00";
  const count = Number(form.get("counts"));
  const submitButton = keyForm.querySelector("[data-create-key-submit]");
  const spinner = keyForm.querySelector("[data-create-key-spinner]");
  keyForm.dataset.creating = "true";
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.setAttribute("aria-busy", "true");
  }
  if (spinner) spinner.hidden = false;

  try {
    await callWsWithBlocker(host, {
      type: "akuvox/panel_create_temp_key",
      entry_id: host._activeAccount,
      description,
      begin_time: begin,
      end_time: end,
      counts: count,
      id_number: String(form.get("id_number") || "").trim(),
      license_plate: licensePlate,
      uhf_card: String(form.get("uhf_card") || "").trim(),
      dev_list: [...devs].map(([mac, relays]) => ({ mac, relay: relays.join(";") })),
      confirmed: true,
    });
    host.shadowRoot.querySelector("[data-key-dialog]")?.close();
    await host._load();
  } catch (_) {
    showNotice(
      host,
      "The temporary key could not be created. Check the Home Assistant log for the SmartPlus response.",
      "Could not create temporary key"
    );
  } finally {
    delete keyForm.dataset.creating;
    if (submitButton) submitButton.removeAttribute("aria-busy");
    if (spinner) spinner.hidden = true;
    updateCreateKeyState(host);
  }
};

/**
 * Delete a single temporary key with confirmation.
 * @param {HTMLElement} host
 * @param {string} tempKey
 */
export const deleteKey = async (host, tempKey) => {
  const key = host._account()?.temporary_keys?.find((item) => item.key_code === tempKey);
  const name = key?.description || tempKey;

  if (
    !(await confirmModal(
      host,
      `Permanently delete temporary key ${name}?`,
      "Delete temporary key",
      "Delete key"
    ))
  ) {
    return;
  }

  try {
    await callWsWithBlocker(host, {
      type: "akuvox/panel_delete_temp_key",
      entry_id: host._activeAccount,
      temp_key: tempKey,
      confirmed: true,
    });
    await host._load();
  } catch (_) {
    showNotice(host, "The temporary key could not be deleted.", "Could not delete temporary key");
  }
};

/**
 * Delete all selected temporary keys with confirmation.
 * @param {HTMLElement} host
 */
export const deleteSelectedKeys = async (host) => {
  const keys = (host._account()?.temporary_keys || []).filter((key) =>
    host._selectedKeyIds.has(String(key.key_id))
  );
  if (!keys.length) return;

  if (
    !(await confirmModal(
      host,
      `Permanently delete ${keys.length} selected temporary ${keys.length === 1 ? "key" : "keys"}?`,
      "Delete selected temporary keys",
      "Delete selected"
    ))
  ) {
    return;
  }

  try {
    for (const key of keys) {
      await callWsWithBlocker(host, {
        type: "akuvox/panel_delete_temp_key",
        entry_id: host._activeAccount,
        temp_key: String(key.key_id),
        confirmed: true,
      });
    }
    host._selectedKeyIds.clear();
    host._selectingKeys = false;
    await host._load();
  } catch (_) {
    showNotice(
      host,
      "One or more temporary keys could not be deleted. The keys deleted before the error remain deleted.",
      "Could not delete selected keys"
    );
    await host._load();
  }
};

/**
 * Attach event listeners for the Temporary Keys tab.
 * @param {HTMLElement} host
 */
export const bindKeysEvents = (host) => {
  bindTileOrdering(host, "keys", () => {
    host._keySort = { key: "manual", direction: "asc" };
    host._keyTileSortMode = "manual";
  });
  // Key code copy buttons
  host.shadowRoot.querySelectorAll("[data-copy-key-code]").forEach((button) =>
    button.addEventListener("click", async () => {
      if (await copyText(button.dataset.copyKeyCode)) {
        const keyId = button.dataset.copyKeyId;
        window.clearTimeout(host._copiedKeyCodes.get(keyId));
        host._copiedKeyCodes.set(
          keyId,
          window.setTimeout(() => {
            host._copiedKeyCodes.delete(keyId);
            host._render();
          }, 2000)
        );
        host._render();
      } else {
        showNotice(host, "The temporary key code could not be copied.", "Copy failed");
      }
    })
  );

  // Filters
  host.shadowRoot.querySelectorAll("[data-key-filter]").forEach((input) => {
    const update = () => {
      const isTextInput = input instanceof HTMLInputElement;
      const selectionStart = isTextInput ? input.selectionStart : null;
      const selectionEnd = isTextInput ? input.selectionEnd : null;
      const filter = input.dataset.keyFilter;
      host._keyFilters[filter] = input.value;
      host._render();
      if (!isTextInput) return;
      const replacement = host.shadowRoot.querySelector(`[data-key-filter="${filter}"]`);
      replacement?.focus();
      if (selectionStart !== null && selectionEnd !== null) {
        replacement?.setSelectionRange(selectionStart, selectionEnd);
      }
    };
    input.addEventListener("input", update);
    input.addEventListener("change", update);
  });

  bindMultiSelectFilters(host, "key", host._keyFilters, () => host._render());

  // Sort
  host.shadowRoot.querySelectorAll("[data-key-sort]").forEach((button) =>
    button.addEventListener("click", () => {
      const key = button.dataset.keySort;
      host._keySort = {
        key,
        direction:
          host._keySort.key === key && host._keySort.direction === "asc"
            ? "desc"
            : "asc",
      };
      host._keyTileSortMode = "sorted";
      host._render();
    })
  );

  host.shadowRoot.querySelector("[data-key-tile-sort]")?.addEventListener("change", (event) => {
    host._keySort = { key: event.target.value, direction: "asc" };
    host._keyTileSortMode = event.target.value === "manual" ? "manual" : "sorted";
    host._render();
  });

  host.shadowRoot.querySelector("[data-key-tile-sort-direction]")?.addEventListener("click", () => {
    host._keySort = {
      ...host._keySort,
      direction: host._keySort.direction === "asc" ? "desc" : "asc",
    };
    host._keyTileSortMode = "sorted";
    host._render();
  });

  // Selection toggle
  host.shadowRoot
    .querySelector("[data-toggle-key-selection]")
    ?.addEventListener("click", () => {
      host._selectingKeys = !host._selectingKeys;
      host._selectedKeyIds.clear();
      host._render();
    });

  // Select key checkboxes
  host.shadowRoot.querySelectorAll("[data-select-key]").forEach((input) =>
    input.addEventListener("change", () => {
      if (input.checked) host._selectedKeyIds.add(input.dataset.selectKey);
      else host._selectedKeyIds.delete(input.dataset.selectKey);
      host._render();
    })
  );

  // Delete selected
  host.shadowRoot
    .querySelector("[data-delete-selected]")
    ?.addEventListener("click", () => deleteSelectedKeys(host));

  // Context Menu & Row buttons
  host.shadowRoot.querySelectorAll("[data-key-menu]").forEach((button) =>
    button.addEventListener("click", (event) =>
      showKeyActionsMenu(host, button, event, {
        onQr: (keyId) => showTemporaryKeyQrDialog(host, keyId),
        onEdit: (keyId) => showEditKeyDialog(host, keyId),
        onDelete: (keyCode) => deleteKey(host, keyCode),
      })
    )
  );

  host.shadowRoot.querySelectorAll("[data-edit-key]").forEach((button) =>
    button.addEventListener("click", () => showEditKeyDialog(host, button.dataset.editKey))
  );

  host.shadowRoot.querySelectorAll("[data-delete-key]").forEach((button) =>
    button.addEventListener("click", () => deleteKey(host, button.dataset.deleteKey))
  );

  // Create Key Dialog
  host.shadowRoot
    .querySelector("[data-create-key]")
    ?.addEventListener("click", () => showCreateKeyDialog(host));

  host.shadowRoot
    .querySelectorAll("[data-close-key-dialog]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        host.shadowRoot.querySelector("[data-key-dialog]")?.close()
      )
    );

  const keyDialog = host.shadowRoot.querySelector("[data-key-dialog]");
  if (keyDialog) {
    closeOnBackdrop(keyDialog);
    keyDialog.addEventListener("close", () => {
      host._keyDialogOpen = false;
      host._requestLoad?.();
    });
  }

  // Key form inputs
  const keyForm = host.shadowRoot.querySelector("[data-key-form]");
  keyForm?.addEventListener("submit", (event) => handleCreateKey(host, event));
  keyForm?.addEventListener("input", (event) => {
    normaliseUhfCard(event.target);
    updateCreateKeyState(host);
  });
  keyForm?.addEventListener("change", () => updateCreateKeyState(host));

  // Date range picker trigger
  host.shadowRoot
    .querySelector("[data-validity-picker]")
    ?.addEventListener("click", () =>
      showDateRangePicker(
        host,
        host.shadowRoot.querySelector("[data-key-form]"),
        "[data-validity-label]",
        () => updateCreateKeyState(host)
      )
    );
};
