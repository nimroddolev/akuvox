import assert from "node:assert/strict";
import test from "node:test";

import {
  matchesSelectedFilter,
  renderMultiSelectFilter,
  selectedFilterValues,
} from "../custom_components/akuvox/panel/utils/multi-select-filter.js";
import { settingsRenderSignature } from "../custom_components/akuvox/panel/utils/settings-signature.js";

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

test("receiver sync timestamps do not trigger a Settings form rebuild", () => {
  const initial = {
    camera_stream_orientations: { Front: "normal" },
    activity_history_storage_bytes: 100,
    credential_shares: [{
      share_id: "receiver-1",
      receiver_name: "Holiday home",
      activated: true,
      revoked: false,
      connected: true,
      last_sync: "2026-09-16T10:00:00+00:00",
    }],
  };
  const refreshed = {
    ...initial,
    activity_history_storage_bytes: 125,
    credential_shares: [{
      ...initial.credential_shares[0],
      last_sync: "2026-09-16T10:00:15+00:00",
    }],
  };

  assert.equal(settingsRenderSignature(refreshed), settingsRenderSignature(initial));
});

test("receiver connectivity changes rebuild the Settings receiver status", () => {
  const connected = {
    credential_shares: [{
      share_id: "receiver-1",
      receiver_name: "Holiday home",
      activated: true,
      revoked: false,
      connected: true,
      last_sync: "2026-09-16T10:00:00+00:00",
    }],
  };
  const disconnected = {
    credential_shares: [{ ...connected.credential_shares[0], connected: false }],
  };

  assert.notEqual(settingsRenderSignature(disconnected), settingsRenderSignature(connected));
});
