/**
 * Core design tokens, typography, layout, header, navigation, and base components.
 */

export const mainStyles = `
  :host {
    --aqua: #0ea5e9;
    --navy: #0369a1;
    --mint: #e0f2fe;
    --panel-surface: #f4f8fc;
    --panel-card: #ffffff;
    --panel-text: #15212e;
    --panel-muted: #64748b;
    --panel-outline: #d9e3ee;
    --panel-notice-bg: #ecf8ff;
    --panel-notice-text: #075985;
    --panel-notice-outline: #bae6fd;
    --panel-control-bg: #f8fafc;
    --panel-control-hover: #eaf3fa;
    --panel-control-active: #ffffff;
    --panel-code-bg: #f5f7fa;
    --panel-code-text: #0369a1;
    --panel-success: #15803d;
    --panel-danger: #b91c1c;
    --panel-shadow-sm: 0 1px 2px rgb(15 23 42 / 4%), 0 2px 5px rgb(15 23 42 / 3%);
    --panel-shadow-md: 0 12px 28px rgb(15 23 42 / 8%), 0 3px 8px rgb(15 23 42 / 5%);
    --panel-radius: 16px;
    color: var(--panel-text);
    display: block;
    max-width: 100%;
    min-height: 100%;
    min-width: 0;
    overflow-x: hidden;
    overflow-x: clip;
    width: 100%;
    font: 14px/1.45 "Roboto Flex", Roboto, var(--paper-font-body1_-_font-family, Arial, sans-serif);
  }

  /* Stitch's "Lovelace Akuvox Sentinel" palette, activated by HA's theme. */
  :host([dark]) {
    --aqua: #03a9f4;
    --navy: #38bdf8;
    --mint: #0d3144;
    --panel-surface: #0d121a;
    --panel-card: #161d27;
    --panel-text: #f3f4f6;
    --panel-muted: #9ca3af;
    --panel-outline: #293545;
    --panel-notice-bg: #102c3c;
    --panel-notice-text: #bae6fd;
    --panel-notice-outline: #334155;
    --panel-control-bg: #252b34;
    --panel-control-hover: #303a46;
    --panel-control-active: #1c2026;
    --panel-code-bg: #151c25;
    --panel-code-text: #38bdf8;
    --panel-success: #86efac;
    --panel-danger: #fecaca;
    --primary-text-color: #e5e7eb;
    --secondary-text-color: #9ca3af;
    --disabled-text-color: #6b7280;
    --card-background-color: #1c2026;
    --secondary-background-color: #252b34;
    --input-fill-color: #222731;
    --divider-color: #2d3440;
    --error-color: #f87171;
    color-scheme: dark;
  }

  main {
    box-sizing: border-box;
    max-width: none;
    margin: 0;
    min-height: 100vh;
    min-height: 100dvh;
    min-width: 0;
    overflow-x: hidden;
    overflow-x: clip;
    padding: 28px;
    background: radial-gradient(circle at 8% -12%, color-mix(in srgb, var(--aqua) 12%, transparent), transparent 28rem), var(--panel-surface);
    width: 100%;
  }

  main.reauthentication-required {
    box-sizing: border-box;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  main > header {
    box-sizing: border-box;
    display: flex;
    gap: 16px;
    align-items: center;
    min-height: 56px;
    margin: -28px -28px 0;
    padding: 0 28px;
    color: var(--app-header-text-color, var(--panel-text));
    border: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--panel-outline) 85%, transparent);
    border-radius: 0;
    background: color-mix(in srgb, var(--app-header-background-color, var(--panel-card)) 92%, transparent);
    box-shadow: 0 1px 0 rgb(255 255 255 / 35%);
    backdrop-filter: blur(16px);
  }

  .panel-page-title { min-width: 0; }

  h1 {
    margin: 0;
    font: 400 20px/1 "Roboto", "Noto", sans-serif;
  }

  header select {
    margin-left: auto;
    max-width: 280px;
    padding: 8px 10px;
    border: 1px solid var(--panel-outline);
    color: var(--panel-text);
    background: var(--panel-surface);
    border-radius: 10px;
    font-weight: 600;
  }

  .mobile-menu-toggle { display: none; }

  nav {
    display: flex;
    gap: 4px;
    margin: 16px 0 28px;
    border-bottom: 1px solid var(--panel-outline);
  }

  .tab-navigation {
    display: flex;
    /* Overflow arrows retain physical left/right positions in every locale. */
    direction: ltr;
    align-items:stretch;
    box-sizing: border-box;
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    width: 100%;
    margin: 16px 0 28px;
    border-bottom: 1px solid var(--panel-outline);
  }

  .tab-scroll-viewport {
    flex: 1 1 0;
    min-width: 0;
    width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    /* Only arrow-button navigation animates. Programmatic selection and
       render restoration must settle immediately on mobile Safari. */
    scroll-behavior: auto;
  }

  .tab-scroll-viewport::-webkit-scrollbar { display: none; }

  .tab-scroll-viewport nav {
    width: max-content;
    min-width: 100%;
    margin: 0;
    border-bottom: 0;
  }

  .tab-scroll-arrow {
    display: grid;
    flex: 0 0 36px;
    place-items: center;
    align-self: stretch;
    border: 0;
    border-radius: 10px;
    margin: 4px;
    color: var(--panel-muted);
    background: transparent;
    font-size: 26px;
    line-height: 1;
  }

  .tab-scroll-arrow:hover { color: var(--aqua); }
  .tab-scroll-arrow:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: -2px;
  }
  .tab-scroll-arrow[hidden] { display: none; }

  button {
    font: inherit;
    cursor: pointer;
  }

  .tab {
    border: 0;
    border-radius: 9px 9px 0 0;
    background: transparent;
    padding: 11px 15px;
    color: var(--panel-muted);
    font-size: 13px;
    font-weight: 500;
  }

  .tab.selected {
    color: var(--navy);
    border-bottom: 3px solid var(--aqua);
    font-weight: 600;
  }

  .tab:hover:not(.selected) { color: var(--panel-text); background: color-mix(in srgb, var(--aqua) 7%, transparent); }
  button:focus-visible, a:focus-visible, summary:focus-visible {
    outline: 2px solid var(--aqua);
    outline-offset: 3px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 16px;
  }

  .card {
    border: 1px solid var(--panel-outline);
    border-radius: var(--panel-radius);
    padding: 18px;
    background: var(--panel-card);
    box-shadow: var(--panel-shadow-sm);
  }

  .card h2 {
    color: var(--panel-text);
    font-size: 22px;
    font-weight: 600;
    margin: 0;
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 12px;
  }

  .action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 38px;
    color: white;
    background: linear-gradient(135deg, #0ea5e9, #0284c7);
    border: 0;
    border-radius: 10px;
    padding: 8px 13px;
    box-shadow: 0 2px 4px rgb(2 132 199 / 20%);
    font-weight: 700;
    transition: transform 150ms ease, box-shadow 150ms ease, filter 150ms ease;
  }
  .action:hover:not(:disabled) { filter: brightness(1.04); box-shadow: 0 6px 14px rgb(2 132 199 / 24%); transform: translateY(-1px); }
  .action:active:not(:disabled) { transform: translateY(0); box-shadow: 0 1px 2px rgb(2 132 199 / 20%); }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
    }
  }

  .settings-heading {
    align-items: flex-start;
    margin-bottom: 8px;
  }

  .settings-page {
    max-width: 1040px;
    margin: 0 auto;
    padding: 28px;
  }

  .settings-intro,
  .settings-section-description {
    margin: 5px 0 0;
    color: var(--panel-muted);
  }

  .settings-actions {
    position: fixed;
    z-index: 10;
    right: max(24px, env(safe-area-inset-right));
    bottom: max(24px, env(safe-area-inset-bottom));
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 10px;
    padding: 10px;
    border: 1px solid var(--panel-outline);
    border-radius: 10px;
    background: var(--panel-card);
    box-shadow: 0 10px 24px rgb(0 0 0 / 20%);
  }

  .settings-actions[hidden] { display: none; }

  .settings-discard {
    min-height: 38px;
    padding: 0 14px;
    border: 1px solid var(--panel-outline);
    border-radius: 8px;
    color: var(--panel-text);
    background: transparent;
    font-size: 13px;
    font-weight: 600;
  }

  .settings-discard:hover:not(:disabled) { background: var(--panel-surface); }
  .settings-discard:disabled { cursor: not-allowed; opacity: .5; }
  .settings-discard { display: inline-flex; align-items: center; justify-content: center; gap: 8px; line-height: 1; }
  .settings-discard svg {
    display: block;
    flex: 0 0 auto;
    overflow: visible;
    transform: translateY(-.5px);
  }

  .settings-save {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 10px 14px;
    font-size: 13px;
    line-height: 1;
  }

  .settings-save:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .settings-save svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }

  .success {
    color: white;
    background: #16a34a;
    border: 0;
    border-radius: 10px;
    padding: 9px 12px;
    font-weight: 700;
  }

  .success:hover {
    background: #15803d;
  }

  .danger {
    color: white;
    background: #dc2626;
    border: 0;
    border-radius: 10px;
    padding: 9px 12px;
    font-weight: 700;
  }

  .danger:hover {
    background: #b91c1c;
  }

  .danger svg {
    display: block;
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }

  .muted {
    color: var(--secondary-text-color, #6b7280);
  }

  .notice {
    padding: 14px 16px;
    border-radius: 12px;
    border: 1px solid var(--panel-notice-outline);
    background: var(--panel-notice-bg);
    color: var(--panel-notice-text);
  }
  main > section > .notice {
    width: min(100%, 520px);
    margin: 32px auto;
    text-align: center;
  }
  .share-access-dialog .share-error { background: #fde8e8; color: #9b1c1c; }
  .result-icon { display: grid; width: 58px; height: 58px; margin: 0 auto 14px; place-items: center; border-radius: 50%; color: #fff; font-size: 40px; font-weight: 800; line-height: 1; }
  .result-icon.failure { background: #d64545; }
  .result-icon.success { background: #2e9f5b; }
  .warning-icon { display: inline-grid; width: 18px; height: 18px; place-items: center; border-radius: 50%; background: #d64545; color: #fff; font-size: 13px; font-weight: 800; line-height: 1; vertical-align: middle; }
  .pairing-link-row { display: flex; width: min(100%, 540px); margin: 14px auto 0; gap: 8px; align-items: center; }
  .pairing-link-value { min-width: 0; flex: 1; padding: 9px 10px; border: 1px solid var(--divider-color, #bbb); border-radius: 7px; color: var(--primary-text-color, #111); background: var(--input-fill-color, #fff); font: 13px/1.2 monospace; }
  .pairing-link-copy { display: inline-grid; width: 40px; height: 40px; flex: 0 0 40px; place-items: center; border: 0; border-radius: 8px; color: #fff; background: #55bfe6; cursor: pointer; }
  .pairing-link-copy svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.5; }
  .pairing-link-copy.is-copied { display: inline-flex; width: auto; flex-basis: auto; align-items: center; justify-content: center; padding: 0 12px; gap: 6px; white-space: nowrap; font: inherit; }
  .pairing-link-copy.is-copied svg { width: 18px; height: 18px; }

  .auth-required-content {
    flex: 1;
    display: grid;
    place-items: center;
  }

  .auth-notice {
    width: min(80%, 960px);
    box-sizing: border-box;
    padding: 28px;
    text-align: center;
  }

  @media (max-width: 600px) {
    .auth-notice {
      width: calc(100% - 32px);
    }
  }

  .auth-notice h2 {
    font-size: 20px;
  }

  .auth-notice .action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 10px 14px;
    text-decoration: none;
  }

  .auth-notice-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .help-attention-notice { margin: 28px auto 24px; }

  .share-link-input-wrap { position: relative; display: block; }
  .share-link-input-wrap input { box-sizing: border-box; width: 100%; padding-right: 38px; }
  .share-link-validation { position: absolute; top: 50%; right: 12px; display: grid; width: 20px; height: 20px; place-items: center; border-radius: 50%; color: #fff; background: #d92d20; font-size: 15px; font-weight: 700; line-height: 1; transform: translateY(-50%); }
  .share-link-validation.is-valid { background: #12b76a; }
  .share-link-validation[hidden] { display: none; }

  /* Form and combobox elements */
  form {
    display: grid;
    gap: 12px;
  }

  form label {
    display: grid;
    gap: 4px;
    min-width: 0;
    font-weight: 600;
  }

  form input,
  form select {
    box-sizing: border-box;
    width: 100%;
    padding: 8px;
    border: 1px solid var(--divider-color, #bbb);
    min-height: 40px;
    border-radius: 10px;
    color: inherit;
    background: var(--card-background-color, #fff);
    font: inherit;
  }

  fieldset {
    border: 1px solid var(--divider-color, #ddd);
    border-radius: 12px;
    display: grid;
    gap: 7px;
  }

  form[data-settings-form] .settings-section {
    margin-top: 20px;
    padding: 20px;
    gap: 16px;
    border-color: var(--panel-outline);
    border-radius: 12px;
    background: var(--panel-card);
  }

  form[data-settings-form] .settings-section > legend {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 4px;
    color: var(--panel-text);
    font-size: 16px;
    font-weight: 700;
  }

  form[data-settings-form] .settings-section > legend svg {
    width: 19px;
    height: 19px;
    fill: none;
    stroke: var(--aqua);
    stroke-width: 2;
  }

  .settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    min-height: 48px;
    padding: 14px 0;
    border-top: 1px solid var(--panel-outline);
  }

  .settings-row:first-of-type { border-top: 0; }
  .settings-row strong { display: block; font-size: 14px; }
  .settings-row p { margin: 3px 0 0; color: var(--panel-muted); }

  .settings-switch {
    display: inline-block;
    flex: 0 0 auto;
    position: relative;
    width: 44px;
    height: 24px;
  }

  .settings-switch input { position: absolute; width: 1px; height: 1px; opacity: 0; }
  .settings-switch span { display: block; width: 100%; height: 100%; border-radius: 999px; background: #aab4bc; transition: background .15s ease; }
  .settings-switch span::after { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px #0004; content: ""; transition: transform .15s ease; }
  .settings-switch input:checked + span { background: var(--aqua); }
  .settings-switch input:checked + span::after { transform: translateX(20px); }
  .settings-switch input:focus-visible + span { outline: 2px solid var(--aqua); outline-offset: 3px; }

  .settings-link-row { margin-bottom: -4px; }
  .settings-native-link { display: inline-flex; align-items: center; flex: 0 0 auto; gap: 6px; color: var(--navy); font-weight: 700; text-decoration: none; }
  .settings-native-link:hover { text-decoration: underline; }
  .settings-native-link svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; }
  .settings-device-options { display: grid; gap: 0; margin: -4px 0 0; border: 1px solid var(--panel-outline); border-radius: 8px; overflow: hidden; }
  .settings-device-options[hidden],
  .door-events-section [data-event-image-override-controls][hidden],
  [data-activity-storage-limit-controls][hidden] { display: none; }
  .settings-device-option { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 12px; font-weight: 500; }
  .settings-device-option + .settings-device-option { border-top: 1px solid var(--panel-outline); }
  .settings-device-option input { width: auto; }

  .settings-inline-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: fit-content;
    gap: 7px;
    padding: 9px 12px;
    font-weight: 600;
  }

  .settings-inline-action svg,
  .settings-discard svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }
  .settings-inline-action svg.automation-icon { fill: currentColor; stroke: none; }
  .settings-inline-action svg.automation-icon { width: 25.6px; height: 25.6px; }

  .storage-limit-row {
    align-items: flex-start;
    margin-top: 2px;
  }

  .storage-limit-row .activity-storage-limit-row {
    display: block;
    min-width: min(100%, 420px);
    margin: 0;
  }

  .storage-limit-row .activity-storage-limit {
    justify-content: flex-end;
  }

  .credential-share-intro { display: flex; align-items: flex-start; gap: 16px; }
  .credential-share-intro .settings-section-description { flex: 1 1 auto; min-width: 0; }
  .credential-share-intro .settings-inline-action { flex: 0 0 auto; }
  .remote-instances-section .credential-share-receivers { margin-top: 12px; }
  .settings-list-label { margin: 0 0 6px; color: var(--panel-muted); font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }

  .settings-two-column { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; align-items: start; }
  .settings-two-column .settings-section { min-width: 0; }
  .door-events-section .settings-row, .storage-section .settings-row { padding: 13px 0; }
  .door-events-section .settings-device-options { margin-top: 0; }
  .settings-device-option .settings-switch { width: 38px; height: 22px; }
  .settings-device-option .settings-switch span::after { width: 16px; height: 16px; }
  .settings-device-option .settings-switch input:checked + span::after { transform: translateX(16px); }
  .door-notification-row { align-items: center; }
  .door-notification-dialog { position: relative; display: flex; flex-direction: column; width: min(100% - 32px, 690px); height: min(690px, calc(100vh - 32px)); padding: 0; overflow: visible; overscroll-behavior: contain; }
  .door-notification-dialog .remote-instance-dialog-header { flex: 0 0 auto; padding-bottom: 20px; }
  .door-notification-close { position: absolute; top: 24px; right: 28px; width: 40px; height: 40px; padding: 0; border: 0; color: var(--secondary-text-color, #66758a); background: transparent; font: inherit; font-size: 36px; line-height: 1; cursor: pointer; }
  .door-notification-close:hover, .door-notification-close:focus-visible { color: var(--panel-text); background: transparent; outline: 2px solid var(--aqua); outline-offset: 2px; }
  .door-notification-dialog form { display: flex; flex: 1 1 auto; flex-direction: column; min-height: 0; gap: 14px; padding: 0 48px 24px; }
  .door-notification-step-content { display: flex; flex: 1 1 auto; flex-direction: column; align-items: stretch; justify-content: flex-start; min-height: 0; gap: 14px; padding: 3px; overflow: auto; overscroll-behavior: contain; }
  dialog.door-notification-dialog fieldset { align-self: center; width: min(100%, 420px); gap: 0; padding: 0; overflow: hidden; border-color: var(--panel-outline); text-align: left; justify-content: center; justify-items: start; }
  .door-notification-dialog legend { margin-left: 10px; padding: 0 4px; font-weight: 700; }
  .door-notification-option { display: flex; box-sizing: border-box; width: 100%; align-items: center; gap: 10px; padding: 10px 12px; font-weight: 500; cursor: pointer; }
  .door-notification-option + .door-notification-option { border-top: 1px solid var(--panel-outline); }
  .door-notification-option input { flex: 0 0 auto; }
  .event-types-options { box-sizing: border-box; align-self: center; display: grid; width: 100%; max-width: 560px; gap: 24px; padding: 30px 34px; border: 1px solid var(--panel-outline); border-radius: 16px; text-align: start; background: color-mix(in srgb, var(--panel-card) 94%, var(--panel-surface)); }
  .event-types-options h3 { margin: 0 0 4px; font-size: 20px; line-height: 1.25; }
  .event-types-options .door-notification-option { padding: 0; font-size: 17px; }
  .event-types-options .door-notification-option + .door-notification-option { border-top: 0; }
  .door-notification-dialog .modal-actions { flex: 0 0 auto; justify-content: center; margin: 4px 0 0; }
  .door-notification-dialog a.modal-action { display: inline-flex; align-items: center; text-decoration: none; }
  /* More specific than the responsive wizard rule below: completion needs no full-height canvas. */
  dialog.door-notification-dialog.door-notification-complete {
    box-sizing: border-box;
    width: min(420px, calc(100vw - 32px));
    height: min(390px, calc(100dvh - 32px));
    padding: 28px 32px 24px;
    overflow: hidden;
  }
  .door-notification-complete h2 { margin: 0; font-size: 22px; }
  .door-notification-complete > p { margin: 14px 0 0; color: var(--panel-muted); }
  .door-notification-complete .result-icon {
    position: absolute;
    top: 50%;
    left: 50%;
    margin: 0;
    transform: translate(-50%, -50%);
  }
  .door-notification-complete .result-icon svg {
    width: 32px;
    height: 32px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .door-notification-complete .modal-actions {
    width: 100%;
    box-sizing: border-box;
    justify-content: center;
    margin-top: auto;
    padding-top: 20px;
    border-top: 1px solid var(--panel-outline);
  }
  .door-notification-complete .modal-action,
  .door-notification-complete .modal-cancel { min-width: 150px; }
  .door-notification-complete a.modal-action { justify-content: center; }
  .door-picker-control { position: relative; width: 100%; }
  .door-picker-search { position: relative; display: block; width: 100%; font-weight: 600; }
  .door-picker-search > span { position: absolute; z-index: 1; top: 50%; left: 13px; width: 19px; height: 19px; color: var(--panel-muted); pointer-events: none; transform: translateY(-50%); }
  .door-picker-search svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 2; }
  .door-picker-search input { box-sizing: border-box; min-height: 40px; padding-left: 42px; }
  .door-picker { position: absolute; z-index: 2; top: 100%; left: 0; box-sizing: border-box; width: 100%; max-height: 190px; overflow: auto; border: 1px solid var(--panel-outline); border-radius: 8px; background: var(--panel-card); box-shadow: 0 8px 18px #0003; overscroll-behavior: contain; }
  .notification-service-picker-control .door-picker { position: relative; top: auto; left: auto; margin-top: 6px; }
  .door-picker[hidden] { display: none; }
  .door-picker-results { display: grid; }
  .door-picker-option { padding: 10px 12px; border: 0; border-bottom: 1px solid var(--panel-outline); color: inherit; background: transparent; text-align: left; font: inherit; cursor: pointer; }
  .door-picker-option:last-child { border-bottom: 0; }
  .door-picker-option:hover, .door-picker-option:focus-visible { background: color-mix(in srgb, var(--aqua) 14%, transparent); outline: none; }
  .door-picker .muted { margin: 0; padding: 12px; }
  .notification-service-list, .selection-list { max-height: 360px; margin-top: 6px; overflow: auto; border: 1px solid var(--panel-outline); border-radius: 8px; overscroll-behavior: contain; scroll-snap-type: y mandatory; }
  .door-notification-step-content:has(.notification-service-picker-control), .door-notification-step-content:has(.selection-list-picker-control) { justify-content: flex-start; }
  .door-notification-step-content:has(.notification-service-picker-control) .notification-service-list, .door-notification-step-content:has(.selection-list-picker-control) .selection-list { overflow-x: hidden; overflow-y: auto; scrollbar-gutter: stable; }
  .notification-service-list, .selection-list { scrollbar-width: auto; scrollbar-color: var(--panel-muted) color-mix(in srgb, var(--panel-outline) 45%, transparent); }
  .notification-service-list::-webkit-scrollbar, .selection-list::-webkit-scrollbar { width: 12px; }
  .notification-service-list::-webkit-scrollbar-track, .selection-list::-webkit-scrollbar-track { background: color-mix(in srgb, var(--panel-outline) 45%, transparent); }
  .notification-service-list::-webkit-scrollbar-thumb, .selection-list::-webkit-scrollbar-thumb { min-height: 28px; border: 3px solid transparent; border-radius: 999px; background: var(--panel-muted); background-clip: padding-box; }
  .door-notification-step-content:has(.notification-service-picker-control) .door-picker-search, .door-notification-step-content:has(.selection-list-picker-control) .door-picker-search { z-index: 1; padding-bottom: 6px; background: var(--panel-card); }
  .notification-service-action-option { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 78px; padding: 12px; scroll-snap-align: start; }
  .door-selection-list-option { display: grid; grid-template-columns: 34px minmax(0, 1fr) 20px; align-items: center; gap: 12px; min-height: 52px; padding: 10px 12px; scroll-snap-align: start; }
  .door-selection-list-option.selected { border: 1px solid var(--aqua); border-radius: 8px; background: color-mix(in srgb, var(--aqua) 8%, transparent); }
  .door-selection-list-icon { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 7px; color: var(--panel-muted); background: color-mix(in srgb, var(--panel-muted) 13%, transparent); }
  .door-selection-list-icon svg { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 2; }
  .panel-checkmark { display: inline-grid; box-sizing: border-box; width: 20px; height: 20px; min-width: 20px; min-height: 20px; place-items: center; border: 1px solid var(--panel-outline); border-radius: 2px; color: transparent; background: var(--panel-card); line-height: 1; }
  .panel-checkmark.is-checked { border-color: var(--aqua); color: #fff; background: var(--aqua); }
  .panel-checkmark.is-checked::after { content: "✓"; font-size: 16px; font-weight: 800; }
  .notification-service-action-icon { display: grid; width: 28px; height: 28px; place-items: center; color: var(--panel-muted); }
  .notification-service-action-icon svg { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .notification-service-action-copy { display: grid; min-width: 0; gap: 4px; font-weight: 500; overflow-wrap: anywhere; }
  .notification-service-action-copy small { color: var(--panel-muted); font-size: 12px; font-weight: 400; line-height: 1.35; }
  .notification-service-action-domain { width: fit-content; padding: 2px 7px; border-radius: 5px; color: var(--panel-muted); background: color-mix(in srgb, var(--panel-muted) 12%, transparent); font-size: 11px; font-style: normal; font-weight: 700; }
  .notification-service-action-icon { border-radius: 8px; color: #fff; background: var(--aqua); }
  .notification-service-action-icon svg { width: 21px; height: 21px; fill: currentColor; stroke: none; }
  .notification-service-action-option.selected { border: 1px solid var(--aqua); border-radius: 8px; background: color-mix(in srgb, var(--aqua) 8%, transparent); }
  .notification-service-list, .selection-list { display: grid; gap: 10px; padding: 0; border: 0; border-radius: 0; background: transparent; }
  .notification-service-list .door-picker-option, .selection-list .door-picker-option { box-sizing: border-box; width: 100%; border: 1px solid var(--panel-outline); border-radius: 10px; background: var(--panel-card); }
  .notification-service-list .door-picker-option:hover, .notification-service-list .door-picker-option:focus-visible, .selection-list .door-picker-option:hover, .selection-list .door-picker-option:focus-visible { background: color-mix(in srgb, var(--aqua) 14%, var(--panel-card)); }
  .notification-options { align-self: center; display: grid; width: min(100%, 420px); gap: 8px; }
  .notification-relay-options, .notification-delivery-options { display: grid; gap: 14px; padding: 16px; border: 1px solid var(--panel-outline); border-radius: 12px; background: color-mix(in srgb, var(--panel-card) 94%, var(--panel-surface)); }
  .notification-relay-options .check, .notification-delivery-options .check { display: flex; align-items: center; gap: 7px; color: var(--panel-text); font-weight: 500; text-align: start; }
  .notification-relay-options .check + .check { padding-top: 14px; border-top: 1px solid var(--panel-outline); }
  .notification-relay-options .check input, .notification-delivery-options .check input { margin-right: 0; }
  .notification-delivery-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .notification-select-option { display: grid; grid-template-columns: minmax(0, 1fr) minmax(150px, 190px); align-items: center; gap: 12px; font-size: 14px; font-weight: 500; text-align: start; }
  .notification-select-option select, .notification-select-option > input { box-sizing: border-box; width: 100%; min-height: 42px; padding: 9px 12px; border: 1px solid var(--panel-outline); border-radius: 10px; color: var(--panel-text); background: var(--panel-card); font: inherit; }
  .notification-select-option select { appearance: auto; }
  .notification-field-label { position: relative; display: inline-flex; align-items: center; gap: 6px; }
  .notification-info-button { display: inline-grid; width: 17px; height: 17px; padding: 0; border: 1px solid var(--panel-muted); border-radius: 50%; place-items: center; color: var(--panel-muted); background: transparent; font: inherit; font-size: 11px; font-weight: 700; line-height: 1; }
  .notification-info-button:hover, .notification-info-button:focus-visible { color: var(--aqua); border-color: var(--aqua); }
  .notification-info-tooltip { position: absolute; z-index: 1; top: calc(100% + 7px); left: 0; width: 220px; padding: 8px 10px; border: 1px solid var(--panel-outline); border-radius: 8px; color: var(--panel-text); background: var(--panel-surface); box-shadow: 0 6px 16px color-mix(in srgb, #000 28%, transparent); font-size: 12px; font-weight: 400; line-height: 1.35; opacity: 0; pointer-events: none; transform: translateY(-3px); transition: opacity .15s ease, transform .15s ease; }
  .notification-field-label:has(.notification-info-button:hover) .notification-info-tooltip, .notification-field-label:focus-within .notification-info-tooltip { opacity: 1; transform: translateY(0); }
  .notification-select-option small, .notification-priority-option small { color: var(--panel-muted); font-size: 12px; font-weight: 400; line-height: 1.35; }
  .notification-select-option input:disabled { cursor: not-allowed; opacity: .58; }
  .notification-priority-option { align-items: center !important; padding-top: 12px; border-top: 1px solid var(--panel-outline); }
  .notification-priority-option.has-description { align-items: flex-start !important; }
  .notification-priority-option.has-description > input { align-self: flex-start; margin-top: 2px !important; }
  .notification-priority-option > span { display: grid; gap: 3px; }
  .notification-priority-option strong { font-size: 14px; }
  .notification-select-input { position: relative; display: block; }
  .notification-select-input input { box-sizing: border-box; width: 100%; min-height: 40px; padding-right: 40px; }
  .notification-select-input i { position: absolute; top: 50%; right: 13px; display: grid; width: 18px; height: 18px; place-items: center; color: var(--panel-muted); pointer-events: none; transform: translateY(-50%); }
  .notification-select-input svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; }
  .notification-preview { display: grid; gap: 9px; padding-top: 6px; }
  .notification-preview-heading { color: var(--panel-muted); font-size: 13px; font-weight: 700; letter-spacing: .03em; text-align: center; text-transform: uppercase; }
  .notification-preview-status { min-height: 17px; margin: 0; color: var(--panel-muted); font-size: 12px; line-height: 1.35; text-align: center; }
  .notification-preview-controls { display: flex; align-items: center; justify-content: center; gap: 6px; }
  .notification-preview-select { position: relative; }
  .notification-preview-select-button { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 30px; width: 150px; padding: 3px 8px; border: 1px solid var(--panel-outline); border-radius: 7px; color: var(--panel-text); background: var(--panel-card); font: inherit; font-size: 12px; font-weight: 600; letter-spacing: 0; text-align: left; text-transform: none; }
  .notification-preview-select-button i { font-size: 16px; font-style: normal; line-height: 1; }
  .notification-preview-device { width: 86px; }
  .notification-preview-select-menu { position: absolute; z-index: 4; top: calc(100% + 4px); left: 0; display: grid; min-width: 100%; overflow: hidden; border: 1px solid var(--panel-outline); border-radius: 7px; background: var(--panel-surface); box-shadow: 0 5px 14px color-mix(in srgb, #000 28%, transparent); }
  .notification-preview-device-select .notification-preview-select-menu { right: 0; left: auto; }
  .notification-preview-select-menu[hidden] { display: none; }
  .notification-preview-select-menu button { min-height: 30px; padding: 5px 8px; border: 0; color: var(--panel-text); background: transparent; font: inherit; font-size: 12px; font-weight: 600; text-align: left; white-space: nowrap; }
  .notification-preview-select-menu button:hover, .notification-preview-select-menu button:focus-visible { color: var(--panel-text); background: color-mix(in srgb, var(--aqua) 20%, var(--panel-surface)); outline: none; }
  .notification-preview-send { position: relative; display: grid; width: 64px; min-width: 64px; min-height: 30px; place-items: center; padding: 3px 8px; border: 1px solid var(--aqua); border-radius: 7px; color: #fff; background: var(--aqua); font: inherit; font-size: 12px; font-weight: 700; }
  .notification-preview-send:disabled { cursor: wait; opacity: .8; }
  .notification-preview-send-spinner { display: none; box-sizing: border-box; width: 15px; height: 15px; border: 2px solid rgb(255 255 255 / .45); border-top-color: #fff; border-radius: 50%; animation: notification-preview-spin 700ms linear infinite; }
  .notification-preview-send.is-sending > span { visibility: hidden; }
  .notification-preview-send.is-sending .notification-preview-send-spinner { position: absolute; display: block; }
  .notification-preview-send.is-sent { border-color: #16803c; background: #16803c; }
  .notification-preview-card { display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: 11px; padding: 13px; border: 1px solid var(--panel-outline); border-radius: 10px; background: color-mix(in srgb, var(--panel-card) 90%, var(--panel-surface)); }
  .notification-preview-card.is-ios { border-color: #d1d1d6; border-radius: 15px; color: #1c1c1e; background: #f2f2f7; }
  .notification-preview-card.is-ios .notification-preview-icon { border-radius: 10px; background: #007aff; }
  .notification-preview-card.is-ios .notification-preview-app, .notification-preview-card.is-ios p { color: #636366; }
  .notification-preview-card.is-android { border-radius: 9px; }
  .notification-preview-icon { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 10px; color: #fff; background: var(--aqua); }
  .notification-preview-icon svg { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 2; }
  .notification-preview-app { display: flex; justify-content: space-between; gap: 8px; color: var(--panel-muted); font-size: 12px; font-weight: 600; }
  .notification-preview-app small { font: inherit; font-weight: 400; }
  .notification-preview-card strong { display: block; margin-top: 3px; font-size: 14px; }
  .notification-preview-card p { margin: 3px 0 0; color: var(--panel-muted); font-size: 13px; line-height: 1.35; }
  .notification-preview-action { grid-column: 1 / -1; min-height: 30px; margin-top: 1px; padding: 5px 10px; border: 0; border-radius: 7px; color: var(--panel-text); background: color-mix(in srgb, var(--panel-muted) 14%, var(--panel-card)); font: inherit; font-size: 12px; font-weight: 600; }
  .notification-preview-card.is-ios .notification-preview-action { box-sizing: border-box; width: 100%; margin-top: 1px; border-top: 1px solid #d1d1d6; border-radius: 0; color: #007aff; background: transparent; text-align: center; }
  .notification-preview-card.is-android .notification-preview-action { padding: 4px 0; color: var(--aqua); background: transparent; font-size: 11px; letter-spacing: .04em; text-align: left; text-transform: uppercase; }
  .notification-preview-image, .notification-preview-image-placeholder { display: grid; grid-column: 1 / -1; box-sizing: border-box; width: 100%; height: 96px; margin-top: 10px; place-items: center; border-radius: 8px; color: var(--panel-muted); background: color-mix(in srgb, var(--panel-muted) 10%, transparent); }
  .notification-preview-image[hidden], .notification-preview-image-placeholder[hidden] { display: none; }
  .notification-preview-image { position: relative; overflow: hidden; }
  .notification-preview-image img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center center; opacity: 1; transition: opacity 120ms ease; }
  .notification-preview-image.is-loading img { opacity: 0; }
  .notification-preview-image-spinner { position: absolute; width: 24px; height: 24px; border: 3px solid color-mix(in srgb, var(--panel-muted) 25%, transparent); border-top-color: var(--aqua); border-radius: 50%; animation: notification-preview-spin 700ms linear infinite; }
  .notification-preview-image:not(.is-loading) .notification-preview-image-spinner { display: none; }
  @keyframes notification-preview-spin { to { transform: rotate(360deg); } }
  .notification-preview-image-placeholder svg { width: 30px; height: 30px; fill: none; stroke: currentColor; stroke-width: 1.8; }
  .automation-name-field { align-self: center; display: grid; width: min(100%, 420px); gap: 7px; font-size: 14px; font-weight: 500; text-align: start; }
  .automation-name-field input { box-sizing: border-box; width: 100%; min-height: 42px; }
  .caller-picker { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 16px 12px; width: 100%; }
  .caller-picker-add, .caller-picker-rule { display: flex; }
  .caller-picker-add { position: relative; flex-direction: column; align-items: center; gap: 6px; }
  .caller-picker-add[hidden] { display: none; }
  .caller-picker-add-button { display: grid; width: 34px; height: 34px; place-items: center; padding: 0; border: 0; border-radius: 999px; color: #fff; background: var(--success-color, #16803c); font: inherit; font-size: 25px; font-weight: 500; line-height: 1; cursor: pointer; }
  .caller-picker-add-button:hover, .caller-picker-add-button:focus-visible { background: color-mix(in srgb, var(--success-color, #16803c) 82%, #000); outline: 2px solid var(--aqua); outline-offset: 2px; }
  .caller-picker-add-label { color: var(--panel-muted); font-size: 13px; line-height: 1.2; }
  .caller-picker-add-menu { position: absolute; z-index: 3; top: calc(100% + 6px); left: 50%; display: grid; min-width: 180px; max-height: 190px; overflow: auto; border: 1px solid var(--panel-outline); border-radius: 8px; background: var(--panel-card); box-shadow: 0 8px 18px #0003; transform: translateX(-50%); overscroll-behavior: contain; }
  .caller-picker-add.opens-upward .caller-picker-add-menu { top: auto; bottom: calc(100% + 6px); }
  .caller-picker-add-menu[hidden] { display: none; }
  .door-notification-step-content:has(.caller-picker-add-menu:not([hidden])) { overflow: visible; }
  .caller-picker-add-menu button { display: flex; align-items: center; gap: 9px; padding: 9px 12px; border: 0; border-bottom: 1px solid var(--panel-outline); color: var(--panel-text); background: transparent; font: inherit; text-align: left; cursor: pointer; }
  .caller-picker-add-menu button:last-child { border-bottom: 0; }
  .caller-picker-add-menu button:hover, .caller-picker-add-menu button:focus-visible { background: color-mix(in srgb, var(--aqua) 16%, var(--panel-card)); outline: none; }
  .caller-picker-menu-heading { padding: 10px 12px 5px; color: var(--panel-muted); font-size: 12px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
  .caller-picker-menu-heading:not(:first-child) { border-top: 1px solid var(--panel-outline); }
  .caller-picker-identity-icon { display: grid; width: 22px; height: 22px; flex: 0 0 22px; place-items: center; color: var(--aqua); }
  .caller-picker-identity-icon svg, .caller-picker-selected-identity svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .door-notification-heading-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px 12px; margin: 16px 0 0; }
  .remote-instance-dialog-header .door-notification-heading-row p { margin: 0; }
  .caller-picker-rule[hidden] { display: none; }
  .caller-picker-add select, .caller-picker-rule select { width: auto; max-width: 100%; min-width: 0; }
  .caller-condition-summary { box-sizing: border-box; display: block; flex: 0 0 min(100%, 620px); margin: 0; padding: 10px 14px; border: 1px solid color-mix(in srgb, var(--aqua) 40%, var(--panel-outline)); border-radius: 12px; background: color-mix(in srgb, var(--aqua) 5%, var(--panel-card)); font-size: 18px; line-height: 1.9; text-align: center; }
  .caller-condition-summary .door-picker-badges { display: contents; }
  .caller-condition-summary .door-selection-badge, .caller-condition-summary .caller-picker-rule { margin: 3px 2px; vertical-align: middle; }
  .caller-condition-summary .caller-picker-rule { display: inline-flex; }
  .caller-condition-punctuation { white-space: pre; }
  .door-picker-badges { display: flex; flex-wrap: wrap; gap: 7px; min-height: 0; }
  [data-door-picker-badges] { justify-content: center; }
  .notification-service-badges { justify-content: center; }
  .door-selection-badge { display: inline-flex; align-items: center; gap: 7px; max-width: 100%; padding: 5px 8px; border: 0; border-radius: 999px; color: var(--panel-text); background: color-mix(in srgb, var(--aqua) 18%, var(--panel-card)); font: inherit; cursor: pointer; }
  .door-selection-badge > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .door-selection-badge .caller-picker-selected-identity { display: inline-flex; align-items: center; gap: 5px; min-width: 0; }
  .door-selection-badge .caller-picker-selected-identity > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .door-selection-badge > span:nth-child(2) { font-size: 18px; font-weight: 700; line-height: .7; }
  .door-selection-badge:hover, .door-selection-badge:focus-visible { background: color-mix(in srgb, var(--aqua) 30%, var(--panel-card)); outline: 2px solid var(--aqua); outline-offset: 2px; }
  .door-selection-badge.is-temporary-key { background: color-mix(in srgb, var(--success-color, #16803c) 20%, var(--panel-card)); }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  .storage-meter-row { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
  .storage-meter-row [data-activity-storage-progress] { display: block; flex: 1 1 auto; min-width: 0; margin: 0; }
  [data-activity-storage-progress] .activity-storage-progress { width: 100%; max-width: none; margin: 0; }
  .storage-limit-input { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 48px; padding: 13px 0; border-top: 1px solid var(--panel-outline); color: var(--panel-muted); font-size: 12px; }
  .storage-limit-value { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 10px; direction: ltr; }
  .storage-limit-input input {
    width: max(52px, calc(var(--storage-limit-digits, 1) * 1ch + 2.75rem));
    padding: 5px 7px;
    text-align: center;
    transition: width 160ms ease;
  }
  .storage-limit-input .activity-storage-limit-description { margin-left: auto; }
  .storage-meter-row .activity-storage-clear { display: grid; flex: 0 0 44px; place-items: center; width: 44px; height: 34px; min-width: 44px; min-height: 34px; padding: 0; }
  .storage-meter-row .activity-storage-clear svg { width: 18px; height: 18px; }
  .storage-section .storage-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: 44px; gap: 8px; margin-top: 14px; }
  .storage-section .storage-actions .activity-storage-transfer-actions { display: contents; }
  .storage-section .storage-actions .activity-storage-action { box-sizing: border-box; width: 100%; height: 100%; min-width: 0; padding: 0 8px; }
  .remote-instances-section .credential-share-receivers { display: grid; gap: 12px; margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--panel-outline); }
  .remote-instances-section .credential-share-receivers .settings-list-label {
    margin: 0 0 8px;
    padding: 0;
    color: var(--panel-text);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0;
    text-transform: none;
    background: transparent;
  }
  .remote-instances-section .credential-share-receiver-row { display: grid; grid-template-columns: 58px minmax(0, 1fr) auto; align-items: center; gap: 16px; margin: 0; padding: 16px; border: 1px solid var(--panel-outline); border-radius: 12px; background: var(--panel-card); }
  .remote-instances-section .credential-share-receiver-icon { display: grid; width: 58px; height: 58px; place-items: center; border-radius: 10px; color: var(--aqua); background: color-mix(in srgb, var(--aqua) 9%, var(--panel-surface)); }
  .remote-instances-section .credential-share-receiver-icon svg { width: 38px; height: 38px; fill: none; stroke: currentColor; stroke-width: 1.8; }
  .remote-instances-section .credential-share-receiver-icon .home-assistant-logo path { stroke: none; }
  .remote-instances-section .credential-share-status { display: block; min-width: 0; margin: 0; white-space: normal; }
  .remote-instances-section .credential-share-copy { display: grid; min-width: 0; gap: 4px; }
  .remote-instances-section .credential-share-title { display: flex; flex-wrap: wrap; align-items: center; gap: 9px; }
  .remote-instances-section .credential-share-status strong { flex: 0 1 auto; min-width: 0; max-width: 100%; overflow-wrap: anywhere; color: var(--panel-text); font-size: 17px; font-weight: 700; }
  .remote-instances-section .credential-share-status em { padding: 4px 10px; border-radius: 999px; font-size: 12px; font-style: normal; font-weight: 600; line-height: 1; }
  .remote-instances-section .credential-share-status small { display: block; min-width: 0; color: var(--panel-muted); font-size: 13px; line-height: 1.35; overflow-wrap: anywhere; white-space: normal; }
  .remote-instances-section .credential-share-receiver-row.connected .credential-share-status em { color: #16723b; background: #dcfae6; }
  .remote-instances-section .credential-share-receiver-row.waiting .credential-share-status em { color: #9a6700; background: #fef0c7; }
  .remote-instances-section .credential-share-receiver-row.disconnected .credential-share-status em, .remote-instances-section .credential-share-receiver-row.expired .credential-share-status em, .remote-instances-section .credential-share-receiver-row.revoked .credential-share-status em { color: #b42318; background: #fee4e2; }
  .remote-instances-section .credential-share-actions { display: flex; align-items: center; gap: 10px; margin: 0; }
  .remote-instances-section .credential-share-action-buttons { display: flex; align-items: center; gap: 10px; }
  .remote-instances-section .credential-share-action-buttons > button, .remote-instances-section .credential-share-actions > .credential-share-menu-button { display: inline-flex; align-items: center; justify-content: center; min-width: 88px; min-height: 42px; padding: 8px 14px; border: 1px solid var(--panel-outline); border-radius: 8px; color: var(--panel-text); background: transparent; font: inherit; font-weight: 600; cursor: pointer; }
  .remote-instances-section .credential-share-actions .credential-share-revoke-button, .remote-instances-section .credential-share-actions .credential-share-delete-button { border-color: color-mix(in srgb, #dc2626 48%, var(--panel-outline)); color: #c62828; }
  .remote-instances-section .credential-share-actions .credential-share-renew-button { border-color: var(--aqua); color: #fff; background: var(--aqua); }
  .remote-instances-section .credential-share-actions .credential-share-delete-button { min-width: 42px; padding: 8px; }
  .remote-instances-section .credential-share-actions .credential-share-delete-button svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; }
  .remote-instances-section .credential-share-actions > .credential-share-menu-button { display: none; width: 42px; min-width: 42px; min-height: 42px; padding: 0; font-size: 24px; line-height: 1; }
  .remote-instances-section .credential-share-action-buttons > button:hover, .remote-instances-section .credential-share-action-buttons > button:focus-visible, .remote-instances-section .credential-share-actions > .credential-share-menu-button:hover, .remote-instances-section .credential-share-actions > .credential-share-menu-button:focus-visible { background: color-mix(in srgb, var(--aqua) 8%, var(--panel-card)); outline: 2px solid var(--aqua); outline-offset: 2px; }
  .remote-instances-section .credential-share-actions .credential-share-revoke-button:hover, .remote-instances-section .credential-share-actions .credential-share-delete-button:hover { background: color-mix(in srgb, #dc2626 8%, var(--panel-card)); }
  .remote-instances-section .credential-share-actions .credential-share-renew-button:hover, .remote-instances-section .credential-share-actions .credential-share-renew-button:focus-visible { background: color-mix(in srgb, var(--aqua) 82%, #000); }
  :host([dark]) .remote-instances-section .credential-share-receiver-row { background: var(--panel-card); }
  :host([dark]) .remote-instances-section .credential-share-receiver-icon { background: color-mix(in srgb, var(--aqua) 14%, var(--panel-control-bg)); }
  :host([dark]) .remote-instances-section .credential-share-receiver-row.connected .credential-share-status em { color: #bbf7d0; background: #143b2b; }
  :host([dark]) .remote-instances-section .credential-share-receiver-row.waiting .credential-share-status em { color: #fde68a; background: #4a3510; }
  :host([dark]) .remote-instances-section .credential-share-receiver-row.disconnected .credential-share-status em, :host([dark]) .remote-instances-section .credential-share-receiver-row.expired .credential-share-status em, :host([dark]) .remote-instances-section .credential-share-receiver-row.revoked .credential-share-status em { color: #fecaca; background: #4a2028; }
  :host([dark]) .remote-instances-section .credential-share-action-buttons > button, :host([dark]) .remote-instances-section .credential-share-actions > .credential-share-menu-button { border-color: #526171; color: var(--panel-text); }
  :host([dark]) .remote-instances-section .credential-share-actions .credential-share-revoke-button, :host([dark]) .remote-instances-section .credential-share-actions .credential-share-delete-button { border-color: #6b3943; color: #fecaca; }
  :host([dark]) .remote-instances-section .credential-share-actions .credential-share-renew-button { border-color: var(--aqua); color: #071721; background: var(--aqua); }
  .remote-instances-section, .sip-section { position: relative; }
  .remote-instances-section .settings-inline-action, .sip-export { background: var(--navy); }
  .remote-instances-section .settings-inline-action { display: flex; width: fit-content; max-width: 100%; margin: 0; padding: 12px 18px; border-radius: 10px; }
  .remote-instances-section .settings-section-description { padding-right: 0; }
  .sip-export { position: absolute; top: 16px; right: 20px; color: white; }
  .sip-section .settings-section-description { padding-right: 210px; }
  .sip-warning { margin: 16px 0 18px; padding: 12px 14px; border-radius: 7px; background: #fff0ef; }
  .sip-details-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .sip-details-grid section { padding: 12px; border-radius: 8px; background: #f4f4f4; }
  .sip-details-grid h3 { margin: 0 0 10px; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
  .sip-details-grid dl { display: grid; gap: 7px; margin: 0; }
  .sip-details-grid dl > div { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 7px 9px; border-radius: 5px; background: #fff; }
  .sip-details-grid dt { font-size: 12px; }
  .sip-details-grid dt small { display: block; font-family: monospace; }
  .sip-details-grid dd { max-width: none; margin: 0; font: 12px/1.2 monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sip-details-grid section:nth-child(2) dl > div {
    grid-template-columns: minmax(0, 1fr) max-content minmax(0, 1fr);
  }
  .sip-details-grid section:nth-child(2) dd {
    display: contents;
  }
  .sip-details-grid section:nth-child(2) dt { justify-self: start; }
  .sip-details-grid .sip-device-extension,
  .sip-details-grid .sip-device-token { white-space: nowrap; }
  .sip-details-grid .sip-device-extension { justify-self: center; }
  .sip-details-grid .sip-device-token { justify-self: end; }

  @media (prefers-color-scheme: dark) {
    form[data-settings-form] .settings-section {
      background: var(--card-background-color, #1f2937);
      border-color: var(--panel-outline);
    }
  }

  @media (max-width: 620px) {
    .settings-page { padding: 18px; }
    .settings-heading { display: grid; gap: 16px; }
    .settings-actions { right: max(16px, env(safe-area-inset-right)); bottom: max(16px, env(safe-area-inset-bottom)); justify-content: stretch; }
    .settings-actions > button { flex: 1; justify-content: center; }
    .settings-row { align-items: flex-start; gap: 16px; }
    .settings-switch { margin-top: 3px; }
    .settings-two-column, .sip-details-grid { grid-template-columns: 1fr; }
    .remote-instances-section .settings-inline-action, .sip-export { position: static; margin-top: 8px; }
    .credential-share-intro { flex-direction: column; gap: 0; }
    .credential-share-intro .settings-inline-action { align-self: flex-end; }
    .remote-instances-section .settings-section-description, .sip-section .settings-section-description { padding-right: 0; }
    .remote-instances-section .credential-share-receiver-row { grid-template-columns: 48px minmax(0, 1fr) auto; gap: 12px; padding: 12px; }
    .remote-instances-section .credential-share-receiver-icon { width: 48px; height: 48px; }
    .remote-instances-section .credential-share-receiver-icon svg { width: 32px; height: 32px; }
    .notification-preview-controls { flex-wrap: wrap; }
    .notification-select-option { grid-template-columns: minmax(0, 1fr) minmax(140px, 180px); }
  }

  @media (max-width: 500px) {
    .remote-instances-section .credential-share-receiver-row { grid-template-columns: 44px minmax(0, 1fr); }
    .remote-instances-section .credential-share-receiver-icon { width: 44px; height: 44px; }
    .remote-instances-section .credential-share-actions { grid-column: 2; justify-self: start; }
  }

  .remote-instances-section { container-type: inline-size; }
  @container (max-width: 640px) {
    .remote-instances-section .credential-share-receiver-row { grid-template-columns: 48px minmax(0, 1fr) auto; gap: 12px; padding: 12px; }
    .remote-instances-section .credential-share-receiver-icon { width: 48px; height: 48px; }
    .remote-instances-section .credential-share-receiver-icon svg { width: 32px; height: 32px; }
    .remote-instances-section .credential-share-actions { grid-column: auto; justify-self: end; }
    .remote-instances-section .credential-share-action-buttons { display: none; }
    .remote-instances-section .credential-share-actions > .credential-share-menu-button { display: inline-grid; place-items: center; }
  }

  .check {
    display: block;
    font-weight: 400;
  }

  .panel-checkbox {
    box-sizing: border-box;
    width: 20px;
    height: 20px;
    min-width: 20px;
    min-height: 20px;
    margin: 0;
    accent-color: var(--aqua, #03a9f4);
  }

  .check input:not(.panel-checkbox) {
    width: auto;
    margin-right: 7px;
  }

  /* Keep the keyboard focus treatment consistent for editable controls.
     Checkboxes, radios, switches, and range sliders retain their native cues. */
  input:is(:not([type]), [type="text"], [type="search"], [type="number"], [type="password"], [type="email"], [type="tel"], [type="url"], [type="date"], [type="time"], [type="datetime-local"]):focus {
    outline: 2px solid color-mix(in srgb, var(--aqua, #03a9f4) 35%, transparent);
    outline-offset: 1px;
    border-color: var(--aqua, #03a9f4);
  }

  .combobox {
    display: grid;
    grid-template-columns: 1fr auto;
    position: relative;
  }

  .combobox input {
    min-width: 0;
    border-radius: 8px 0 0 8px;
  }

  .combobox-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--divider-color, #bbb);
    border-left: 0;
    border-radius: 0 8px 8px 0;
    padding: 0 12px;
    color: inherit;
    background: var(--card-background-color, #fff);
  }

  .combobox-toggle svg {
    display: block;
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }

  .combobox-menu {
    position: absolute;
    z-index: 1;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    max-height: 220px;
    overflow: auto;
    border: 1px solid var(--divider-color, #bbb);
    border-radius: 8px;
    background: var(--card-background-color, #fff);
    box-shadow: 0 8px 20px #0003;
  }

  .combobox-menu button {
    display: block;
    width: 100%;
    border: 0;
    padding: 8px 10px;
    color: inherit;
    background: transparent;
    text-align: left;
  }

  .combobox-menu button:hover {
    background: var(--secondary-background-color, #eef7fa);
  }

  /* Home Assistant collapses its sidebar in this tablet-width range. */
  @media (max-width: 870px) {
    main {
      padding: 0 12px 12px;
    }
    main > header {
      position: sticky;
      /* The companion app already lays panel content below its native safe
       * area. Keeping the bar at its normal height avoids counting that inset
       * twice, while the sticky offset keeps the title below a cutout. */
      top: env(safe-area-inset-top, 0px);
      z-index: 10;
      box-sizing: border-box;
      display: grid;
      grid-template-columns: 40px minmax(0, 1fr) auto;
      gap: 8px;
      min-height: 56px;
      height: 56px;
      margin: 0 -12px;
      padding: 0 12px;
      border-radius: 0;
      /* Paint the companion app's safe-area gap as part of the top bar so
       * scrolling content cannot show through above it. */
      box-shadow: 0 calc(0px - env(safe-area-inset-top, 0px)) 0 env(safe-area-inset-top, 0px) var(--app-header-background-color, var(--panel-card));
      text-align: initial;
    }
    .mobile-menu-toggle {
      display: grid;
      grid-column: 1;
      grid-row: 1;
      place-content: center;
      gap: 4px;
      width: 40px;
      height: 40px;
      padding: 0;
      border: 0;
      border-radius: 8px;
      color: var(--panel-text);
      background: transparent;
      cursor: pointer;
    }
    .mobile-menu-toggle:hover { background: var(--mint); }
    .mobile-menu-toggle span {
      display: block;
      width: 21px;
      height: 2px;
      border-radius: 1px;
      background: currentColor;
    }
    .panel-page-title {
      grid-column: 2;
      grid-row: 1;
      min-width: 0;
    }
    h1 { font-size: 20px; }
    header select {
      grid-column: 3;
      grid-row: 1;
      justify-self: end;
      width: min(120px, 28vw);
      margin-left: 0;
      padding: 6px;
      font-size: 13px;
    }
  }
  .share-access-dialog {
    display: flex;
    flex-direction: column;
    width: min(1100px, calc(100vw - 48px));
    height: auto;
    max-height: calc(100vh - 48px);
    padding: 0;
    overflow: hidden;
    text-align: left;
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color, #111);
  }
  .remote-instance-dialog-header { padding: 24px 48px 20px; }
  .remote-instance-dialog-header h2 { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin: 0; color: var(--panel-text); font-size: 30px; line-height: 1.15; }
  .remote-instance-dialog-header p { margin: 8px 0 0; color: var(--panel-muted); font-size: 17px; }
  .door-notification-dialog .remote-instance-dialog-header > p { margin-top: 16px; }
  .wizard-stage-progress { display: grid; grid-template-columns: repeat(var(--wizard-stage-count, 6), minmax(0, 1fr)); gap: 3px; height: 5px; margin: 0 48px 16px; }
  .wizard-stage-progress span { min-width: 0; border-radius: 999px; background: color-mix(in srgb, var(--aqua, #03a9f4) 18%, transparent); transition: background-color 220ms ease; }
  .wizard-stage-progress span.is-complete { background: var(--aqua, #03a9f4); }
  .remote-instance-dialog-header .wizard-stage-progress { margin: 14px 0 12px; }
  [data-share-stage-progress] { --wizard-stage-count: 3; }
  .share-access-close { position: absolute; top: 24px; right: 28px; width: 40px; height: 40px; padding: 0; border: 0; color: var(--secondary-text-color, #66758a); background: transparent; font-size: 36px; line-height: 1; cursor: pointer; }
  .share-access-close:hover { color: var(--primary-text-color, #111); }
  .share-access-dialog input {
    color: var(--primary-text-color, #111);
    background: var(--input-fill-color, var(--card-background-color, #fff));
    border-color: var(--divider-color, #999);
  }
  .share-details-card { display: grid; flex: 0 0 auto; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px; margin: 24px 48px; padding: 20px 28px; border: 1px solid var(--divider-color, #d9e1eb); border-radius: 18px; background: color-mix(in srgb, var(--card-background-color, #fff) 84%, #edf4f9); }
  .share-detail { display: flex; align-items: flex-start; gap: 16px; min-width: 0; }
  .share-detail-icon { display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; width: 48px; height: 48px; border: 1px solid var(--divider-color, #d9e1eb); border-radius: 13px; color: var(--secondary-text-color, #66758a); background: var(--card-background-color, #fff); }
  .share-detail-icon svg, .share-table-section-heading svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .share-detail-icon svg { width: 26px; height: 26px; }
  .share-detail > span:last-child { display: grid; min-width: 0; gap: 5px; }
  .share-detail small { color: var(--secondary-text-color, #66758a); font-size: 14px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
  .share-detail strong { color: var(--primary-text-color, #111); font-size: 12px; }
  .share-generation-details { display: grid; grid-template-columns: minmax(0, 1fr); width: min(640px, calc(100% - 96px)); margin: 16px auto; padding: 0; border: 0; border-radius: 0; background: transparent; }
  .share-generation-details .share-detail { display: grid; gap: 12px; }
  .share-generation-details .share-detail-heading { display: inline-flex; align-items: center; gap: 10px; }
  .share-generation-details .share-detail-icon { width: 36px; height: 36px; border-radius: 10px; }
  .share-generation-details .share-detail-icon svg { width: 20px; height: 20px; }
  .share-generation-details .share-detail small { color: var(--primary-text-color, #111); font-size: 18px; font-weight: 600; letter-spacing: 0; text-transform: none; }
  .share-name-field input { box-sizing: border-box; width: 100%; min-height: 52px; padding: 11px 16px; border: 1px solid var(--panel-outline, var(--divider-color, #cbd5e1)); border-radius: 12px; color: var(--panel-text, inherit); background: var(--card-background-color, #fff); font: inherit; text-align: left; }
  .share-name-field input:focus { outline: 2px solid color-mix(in srgb, var(--aqua, #03a9f4) 35%, transparent); outline-offset: 1px; border-color: var(--aqua, #03a9f4); }
  .share-expiry-options { display: grid; gap: 16px; }
  .share-expiry-field .check { display: flex; align-items: center; gap: 7px; min-height: 24px; }
  .share-expiry-field [data-access-expiry-row] { align-items: center; flex-flow: row wrap; gap: 4px 10px; }
  .share-expiry-field [data-access-expiry-row] > span { display: inline-flex; align-items: center; gap: 7px; }
  .share-expiry-field [data-access-expiry] { box-sizing: border-box; width: min(210px, 100%); min-height: 42px; margin-left: 0; padding: 9px 12px; border: 1px solid var(--panel-outline, var(--divider-color, #cbd5e1)); border-radius: 8px; color: var(--panel-text, inherit); background: var(--card-background-color, #fff); font: inherit; text-align: left; }
  .share-expiry-field [data-access-expiry]:focus { outline: 2px solid color-mix(in srgb, var(--aqua, #03a9f4) 35%, transparent); outline-offset: 1px; border-color: var(--aqua, #03a9f4); }
  .share-permissions { flex: 0 0 auto; margin: 0 48px 24px; overflow: hidden; border: 1px solid var(--divider-color, #d9e1eb); border-radius: 18px; }
  .share-access-dialog .modal-actions { justify-content: center; gap: 12px; margin: 0; padding: 20px 48px; }
  .share-stage-content { display: flex; flex: 1 1 auto; flex-direction: column; justify-content: center; min-height: 0; overflow: auto; overscroll-behavior: contain; }
  .share-stage-content-readonly { justify-content: flex-start; }
  .share-access-dialog .modal-actions { flex: 0 0 auto; }
  .share-access-table { width: 100%; border-collapse: collapse; }
  .share-access-table th, .share-access-table td { padding: 11px 12px; text-align: center; vertical-align: middle; border-bottom: 1px solid var(--divider-color, #e4eaf0); }
.share-access-table thead tr:first-child th { padding: 8px 12px; background: color-mix(in srgb, var(--card-background-color, #fff) 82%, #edf4f9); color: var(--secondary-text-color, #56677d); font-size: 13px; letter-spacing: .05em; text-transform: uppercase; }
  .share-table-section-heading { display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
  .share-table-section-heading svg { width: 27px; height: 27px; color: var(--aqua, #03a9f4); }
  .share-access-table td > input[type="checkbox"] { display: block; margin: 0 auto; }
  .share-access-table td .check {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 100%;
    min-height: 20px;
  }
  .share-access-table td .check input[type="checkbox"],
  .share-access-table td > input[type="checkbox"] {
    box-sizing: border-box;
    width: 20px;
    height: 20px;
    min-width: 20px;
    min-height: 20px;
    margin: 0;
    accent-color: var(--aqua, #03a9f4);
  }
  .share-access-table .share-empty-cell { display: block; text-align: center; }
  .share-access-table .share-select-all-row td { font-weight: 700; background: #e7f7fe; border-top: 2px solid #8bd8f7; border-bottom: 2px solid #8bd8f7; }
  .share-access-table .share-select-all-row td:first-child { color: #075d88; }
  .share-select-all-label { display: inline-flex; align-items: center; gap: 8px; vertical-align: middle; line-height: 1; }
  .share-select-all-label svg { width: 20px; height: 20px; color: var(--aqua, #03a9f4); fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .share-access-table .share-readonly-check, .share-access-dialog .share-readonly-check { margin: 0; }
  .share-access-table .share-permission-control { display: inline-grid; width: 20px; height: 20px; place-items: center; vertical-align: middle; }
  .share-access-table td > .share-permission-control { display: grid; margin: 0 auto; }
  .share-access-table .share-permission-control input[type="checkbox"] { box-sizing: border-box; width: 20px; height: 20px; min-width: 20px; min-height: 20px; margin: 0; accent-color: var(--aqua, #03a9f4); }
  .share-access-table th:first-child, .share-access-table td:first-child { text-align: left; }
  .share-access-table thead tr:last-child th:first-child { text-align: center; }
  .share-device-access-table thead tr:first-child th:nth-child(2),
  .share-device-access-table thead tr:last-child th:nth-child(2),
  .share-device-access-table tbody td:nth-child(2) { border-left: 1px solid var(--divider-color, #d9e1eb); }
  .share-access-table thead tr:first-child th:nth-child(3),
  .share-access-table thead tr:last-child th:nth-child(4),
  .share-access-table tbody td:nth-child(4) { border-left: 1px solid var(--divider-color, #d9e1eb); }
  .share-access-table tbody tr:last-child td { border-bottom: 0; }
  .share-data-table { border-top: 1px solid var(--divider-color, #d9e1eb); }
  .share-data-table .share-access-table { table-layout: fixed; }
  .share-data-table .share-access-table thead tr:first-child th:first-child { width: 33.333%; }
  .share-data-table .share-access-table thead tr:first-child th:nth-child(2) { width: 66.667%; }
  .share-data-table .share-access-table thead tr:last-child th,
  .share-data-table .share-access-table tbody td { width: 33.333%; }
  .share-data-table .share-access-table thead tr:first-child th:nth-child(2),
  .share-data-table .share-access-table thead tr:last-child th:nth-child(2),
  .share-data-table .share-access-table tbody td:nth-child(2) { border-left: 1px solid var(--divider-color, #d9e1eb); }
  .share-status-badge { display: inline-flex; align-items: center; gap: 7px; padding: 7px 12px; border: 1px solid #93e8c5; border-radius: 999px; color: #087a54; background: #effcf5; font-size: 16px; font-weight: 700; }
  .share-status-badge i { width: 11px; height: 11px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 18%, transparent); }
  .share-status-badge.waiting-to-pair { border-color: #f3ca67; color: #8a6100; background: #fff8e4; }
  .share-status-badge.revoked, .share-status-badge.pairing-link-expired { border-color: #f3aaaa; color: #b42318; background: #fff0ef; }
  @media (max-width: 680px) {
    .share-access-dialog { width: calc(100vw - 24px); height: auto; max-height: calc(100vh - 24px); }
    .door-notification-dialog { height: calc(100vh - 24px); }
    .remote-instance-dialog-header { padding: 26px 24px 22px; }
    .remote-instance-dialog-header h2 { font-size: 24px; padding-right: 28px; }
    .remote-instance-dialog-header p { font-size: 16px; }
    .share-stage-progress { margin-right: 24px; margin-left: 24px; }
    .door-notification-dialog form { padding-right: 24px; padding-left: 24px; }
    .door-notification-close { top: 22px; right: 16px; }
    .share-details-card { grid-template-columns: 1fr; gap: 20px; margin: 22px 24px; padding: 22px; }
    .share-generation-details { width: calc(100% - 48px); margin: 16px auto; padding: 0; }
    .share-permissions { margin: 0 24px 22px; overflow-x: auto; }
    .share-access-dialog .modal-actions { padding: 22px 24px; }
  }

  @media (max-width: 600px) {
    .share-access-table { table-layout: fixed; }
    .share-access-table th { text-align: center; vertical-align: middle; }
    .share-access-table th:first-child,
    .share-access-table td:first-child { width: 34%; }
    .share-access-table thead tr:last-child th:not(:first-child),
    .share-access-table tbody td:not(:first-child) { width: 11%; }
    .share-data-table .share-access-table thead tr:first-child th:first-child { width: 33.333%; }
    .share-data-table .share-access-table thead tr:first-child th:nth-child(2) { width: 66.667%; }
    .share-data-table .share-access-table thead tr:last-child th,
    .share-data-table .share-access-table tbody td { width: 33.333%; }
    .share-access-table thead tr:last-child th:not(:first-child) {
      position: relative;
      height: 82px;
      padding: 0 2px;
      vertical-align: middle;
    }
    .share-access-table .share-permission-label {
      position: absolute;
      top: 50%;
      left: 50%;
      display: block;
      width: 78px;
      transform: translate(-50%, -50%) rotate(-90deg);
      white-space: normal;
      overflow-wrap: anywhere;
      line-height: 1.15;
      text-align: center;
    }
    .share-access-table th,
    .share-access-table td { padding: 10px 3px; }
    .share-access-table .share-select-all-label { gap: 5px; }
    .share-access-table .share-select-all-label svg { width: 18px; height: 18px; }
  }

  /* Hebrew and other right-to-left content follows the reading direction,
     while credentials, codes, and machine-readable links stay LTR. */
  :host([dir="rtl"]) { direction: rtl; }
  :host([dir="rtl"]) main { text-align: right; }
  :host([dir="rtl"]) header select { margin-right: auto; margin-left: 0; }
  /* Keep the scroller itself LTR so Safari reports a conventional, usable
     scrollLeft value. The inner navigation remains RTL, preserving the
     Hebrew tab order while allowing touch swipes to reveal overflow. */
  :host([dir="rtl"]) .tab-scroll-viewport { direction: ltr; touch-action: pan-x; }
  :host([dir="rtl"]) .tab-scroll-viewport nav { direction: rtl; }
  :host([dir="rtl"]) .door-notification-close,
  :host([dir="rtl"]) .share-access-close { right: auto; left: 28px; }
  :host([dir="rtl"]) .sip-export { right: auto; left: 20px; }
  :host([dir="rtl"]) .remote-instances-section .settings-section-description,
  :host([dir="rtl"]) .sip-section .settings-section-description { padding-right: 0; padding-left: 210px; }
  :host([dir="rtl"]) .remote-instances-section .settings-section-description { padding-left: 0; }
  :host([dir="rtl"]) .credential-share-receiver-row .credential-share-status > span:last-child,
  :host([dir="rtl"]) .credential-share-receiver-row .credential-share-status strong,
  :host([dir="rtl"]) .remote-instances-section .credential-share-status { margin-left: 0; margin-right: 4px; }
  :host([dir="rtl"]) .remote-instances-section .credential-share-actions { margin-right: 0; margin-left: 10px; }
  :host([dir="rtl"]) input,
  :host([dir="rtl"]) .pairing-link-value,
  :host([dir="rtl"]) code,
  :host([dir="rtl"]) .share-link-input-wrap input { direction: ltr; text-align: left; }
  :host([dir="rtl"]) .share-link-validation { right: auto; left: 12px; }
  :host([dir="rtl"]) .share-link-input-wrap input { padding-right: 12px; padding-left: 38px; }
  :host([dir="rtl"]) .activity-storage-progress-label { direction: ltr; unicode-bidi: isolate; }
  :host([dir="rtl"]) .door-notification-dialog fieldset,
  :host([dir="rtl"]) .door-picker-option,
  :host([dir="rtl"]) .caller-picker-add-menu button { text-align: right; }
  :host([dir="rtl"]) .door-picker-search input,
  :host([dir="rtl"]) input[name="automation-name"],
  :host([dir="rtl"]) .share-name-field input { direction: rtl; text-align: right; }
  :host([dir="rtl"]) .share-access-table thead tr:first-child th { text-align: center; }
  :host([dir="rtl"]) .share-device-access-table thead tr:first-child th:nth-child(2),
  :host([dir="rtl"]) .share-device-access-table thead tr:last-child th:nth-child(2),
  :host([dir="rtl"]) .share-device-access-table tbody td:nth-child(2),
  :host([dir="rtl"]) .share-access-table thead tr:first-child th:nth-child(3),
  :host([dir="rtl"]) .share-access-table thead tr:last-child th:nth-child(4),
  :host([dir="rtl"]) .share-access-table tbody td:nth-child(4),
  :host([dir="rtl"]) .share-data-table .share-access-table thead tr:first-child th:nth-child(2),
  :host([dir="rtl"]) .share-data-table .share-access-table thead tr:last-child th:nth-child(2),
  :host([dir="rtl"]) .share-data-table .share-access-table tbody td:nth-child(2) {
    border-left: 0;
    border-right: 1px solid var(--divider-color, #d9e1eb);
  }
  :host([dir="rtl"]) .door-notification-dialog legend { margin-left: 0; margin-right: 10px; }
  :host([dir="rtl"]) .door-picker { left: auto; right: 0; }
  :host([dir="rtl"]) .notification-service-picker-control .door-picker { right: auto; }

  @media (max-width: 680px) {
    :host([dir="rtl"]) .door-notification-close { right: auto; left: 16px; }
    :host([dir="rtl"]) .remote-instances-section .settings-section-description,
    :host([dir="rtl"]) .sip-section .settings-section-description { padding-left: 0; }
  }
`;
