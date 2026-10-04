/**
 * Aggregates all panel CSS modules.
 */

import { mainStyles } from "./main.css.js?v=20261004-rtl-share-table";
import { tableStyles } from "./tables.css.js?v=20261004-rtl-table-headings";
import { dialogStyles } from "./dialogs.css.js?v=20261004-centered-automation-footer";
import { viewStyles } from "./views.css.js?v=20261003-mobile-toolbar-fix-3";

export const getPanelStyles = () => `
  <style>
    ${mainStyles}
    ${tableStyles}
    ${dialogStyles}
    ${viewStyles}
  </style>
`;
