/**
 * Aggregates all panel CSS modules.
 */

import { mainStyles } from "./main.css.js";
import { tableStyles } from "./tables.css.js";
import { dialogStyles } from "./dialogs.css.js?v=20260817-range-picker";
import { viewStyles } from "./views.css.js";

export const getPanelStyles = () => `
  <style>
    ${mainStyles}
    ${tableStyles}
    ${dialogStyles}
    ${viewStyles}
  </style>
`;
