/**
 * Core design tokens, typography, layout, header, navigation, and base components.
 */

export const mainStyles = `
  :host {
    --aqua: #00a9ce;
    --navy: #003b5c;
    --mint: #76c8c3;
    color: var(--primary-text-color, #17212b);
    display: block;
    max-width: 100%;
    min-width: 0;
    overflow-x: hidden;
    overflow-x: clip;
    width: 100%;
    font: 14px/1.45 var(--paper-font-body1_-_font-family, Arial, sans-serif);
  }

  main {
    box-sizing: border-box;
    max-width: 1440px;
    margin: auto;
    min-width: 0;
    overflow-x: hidden;
    overflow-x: clip;
    padding: 24px;
    width: 100%;
  }

  main.reauthentication-required {
    box-sizing: border-box;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  header {
    display: flex;
    gap: 16px;
    align-items: center;
    padding: 22px;
    color: white;
    border-radius: 18px;
    background: linear-gradient(135deg, #55d9e8 0%, #299fd8 52%, #0c63c9 100%);
  }

  .brand-mark {
    width: 52px;
    height: 52px;
    object-fit: contain;
    filter: brightness(0) invert(1);
  }

  .logo-title-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  h1 {
    margin: 0;
    font-size: 26px;
  }

  header p {
    margin: 2px 0 0;
    opacity: 0.85;
  }

  header select {
    margin-left: auto;
    max-width: 280px;
    padding: 8px;
    border-radius: 8px;
  }

  nav {
    display: flex;
    gap: 5px;
    margin: 20px 0;
    border-bottom: 1px solid var(--divider-color, #ddd);
  }

  .tab-navigation {
    display: flex;
    align-items:stretch;
    box-sizing: border-box;
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    width: 100%;
    margin: 20px 0;
    border-bottom: 1px solid var(--divider-color, #ddd);
  }

  .tab-scroll-viewport {
    flex: 1 1 0;
    min-width: 0;
    width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    scroll-behavior: smooth;
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
    color: var(--primary-text-color, #17212b);
    background: rgb(127 127 127 / 18%);
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
    background: transparent;
    padding: 12px 14px;
    color: inherit;
  }

  .tab.selected {
    color: var(--aqua);
    border-bottom: 3px solid var(--aqua);
    font-weight: 700;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 16px;
  }

  .card {
    border: 1px solid var(--divider-color, #ddd);
    border-radius: 14px;
    padding: 16px;
    background: var(--card-background-color, #fff);
  }

  .card h2 {
    font-size: 16px;
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
    color: white;
    background: #55bfe6;
    border: 0;
    border-radius: 8px;
    padding: 8px 10px;
  }

  .settings-heading {
    margin-bottom: 0;
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
    border-radius: 8px;
    padding: 8px 10px;
  }

  .success:hover {
    background: #15803d;
  }

  .danger {
    color: white;
    background: #dc2626;
    border: 0;
    border-radius: 8px;
    padding: 8px;
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
    padding: 12px;
    border-radius: 10px;
    background: #e9f8fb;
    color: var(--navy);
  }

  .auth-required-content {
    flex: 1;
    display: grid;
    place-items: center;
  }

  .auth-notice {
    width: 100%;
    padding: 28px;
    text-align: center;
  }

  .auth-notice h2 {
    font-size: 20px;
  }

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
    border-radius: 8px;
    color: inherit;
    background: var(--card-background-color, #fff);
    font: inherit;
  }

  fieldset {
    border: 1px solid var(--divider-color, #ddd);
    border-radius: 8px;
    display: grid;
    gap: 7px;
  }

  form[data-settings-form] > fieldset {
    margin-top: 18px;
    padding: 14px 16px 16px;
    gap: 12px;
    border-color: var(--divider-color, #cbd5e1);
    border-radius: 12px;
    background: #e1f5f8;
  }

  form[data-settings-form] > fieldset > legend {
    padding: 0 7px;
    color: var(--primary-text-color, #111);
    font-size: 14px;
    font-weight: 700;
  }

  @media (prefers-color-scheme: dark) {
    form[data-settings-form] > fieldset {
      background: var(--card-background-color, #1f2937);
      border-color: var(--divider-color, #4b5563);
    }
  }

  .check {
    display: block;
    font-weight: 400;
  }

  .check input {
    width: auto;
    margin-right: 7px;
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

  @media (max-width: 600px) {
    main {
      padding: 12px;
    }
    header {
      padding: 16px;
      display: grid;
      grid-template-columns: 1fr;
      justify-items: center;
      text-align: center;
    }
    header select {
      grid-column: auto;
      justify-self: center;
      margin-left: 0;
    }
    .logo-title-row { justify-content: center; }
  }
`;
