/**
 * Aggregates all panel CSS modules.
 */

import { mainStyles } from "./main.css.js?v=20261019-share-status-wrap";
import { tableStyles } from "./tables.css.js?v=20261013-key-tile-design";
import { dialogStyles } from "./dialogs.css.js?v=20261015-shared-wizard-close";
import { viewStyles } from "./views.css.js?v=20261018-automation-mobile-layout";

export const getPanelStyles = () => `
  <style>
    ${mainStyles}
    ${tableStyles}
    ${dialogStyles}
    ${viewStyles}
  </style>
`;
