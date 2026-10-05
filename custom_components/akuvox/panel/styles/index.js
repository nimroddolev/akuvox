/**
 * Aggregates all panel CSS modules.
 */

import { mainStyles } from "./main.css.js?v=20261005-shared-sip-export-action";
import { tableStyles } from "./tables.css.js?v=20261005-dynamic-view-toggle";
import { dialogStyles } from "./dialogs.css.js?v=20261005-key-optional-visible";
import { viewStyles } from "./views.css.js?v=20261005-shared-sip-export-action";

export const getPanelStyles = () => `
  <style>
    ${mainStyles}
    ${tableStyles}
    ${dialogStyles}
    ${viewStyles}
  </style>
`;
