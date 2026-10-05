/**
 * Aggregates all panel CSS modules.
 */

import { mainStyles } from "./main.css.js?v=20261005-storage-meter-clear";
import { tableStyles } from "./tables.css.js?v=20261005-dynamic-view-toggle";
import { dialogStyles } from "./dialogs.css.js?v=20261005-key-optional-visible";
import { viewStyles } from "./views.css.js?v=20261005-dynamic-key-view-toggle";

export const getPanelStyles = () => `
  <style>
    ${mainStyles}
    ${tableStyles}
    ${dialogStyles}
    ${viewStyles}
  </style>
`;
