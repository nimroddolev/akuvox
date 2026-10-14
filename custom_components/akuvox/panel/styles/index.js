/**
 * Aggregates all panel CSS modules.
 */

import { mainStyles } from "./main.css.js?v=20261014-pairing-dialog-dynamic-height";
import { tableStyles } from "./tables.css.js?v=20261013-key-tile-design";
import { dialogStyles } from "./dialogs.css.js?v=20261013-danger-confirmation";
import { viewStyles } from "./views.css.js?v=20261013-key-tile-design";

export const getPanelStyles = () => `
  <style>
    ${mainStyles}
    ${tableStyles}
    ${dialogStyles}
    ${viewStyles}
  </style>
`;
