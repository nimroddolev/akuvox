/**
 * Drag-and-drop support for ordered tile grids.
 */

const getDropPlacement = (grid, dragged, target, clientX, clientY, direction) => {
  if (target === dragged) return;
  if (!target) {
    const candidates = [...grid.querySelectorAll("[data-tile-order-id]")].filter(
      (tile) => tile !== dragged
    );
    target = candidates.reduce((nearest, tile) => {
      if (!nearest) return tile;
      const bounds = tile.getBoundingClientRect();
      const nearestBounds = nearest.getBoundingClientRect();
      const distance = Math.hypot(clientX - (bounds.left + bounds.width / 2), clientY - (bounds.top + bounds.height / 2));
      const nearestDistance = Math.hypot(clientX - (nearestBounds.left + nearestBounds.width / 2), clientY - (nearestBounds.top + nearestBounds.height / 2));
      return distance < nearestDistance ? tile : nearest;
    }, null);
  }
  if (!target) return null;
  // Swap immediately when the pointer enters a neighboring tile. Direction,
  // rather than the target's midpoint, prevents the delayed half-card feel.
  const insertAfter =
    Math.abs(direction.x) >= Math.abs(direction.y)
      ? direction.x > 0
      : direction.y > 0;
  return { target, insertAfter };
};

/**
 * Bind mouse and touch reordering to a tile grid.
 * @param {HTMLElement} host
 * @param {string} scope
 * @param {() => void} [onOrdered]
 */
export const bindTileOrdering = (host, scope, onOrdered) => {
  const grid = host.shadowRoot.querySelector(`[data-tile-grid="${scope}"]`);
  if (!grid) return;

  let dragged = null;
  let lastPoint = null;
  let preview = null;
  let pointerOffset = null;
  let pendingPlacement = null;
  const clearDrag = () => {
    pendingPlacement?.target?.classList.remove("tile-drop-target");
    dragged?.classList.remove("tile-dragging");
    dragged = null;
    lastPoint = null;
    pointerOffset = null;
    pendingPlacement = null;
    preview?.remove();
    preview = null;
  };
  const finish = () => {
    if (!dragged) return;
    if (pendingPlacement?.target?.parentElement === grid) {
      grid.insertBefore(
        dragged,
        pendingPlacement.insertAfter ? pendingPlacement.target.nextSibling : pendingPlacement.target
      );
    }
    const ids = [...grid.querySelectorAll("[data-tile-order-id]")].map(
      (tile) => tile.dataset.tileOrderId
    );
    clearDrag();
    host._saveTileOrder(scope, ids);
    onOrdered?.();
    host._render();
  };

  // Pointer dragging works consistently across mouse and touch. Restrict it
  // to the grab control so regular taps on a tile still operate its actions.
  grid.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest?.("[data-tile-grab]");
    const tile = handle?.closest("[data-tile-order-id]");
    if (!tile) return;
    dragged = tile;
    lastPoint = { x: event.clientX, y: event.clientY };
    const bounds = tile.getBoundingClientRect();
    pointerOffset = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    preview = tile.cloneNode(true);
    preview.classList.add("tile-drag-preview");
    preview.style.width = `${bounds.width}px`;
    preview.style.height = `${bounds.height}px`;
    preview.style.left = `${bounds.left}px`;
    preview.style.top = `${bounds.top}px`;
    host.shadowRoot.append(preview);
    tile.classList.add("tile-dragging");
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  grid.addEventListener("pointermove", (event) => {
    if (!dragged) return;
    if (preview && pointerOffset) {
      preview.style.left = `${event.clientX - pointerOffset.x}px`;
      preview.style.top = `${event.clientY - pointerOffset.y}px`;
    }
    const target = host.shadowRoot
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest?.("[data-tile-order-id]");
    const direction = {
      x: event.clientX - (lastPoint?.x ?? event.clientX),
      y: event.clientY - (lastPoint?.y ?? event.clientY),
    };
    pendingPlacement?.target?.classList.remove("tile-drop-target");
    pendingPlacement = getDropPlacement(
      grid,
      dragged,
      target,
      event.clientX,
      event.clientY,
      direction
    );
    pendingPlacement?.target?.classList.add("tile-drop-target");
    lastPoint = { x: event.clientX, y: event.clientY };
  });

  grid.addEventListener("pointerup", (event) => {
    if (dragged) finish();
  });
  grid.addEventListener("pointercancel", () => {
    if (dragged) clearDrag();
  });
};

/**
 * Bind the same manual ordering behavior to rows in a list/table view.
 * @param {HTMLElement} host
 * @param {string} scope
 * @param {() => void} [onOrdered]
 */
export const bindListOrdering = (host, scope, onOrdered) => {
  const list = host.shadowRoot.querySelector(`[data-list-order="${scope}"]`);
  if (!list) return;

  let dragged = null;
  let target = null;
  let insertAfter = false;
  let preview = null;
  let pointerOffset = null;
  const clearDrag = () => {
    dragged?.classList.remove("list-dragging");
    target?.classList.remove("list-drop-target", "list-drop-after");
    dragged = null;
    target = null;
    insertAfter = false;
    pointerOffset = null;
    preview?.remove();
    preview = null;
  };
  const finish = () => {
    if (!dragged) return;
    if (target && target.parentElement === list) {
      list.insertBefore(dragged, insertAfter ? target.nextSibling : target);
    }
    const ids = [...list.querySelectorAll("[data-list-order-id]")].map(
      (row) => row.dataset.listOrderId
    );
    clearDrag();
    host._saveTileOrder(scope, ids);
    onOrdered?.();
    host._render();
  };

  list.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest?.("[data-list-grab]");
    const row = handle?.closest("[data-list-order-id]");
    if (!row) return;
    dragged = row;
    const bounds = row.getBoundingClientRect();
    pointerOffset = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    preview = document.createElement("table");
    const sourceTable = row.closest("table");
    // Device-table rules define the action-button size and column alignment.
    // Preserve those classes so the moving copy is visually identical.
    preview.className = `${sourceTable?.className || ""} list-drag-preview`.trim();
    preview.style.width = `${bounds.width}px`;
    preview.style.height = `${bounds.height}px`;
    preview.style.left = `${bounds.left}px`;
    preview.style.top = `${bounds.top}px`;
    preview.style.tableLayout = "fixed";
    const previewRow = row.cloneNode(true);
    [...row.cells].forEach((cell, index) => {
      const previewCell = previewRow.cells[index];
      if (!previewCell) return;
      const style = window.getComputedStyle(cell);
      previewCell.style.width = `${cell.getBoundingClientRect().width}px`;
      previewCell.style.padding = style.padding;
      previewCell.style.borderBottom = style.borderBottom;
      previewCell.style.backgroundColor = style.backgroundColor;
      previewCell.style.color = style.color;
    });
    const body = document.createElement("tbody");
    body.append(previewRow);
    preview.append(body);
    host.shadowRoot.append(preview);
    row.classList.add("list-dragging");
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  list.addEventListener("pointermove", (event) => {
    if (!dragged) return;
    if (preview && pointerOffset) {
      preview.style.left = `${event.clientX - pointerOffset.x}px`;
      preview.style.top = `${event.clientY - pointerOffset.y}px`;
    }
    let nextTarget = host.shadowRoot
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest?.("[data-list-order-id]");
    if (!nextTarget || nextTarget === dragged) {
      const candidates = [...list.querySelectorAll("[data-list-order-id]")].filter(
        (row) => row !== dragged
      );
      nextTarget = candidates.reduce((nearest, row) => {
        if (!nearest) return row;
        const rowBounds = row.getBoundingClientRect();
        const nearestBounds = nearest.getBoundingClientRect();
        const distance = Math.abs(event.clientY - (rowBounds.top + rowBounds.height / 2));
        const nearestDistance = Math.abs(
          event.clientY - (nearestBounds.top + nearestBounds.height / 2)
        );
        return distance < nearestDistance ? row : nearest;
      }, null);
    }
    target?.classList.remove("list-drop-target", "list-drop-after");
    target = nextTarget || null;
    if (target) {
      const bounds = target.getBoundingClientRect();
      insertAfter = event.clientY > bounds.top + bounds.height / 2;
    }
    target?.classList.add("list-drop-target");
    target?.classList.toggle("list-drop-after", insertAfter);
  });

  list.addEventListener("pointerup", () => finish());
  list.addEventListener("pointercancel", clearDrag);
};
