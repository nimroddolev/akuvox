import assert from "node:assert/strict";
import test from "node:test";

import {
  matchesSelectedFilter,
  renderMultiSelectFilter,
  selectedFilterValues,
} from "../custom_components/akuvox/panel/utils/multi-select-filter.js";

test("an empty selection includes every value", () => {
  assert.deepEqual(selectedFilterValues([]), []);
  assert.equal(matchesSelectedFilter([], "Answered"), true);
  assert.equal(matchesSelectedFilter("", "Missed"), true);
});

test("multiple checked values include only their matching rows", () => {
  const selected = ["Answered", "Missed"];
  assert.equal(matchesSelectedFilter(selected, "Answered"), true);
  assert.equal(matchesSelectedFilter(selected, "Missed"), true);
  assert.equal(matchesSelectedFilter(selected, "Unknown"), false);
});

test("the All row is checked only when no individual values are selected", () => {
  const all = renderMultiSelectFilter({
    scope: "call",
    key: "status",
    label: "Status",
    allLabel: "All statuses",
    values: ["Answered", "Missed"],
    selected: [],
    openMenu: "",
  });
  const selected = renderMultiSelectFilter({
    scope: "call",
    key: "status",
    label: "Status",
    allLabel: "All statuses",
    values: ["Answered", "Missed"],
    selected: ["Answered"],
    openMenu: "call-status",
  });

  assert.match(all, /data-filter-all checked/);
  assert.match(selected, /<details[^>]+open>/);
  assert.doesNotMatch(selected, /data-filter-all checked/);
  assert.match(selected, /value="Answered" checked/);
});
