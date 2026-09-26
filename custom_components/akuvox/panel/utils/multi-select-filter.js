/** Shared checkbox dropdowns used by the activity, call, and key table filters. */

import { escapeHtml } from "./dom.js";

export const selectedFilterValues = (value) =>
  Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];

export const matchesSelectedFilter = (selected, value) => {
  const values = selectedFilterValues(selected);
  return values.length === 0 || values.includes(String(value || ""));
};

const formatOptionLabel = (value) => String(value || "")
  .replace(/([a-z\d])([A-Z])/g, "$1 $2")
  .replace(/[_-]+/g, " ")
  .split(/\s+/)
  .filter(Boolean)
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  .join(" ");

export const renderMultiSelectFilter = ({
  scope,
  key,
  label,
  allLabel,
  values,
  selected,
  openMenu,
}) => {
  const selectedValues = selectedFilterValues(selected);
  const menuId = `${scope}-${key}`;
  const options = values.map((option) =>
    typeof option === "string"
      ? { value: option, label: formatOptionLabel(option) }
      : { value: String(option.value || ""), label: option.label || formatOptionLabel(option.value) }
  );
  const selectedLabel = (value) => options.find((option) => option.value === value)?.label || formatOptionLabel(value);
  const summary = selectedValues.length === 0
    ? allLabel
    : selectedValues.length === 1
      ? selectedLabel(selectedValues[0])
      : `${selectedValues.length} selected`;

  return `<details class="multi-select-filter" data-filter-menu="${escapeHtml(menuId)}" ${openMenu === menuId ? "open" : ""}>
    <summary><span>${escapeHtml(label)}</span><span class="multi-select-filter-summary">${escapeHtml(summary)}</span></summary>
    <div class="multi-select-filter-options" role="group" aria-label="${escapeHtml(label)} filter">
      <label><input type="checkbox" data-multi-filter="${escapeHtml(scope)}" data-filter-key="${escapeHtml(key)}" data-filter-all ${selectedValues.length === 0 ? "checked" : ""}> ${escapeHtml(allLabel)}</label>
      ${options.map((option) => `<label><input type="checkbox" data-multi-filter="${escapeHtml(scope)}" data-filter-key="${escapeHtml(key)}" value="${escapeHtml(option.value)}" ${selectedValues.includes(option.value) ? "checked" : ""}> ${escapeHtml(option.label)}</label>`).join("")}
    </div>
  </details>`;
};

/** Bind checkbox dropdowns and retain the open menu across re-renders. */
export const bindMultiSelectFilters = (host, scope, filters, onChange) => {
  host._multiFilterOutsideAbort?.abort();
  const outsideAbort = new AbortController();
  host._multiFilterOutsideAbort = outsideAbort;
  host.shadowRoot.ownerDocument.addEventListener("pointerdown", (event) => {
    if (!host._openFilterMenu) return;
    if (event.composedPath().some((node) => node?.dataset?.filterMenu)) return;
    host._openFilterMenu = "";
    onChange();
  }, { capture: true, signal: outsideAbort.signal });

  host.shadowRoot.querySelectorAll(`[data-multi-filter="${scope}"]`).forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.filterKey;
      const menuId = `${scope}-${key}`;
      const menu = input.closest("details");
      const inputs = [...menu.querySelectorAll(`[data-multi-filter="${scope}"][data-filter-key="${key}"]`)];

      filters[key] = input.hasAttribute("data-filter-all")
        ? []
        : inputs
          .filter((option) => !option.hasAttribute("data-filter-all") && option.checked)
          .map((option) => option.value);
      host._openFilterMenu = menuId;
      onChange();
    });
  });

  host.shadowRoot.querySelectorAll(`[data-filter-menu^="${scope}-"]`).forEach((menu) => {
    menu.addEventListener("toggle", () => {
      if (menu.open) {
        host.shadowRoot
          .querySelectorAll("[data-filter-menu]")
          .forEach((otherMenu) => {
            if (otherMenu !== menu) otherMenu.open = false;
          });
        host._openFilterMenu = menu.dataset.filterMenu;
      }
      else if (host._openFilterMenu === menu.dataset.filterMenu) host._openFilterMenu = "";
    });
  });
};
