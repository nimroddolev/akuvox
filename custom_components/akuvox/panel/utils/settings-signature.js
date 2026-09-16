/**
 * Return the portion of Settings data that requires rebuilding its form.
 *
 * Values such as storage usage and receiver sync times are displayed live,
 * but must not replace the form while a native control is open.
 */
export const settingsRenderSignature = (settings = {}) => {
  const {
    activity_history_storage_bytes: _usageBytes,
    credential_shares: credentialShares = [],
    ...savedSettings
  } = settings;

  return JSON.stringify({
    ...savedSettings,
    credential_shares: credentialShares.map(({ share_id, receiver_name, activated, revoked }) => ({
      share_id,
      receiver_name,
      activated,
      revoked,
    })),
  });
};
