/**
 * Aggregates all panel CSS modules.
 */

import { mainStyles } from "./main.css.js?v=20261007-auth-notice-action-gap";
import { tableStyles } from "./tables.css.js?v=20261006-activity-filter-alignment";
import { dialogStyles } from "./dialogs.css.js?v=20261005-key-optional-visible";
import { viewStyles } from "./views.css.js?v=20261006-automation-action-alignment";

export const getPanelStyles = () => `
  <style>
    ${mainStyles}
    ${tableStyles}
    ${dialogStyles}
    ${viewStyles}
  </style>
`;
