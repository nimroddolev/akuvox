/**
 * Help & Info view: Integration documentation, usage guidelines, project disclaimer, and support link.
 */

/**
 * Render HTML content for the Help & Info tab.
 * @returns {string}
 */
export const renderHelpView = () => `
  <div class="card help-card">
    <div>
      <h2>Help &amp; Info</h2>
      <p class="muted">Manage your SmartPlus devices, activity, calls, and temporary access from Home Assistant.</p>
    </div>
    <div>
      <h3>Using this integration</h3>
      <ul class="help-list">
        <li><strong>Devices</strong> lists cameras and relays. Use Open stream to view a camera, Copy RTSP to copy its credential-bearing stream URL, and Open door to operate a relay.</li>
        <li><strong>Latest activity</strong> and <strong>Call history</strong> are refreshed by polling. Use the filters and column headings to narrow and sort the displayed records.</li>
        <li><strong>Temporary keys</strong> lets administrators add and edit keys. Expired keys are read-only because SmartPlus does not allow them to be modified.</li>
        <li><strong>Settings</strong> contains your connection, polling, display, and panel-access options. Keep authentication and session tokens private.</li>
      </ul>
    </div>
    <div>
      <h3>Documentation and support</h3>
      <p>
        <a class="help-link" href="https://github.com/nimroddolev/akuvox" target="_blank" rel="noreferrer noopener">Read the integration documentation on GitHub</a> · 
        <a class="help-link" href="https://github.com/nimroddolev/akuvox/issues" target="_blank" rel="noreferrer noopener">Report an issue</a>
      </p>
    </div>
    <div class="disclaimer">
      <h3>Independent-project disclaimer</h3>
      <p>This integration is an independent community project. It is not produced by, affiliated with, sponsored by, or endorsed by Akuvox. It is provided “as is” and “as available”, without warranties of any kind. To the maximum extent permitted by applicable law, the authors and contributors disclaim all liability for losses, damage, or other claims arising from or related to its use. You are responsible for verifying its suitability and for using it safely in your environment.</p>
    </div>
    <div>
      <h3>Support the project</h3>
      <p>If this integration is useful to you, please support its development.</p>
      <a class="bmc-banner" href="https://www.buymeacoffee.com/nimroddolev" target="_blank" rel="noreferrer noopener">
        <span class="bmc-banner-icon" aria-hidden="true">☕</span>
        <span>Buy me a coffee</span>
      </a>
    </div>
  </div>
`;
