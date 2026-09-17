/**
 * Aggregates all panel CSS modules.
 */

import { mainStyles } from "./main.css.js?v=20260830-mobile-topbar-breakpoint";
import { tableStyles } from "./tables.css.js?v=20260917-list-drop-position";
import { dialogStyles } from "./dialogs.css.js?v=20260817-range-picker";
import { viewStyles } from "./views.css.js?v=20260916-paired-receivers";

export const getPanelStyles = () => `
  <style>
    ${mainStyles}
    ${tableStyles}
    ${dialogStyles}
    ${viewStyles}
  </style>
`;
