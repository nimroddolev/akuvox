/**
 * Constants used across the Akuvox SmartPlus panel.
 */

export const PANEL_TAG = "akuvox-smartplus-panel";

export const TAB_HASHES = {
  Devices: "overview",
  LatestActivity: "activity",
  CallHistory: "calls",
  TemporaryKeys: "keys",
  Automations: "automations",
  Settings: "settings",
  HelpInfo: "help",
};

export const TAB_HASH_BY_ID = Object.fromEntries(
  Object.entries(TAB_HASHES).map(([hash, tab]) => [tab, hash])
);

export const TABS = [
  ["overview", "Devices"],
  ["activity", "Latest activity"],
  ["calls", "Call history"],
  ["keys", "Temporary keys"],
  ["automations", "Automations"],
  ["settings", "Settings"],
  ["help", "Help & Info"],
];
