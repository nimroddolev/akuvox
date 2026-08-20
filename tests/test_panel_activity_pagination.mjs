import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVITY_INITIAL_PAGE_SIZE,
  ACTIVITY_PAGE_INCREMENT,
  nextActivityVisibleCount,
  visibleActivityItems,
} from "../custom_components/akuvox/panel/utils/activity-pagination.mjs";

const events = Array.from({ length: 35 }, (_, index) => ({ id: index }));

test("activity pagination initially exposes twenty events", () => {
  assert.equal(ACTIVITY_INITIAL_PAGE_SIZE, 20);
  assert.deepEqual(visibleActivityItems(events).map((event) => event.id), [...Array(20).keys()]);
});

test("activity pagination adds ten events for each bottom-of-list trigger", () => {
  const next = nextActivityVisibleCount(ACTIVITY_INITIAL_PAGE_SIZE);
  assert.equal(next, ACTIVITY_INITIAL_PAGE_SIZE + ACTIVITY_PAGE_INCREMENT);
  assert.equal(visibleActivityItems(events, next).length, 30);
});

test("activity pagination does not expose more events than are available", () => {
  const next = nextActivityVisibleCount(30);
  assert.equal(visibleActivityItems(events, next).length, events.length);
});
