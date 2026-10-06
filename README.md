[![HACS](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://hacs.xyz/)
[![Release](https://img.shields.io/github/v/release/nimroddolev/akuvox)](https://github.com/nimroddolev/akuvox/releases)
[![Community Forum](https://img.shields.io/badge/community-forum-brightgreen.svg)](https://community.home-assistant.io/t/akuvox-smartplus-view-door-camera-feeds-open-doors-and-manage-temporary-keys/623187)

# Akuvox SmartPlus for Home Assistant

Bring an Akuvox SmartPlus account into Home Assistant: view door cameras, unlock relays, manage temporary access, review door and call history, and build automations around door activity.

> This is an unofficial, community-maintained integration. It communicates with SmartPlus's private cloud API and is not affiliated with Akuvox. The service or its authentication can change without notice.

## What it does

- Creates Home Assistant camera, relay-button, temporary-key sensor, and door-open event entities.
- Adds an administrator-only **Akuvox SmartPlus** sidebar panel for cameras, relays, temporary keys, activity, calls, and account settings.
- Supports SMS sign-in or email/username, password, and email verification. Passwords are used only to sign in and are not stored.
- Refreshes supported SmartPlus sessions automatically and guides you through reauthentication when needed.
- Records recent door activity and calls locally; activity storage is optional, size-limited, and can be cleared, exported, or imported from the panel.
- Lets you create, edit, delete, inspect, and fetch QR codes for temporary keys.
- Provides camera-stream and activity-image orientation controls, plus per-camera event-image waiting.
- Includes a device automation trigger for a detected door opening and emits the `akuvox_door_update` event with useful metadata.
- Can share a deliberately scoped SmartPlus view with another Home Assistant instance using a one-time pairing link.
- Displays SIP account mappings and can export them as a password-protected PDF.

## Install

### HACS (recommended)

1. Install [HACS](https://hacs.xyz/docs/installation/manual) if needed.
2. Add this repository as an Integration:
   [![Open HACS repository](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=nimroddolev&repository=akuvox&category=integration)
3. Download **Akuvox SmartPlus**, then restart Home Assistant.

### Manual installation

Copy the repository's `custom_components/akuvox` directory to:

```text
<your Home Assistant config>/custom_components/akuvox
```

Restart Home Assistant after copying the files.

## Set up an account

Open **Settings → Devices & services → Add integration → Akuvox SmartPlus**, or use:

[![Add Akuvox SmartPlus](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=akuvox)

Choose one of these methods:

- **SMS** — Select your country, enter the phone number without its country prefix, then enter the SMS code. SmartPlus can allow only one active SMS session, so this may sign the mobile app out.
- **Email/username and password** — Enter the SmartPlus account name and password, then the emailed verification code. This is generally the best choice when you also use the mobile app.
- **Credentials from another Home Assistant** — Paste a pairing link created by a trusted source instance. See [Share an account](#share-an-account).

The country selector normally chooses the right SmartPlus region. If discovery fails, choose the regional API subdomain manually in the configuration flow or integration options.

## Use the integration

Each configured account is a hub. Its cameras and relays appear as Home Assistant devices, while the **Akuvox SmartPlus** sidebar panel provides the fuller SmartPlus experience.

| Area | Use it for |
| --- | --- |
| Devices | Open live camera streams, view still previews, and unlock relays. |
| Temporary Keys | Review QR/PIN keys and create, edit, or remove access within the permissions of the account. |
| Latest Activity | Review door events and images. Optionally retain history locally with a configurable storage limit. |
| Call History | Review recent SmartPlus calls and their available images. |
| Settings | Adjust image orientation, event-image timing, logging, storage, credential sharing, and SIP export. |

The sidebar panel and its sensitive controls are available only to Home Assistant administrators.

### Automations and events

For each newly detected door activity, the integration emits an
`akuvox_door_update` event. Existing history loaded during the initial refresh
does not emit events. Use the **Door opened** device trigger for the simplest
no-code automation; use the event directly when you need to filter by activity
type, caller, relay, or image.

New automations should use the snake-case fields below. The original aliases
remain in every payload for compatibility with existing automations.

| Canonical field | Legacy alias | Availability | Meaning |
| --- | --- | --- | --- |
| `location` | `Location` | Always | Home Assistant display name for the door. |
| `capture_type` | `CaptureType` | Always | Activity type. Common values are `Call`, `Face Unlock`, and `Unlock on SmartPlus`. Unrecognized SmartPlus values are passed through. |
| `initiator` | `Initiator` | Always | Person or visitor associated with the activity; may be empty. |
| `relay_name` | `RelayName` | Always | Relay involved in the unlock, when reported; otherwise empty. |
| `pic_url` | `PicUrl` | Always | SmartPlus event-image URL, or an empty string when no image is available. Treat this URL as private. |
| `device_id` | — | When the door has a matching Home Assistant device | Home Assistant device ID for filtering an event trigger to one door. |

For more control, trigger directly on the event:

```yaml
alias: Notify when someone rings the front door
triggers:
  - trigger: event
    event_type: akuvox_door_update
    event_data:
      location: Front Door
      capture_type: Call
actions:
  - action: notify.notify
    data:
      title: Someone is at the front door
      message: "{{ trigger.event.data.initiator | default('Visitor', true) }} rang the bell."
mode: single
```

By default the integration waits for an event image before publishing an event. Disable that setting—or override it for a specific camera—when faster notifications matter more than an accompanying image.

## Share an account

An administrator can give another Home Assistant instance a restricted, revocable view of an account.

1. On the source instance, open **Akuvox SmartPlus → Settings → Create pairing link**.
2. Choose the cameras, relays, temporary-key permissions, family-member activity, call history, and optional access expiry to share.
3. Transfer the generated link securely. It is valid for 10 minutes and can be used once.
4. On the receiving instance, choose **Credentials from another Home Assistant** during setup and paste the link.

The source can review connection status, revoke a receiver immediately, or delete a revoked pairing. Shared receivers get only the selected data and permissions; their account never performs a direct SmartPlus login.

Pairing requires a working HTTPS external URL in Home Assistant. Treat pairing links and shared SIP information like passwords.

## Security and privacy

- Authentication tokens, pairing secrets, and SIP credentials are stored in Home Assistant's private storage rather than sent to the browser panel.
- Temporary-key and activity images are retrieved only when requested and are authorized per account or pairing scope.
- Local activity storage defaults to 5 MB and can be disabled, limited, cleared, exported, or imported from the panel. A limit of `0` means unlimited storage.
- SIP exports are password-protected, but still contain powerful credentials—store them carefully.

## Troubleshooting

- **Sign-in or refresh fails:** Reconfigure the integration and authenticate again. Email sign-in avoids the mobile-app SMS-session conflict.
- **No cameras or relays after setup:** Wait for the initial cloud refresh, then reload the integration. Confirm the same account can see the devices in SmartPlus.
- **Events are late:** In panel settings, disable waiting for an event image or change the affected camera's override.
- **A remote instance is stale:** Check the source's external HTTPS URL, then use **Refresh shared credentials** on the receiver. The source panel shows each receiver's connection status.
- **Need more help:** Search or post in the [Home Assistant community discussion](https://community.home-assistant.io/t/akuvox-smartplus-view-door-camera-feeds-open-doors-and-manage-temporary-keys/623187), or open a [GitHub issue](https://github.com/nimroddolev/akuvox/issues) with Home Assistant version, integration version, relevant logs, and steps to reproduce. Never include passwords, tokens, pairing links, SIP credentials, or private image URLs.

Contributions and focused bug reports are welcome.
