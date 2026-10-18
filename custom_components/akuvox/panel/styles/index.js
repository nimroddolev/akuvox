/**
 * Aggregates all panel CSS modules.
 */

import { mainStyles } from "./main.css.js?v=20261015-readonly-share-scroll";
import { tableStyles } from "./tables.css.js?v=20261013-key-tile-design";
import { dialogStyles } from "./dialogs.css.js?v=20261014-edit-key-shared-label-column";
import { viewStyles } from "./views.css.js?v=20261013-key-tile-design";

export const getPanelStyles = () => `
  <style>
    ${mainStyles}
    ${tableStyles}
    ${dialogStyles}
    ${viewStyles}
  </style>
`;
