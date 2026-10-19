/**
 * Aggregates all panel CSS modules.
 */

import { mainStyles } from "./main.css.js?v=20261019-unified-checkboxes-v3";
import { tableStyles } from "./tables.css.js?v=20261019-unified-checkboxes-v3";
import { dialogStyles } from "./dialogs.css.js?v=20261019-unified-checkboxes-v3";
import { viewStyles } from "./views.css.js?v=20261019-disabled-automation-border";

export const getPanelStyles = () => `
  <style>
    ${mainStyles}
    ${tableStyles}
    ${dialogStyles}
    ${viewStyles}
  </style>
`;
