/** Pagination rules for the activity table. */
export const ACTIVITY_INITIAL_PAGE_SIZE = 20;
export const ACTIVITY_PAGE_INCREMENT = 10;

export const visibleActivityItems = (items, visibleCount = ACTIVITY_INITIAL_PAGE_SIZE) =>
  items.slice(0, Math.max(ACTIVITY_INITIAL_PAGE_SIZE, visibleCount));

export const nextActivityVisibleCount = (visibleCount) =>
  Math.max(ACTIVITY_INITIAL_PAGE_SIZE, visibleCount) + ACTIVITY_PAGE_INCREMENT;
