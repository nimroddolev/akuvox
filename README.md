---
markdown-preview-github-styles.lightTheme
---
[![HACS](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://hacs.xyz/)
[![Release](https://img.shields.io/github/v/release/nimroddolev/akuvox)](https://github.com/nimroddolev/akuvox/releases)
[![Community Forum](https://img.shields.io/badge/community-forum-brightgreen.svg)](https://community.home-assistant.io/t/akuvox-smartplus-view-door-camera-feeds-open-doors-and-manage-temporary-keys/623187)

# Akuvox SmartPlus for Home Assistant

Bring your Akuvox SmartPlus account into Home Assistant to view door cameras, unlock relays, review activity, and build automations around door events.

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/integration-overview-dark.jpeg"><img src="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/integration-overview-light.jpeg" alt="Illustrated overview of camera access, activity, temporary keys, automations, and account sharing" style="width: 100%"></picture></p>

> This is an unofficial community integration that uses SmartPlus's private cloud API. Akuvox or SmartPlus may change that API or its authentication without notice.

## What you get

- Door camera and relay entities in Home Assistant.
- An administrator-only **Akuvox SmartPlus** sidebar panel for devices, activity, temporary key management, automations, settings, and advanced account tools.
- Door-opening events (with event properties) to trigger custom automations.
- Automatic session refresh and a guided reauthentication flow when SmartPlus requires it.
- Optional local history, image & camera rotation, scoped account sharing, temporary keys, and SIP exports.

## Requirements

- A SmartPlus account that already has access to the doors or devices you want to use.
- A Home Assistant administrator account.
- HACS installed in Home Assistant.

## Install with HACS

1. Install [HACS](https://hacs.xyz/docs/installation/manual) if needed.
2. Add this repository as an **Integration**:

   [![Open HACS repository](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=nimroddolev&repository=akuvox&category=integration)

3. Download **Akuvox SmartPlus** from HACS.
4. Restart Home Assistant.

For a manual installation, copy `custom_components/akuvox` into `<your Home Assistant config>/custom_components/akuvox`, then restart Home Assistant. Repeat the copy when updating.

## Connect your SmartPlus account

1. Go to **Settings → Devices & services → Add integration → Akuvox SmartPlus**, or use:

    [![Add Akuvox SmartPlus](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=akuvox)

2. Choose the sign-in method that fits how you use SmartPlus:

    - **Email/username and password** - Enter your account's email and password to receive the emailed verification code to sign in securely.
    - **SMS** - Select your country & phone number to receive an SMS code to sign in securely.
    - **Credentials from another Home Assistant** - Use a pairing link from another Home Assistant instance running the integration (see [Share an account](#share-an-account)).

The country selector chooses the SmartPlus region in most cases. If it does not, select the regional API subdomain manually during setup.

## Features

Your SmartPlus account becomes a Home Assistant hub with camera and relay devices. Open **Akuvox SmartPlus** in the sidebar for the full experience.

| Area | What you can do |
| --- | --- |
| [Devices](#devices) | View live streams and unlock relays. |
| [Latest Activity](#latest-activity) | Browse realtime door activity, including available images. |
| [Call History](#call-history) | Review recent SmartPlus calls and their available images. |
| [Automations](#automations) | Create and manage door-notification automations without YAML. |
| [Temporary Keys](#temporary-keys) | Manage your temporary keys and view their usage. |
| [Settings](#settings) | Configure events, local storage, cameras image options, account sharing and SIP account details. |

Only Home Assistant administrators can open the panel and use its sensitive controls.

### Devices

View live streams and still previews, open RTSP links, and unlock relays from the **Devices** tab. Copied RTSP URLs can contain camera credentials, so treat them like a password and share them only through a trusted channel.

<p><a href="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/devices-preview-light.jpeg"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/devices-preview.jpeg"><img src="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/devices-preview-light.jpeg" alt="Devices tab with a front-door camera preview and relay controls" width="100%" style="max-width: 1350px"></picture></a></p>

### Latest Activity

Browse and filter recent door activity and its available images from the **Latest Activity** tab.

<p><a href="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/latest-activity-preview-light.jpeg"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/latest-activity-preview.jpeg"><img src="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/latest-activity-preview-light.jpeg" alt="Latest Activity tab with filters and a chronological door-event list" width="100%" style="max-width: 1350px"></picture></a></p>

### Call History

Review recent SmartPlus calls and their available images from the **Call History** tab.

<p><a href="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/call-history-preview-light.jpeg"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/call-history-preview.jpeg"><img src="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/call-history-preview-light.jpeg" alt="Call History tab with caller callee status and duration columns" width="100%" style="max-width: 1350px"></picture></a></p>

### Temporary keys

Create, edit, delete, copy, and retrieve QR codes for temporary access from **Akuvox SmartPlus → Temporary Keys**.

<p><a href="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/temporary-keys-preview-light.jpeg"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/temporary-keys-preview.jpeg"><img src="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/temporary-keys-preview-light.jpeg" alt="Temporary Keys tab with generic, masked access codes" width="100%" style="max-width: 1350px"></picture></a></p>

When creating new temporary keys, you can enter the key name and validity period, choose permitted doors, then collect optional identifiers.

<p>
  <a href="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/temporary-key-create-step-1-light.jpeg"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/temporary-key-create-step-1.jpeg"><img src="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/temporary-key-create-step-1-light.jpeg" width="33%" style="max-width: 450px" alt="Create Temporary Key: enter name and validity period"></picture></a>
  <a href="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/temporary-key-create-step-2-light.jpeg"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/temporary-key-create-step-2.jpeg"><img src="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/temporary-key-create-step-2-light.jpeg" width="33%" style="max-width: 450px" alt="Create Temporary Key: choose permitted generic doors"></picture></a>
  <a href="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/temporary-key-create-step-3-light.jpeg"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/temporary-key-create-step-3.jpeg"><img src="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/temporary-key-create-step-3-light.jpeg" width="33%" style="max-width: 450px" alt="Create Temporary Key: enter optional identifiers"></picture></a>
</p>

### Automations

#### Automations Wizard

Use **Akuvox SmartPlus → Automations** to easily build automations triggered by specific doors, event types & family members, that fire off notification events that take advantage of door/person names, live camera images, etc.

<p><a href="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/automations-preview-light.jpeg"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/automations-preview.jpeg"><img src="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/automations-preview-light.jpeg" alt="Automations tab with a no-code front-door notification workflow" width="100%" style="max-width: 1350px"></picture></a></p>


<p>
  <a href="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/automations-wizard-step-1-light.jpeg"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/automations-wizard-step-1.jpeg"><img src="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/automations-wizard-step-1-light.jpeg" width="33%" style="max-width: 450px" alt="Create Automation — choose doors"></picture></a>
  <a href="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/automations-wizard-step-2-light.jpeg"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/automations-wizard-step-2.jpeg"><img src="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/automations-wizard-step-2-light.jpeg" width="33%" style="max-width: 450px" alt="Create Automation — choose events"></picture></a>
  <a href="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/automations-wizard-step-3-light.jpeg"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/automations-wizard-step-3.jpeg"><img src="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/automations-wizard-step-3-light.jpeg" width="33%" style="max-width: 450px" alt="Create Automation — choose people or keys"></picture></a>
  <a href="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/automations-wizard-step-4-light.jpeg"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/automations-wizard-step-4.jpeg"><img src="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/automations-wizard-step-4-light.jpeg" width="33%" style="max-width: 450px" alt="Create Automation — choose notification services"></picture></a>
  <a href="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/automations-wizard-step-5-light.jpeg"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/automations-wizard-step-5.jpeg"><img src="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/automations-wizard-step-5-light.jpeg" width="33%" style="max-width: 450px" alt="Create Automation — notification options"></picture></a>
  <a href="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/automations-wizard-step-6-light.jpeg"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/automations-wizard-step-6.jpeg"><img src="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/automations-wizard-step-6-light.jpeg" width="33%" style="max-width: 450px" alt="Create Automation — name the automation"></picture></a>
</p>

#### Automations via UI/YAML

For full control you can also use the **Door opened** device trigger or listen for `akuvox_door_update` directly in your automations via Home Assistant's UI or YAML.

| Event property | Description | Possible or example values |
| --- | --- | --- |
| `location` | Home Assistant display name of the door that produced the event. | `Front Door`, `Garage` |
| `capture_type` | Type of SmartPlus activity. Known types are normalized; unrecognized SmartPlus values are passed through unchanged. | `Call`, `Face Unlock`, `Temp Key Unlock`, `Unlock on SmartPlus` |
| `initiator` | Person, visitor, or temporary-key name associated with the activity. May be empty. | `Visitor`, `Resident`, `Guest access`, `""` |
| `relay_name` | Relay involved in the action, when SmartPlus reports one. | `Relay1`, `1`, `""` |
| `pic_url` | Private SmartPlus URL for the event image, when available. | `https://…/event.jpg`, `""` |
| `device_id` | Home Assistant device ID for the matching door; present only when the door has a registered Home Assistant device. | Home Assistant device ID string |
| `temporary_key_id` | Stable SmartPlus key ID; present only for a temporary-key unlock when the key name resolves to exactly one configured key. | `guest-key-123` |


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

## Settings

Use **Akuvox SmartPlus → Settings** to configure event-image timing, local history, camera image options, account sharing, SIP account details, and debug logging.

### Share an account

Share a restricted, revocable view of a SmartPlus account with another Home Assistant instance without giving it your SmartPlus username, password, or session tokens. The source instance remains in control: it chooses exactly what the receiver can use and can revoke that access at any time.

<p><a href="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/share-account-nodes-preview-light.jpeg"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/share-account-nodes-preview.jpeg"><img src="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/share-account-nodes-preview-light.jpeg" alt="Share an account settings showing connected, disconnected, waiting, expired, and revoked receivers" style="max-width: 700px"></picture></a></p>

#### Create and transfer a pairing link

1. On the source instance, open **Akuvox SmartPlus → Settings → Create pairing link** and give the receiving Home Assistant instance a recognizable name.
2. Choose whether the link should remain valid indefinitely or expire at a specific date and time. The pairing link itself is single-use and expires after 10 minutes, even if the granted access is configured to last longer.

<p><a href="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/share-account-wizard-step-1-light.jpeg"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/share-account-wizard-step-1.jpeg"><img src="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/share-account-wizard-step-1-light.jpeg" alt="Create pairing link: name the remote instance and set its validity" style="max-width: 600px"></picture></a></p>

Transfer the link through a secure channel. Treat it like a password: anyone who uses it before it expires receives the selected access.

#### Choose what the receiver can access

Select the individual cameras and relays the receiving instance may use. For temporary keys, grant view, creation, and editing permissions independently. Access is limited to the choices made here; unselected devices and permissions remain unavailable to the receiver.

<p><a href="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/share-account-wizard-step-2-light.jpeg"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/share-account-wizard-step-2.jpeg"><img src="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/share-account-wizard-step-2-light.jpeg" alt="Create pairing link: select device and temporary key permissions" style="max-width: 600px"></picture></a></p>

Choose which family members appear in the receiver's **Latest Activity** and **Call History** views. This applies only to shared history and does not change the source account's own data.

<p><a href="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/share-account-wizard-step-3-light.jpeg"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/share-account-wizard-step-3.jpeg"><img src="https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/share-account-wizard-step-3-light.jpeg" alt="Create pairing link: select family member activity and call history access" style="max-width: 600px"></picture></a></p>

#### Connect and manage the receiving instance

On the receiving instance, choose **Credentials from another Home Assistant** during setup and paste the pairing link. Pairing requires the source instance to have a working HTTPS external URL so the receiving instance can connect securely.

The source instance lists every receiver and its status in **Settings**. A receiver can be waiting for its first connection, connected, disconnected, revoked, or shown as expired when its unused pairing link has lapsed. Use the view button to review the granted scope, or revoke access immediately when a receiver is no longer trusted or needed. Revocation stops future shared access; create a new pairing link to reconnect it.

Recipients never sign in to SmartPlus directly. Their access is restricted to the permissions selected by the source instance, and the source's SmartPlus credentials remain private.

### SIP export and local history

The panel can export SIP account mappings as a password-protected PDF. It can also retain local activity history, which defaults to a 5 MB limit. A local-history export can include activity records, call records, and available image previews. You can limit, clear, export, or import this history; set the limit to `0` for unlimited storage. Clearing history removes only the copy stored by this integration in Home Assistant; it does not delete activity or calls from SmartPlus cloud data.

## Security and privacy

- Tokens, pairing secrets, and SIP credentials stay in Home Assistant's private storage and are not sent to the browser panel.
- Images are fetched only when requested and remain limited by the connected account or pairing permissions.
- Treat pairing links, private image URLs, SIP exports, and exported data like passwords.

## Contributing and testing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines. To run the test suite locally, use Python 3.14 and install the development requirements.

To run tests:

```sh
scripts/setup
python3 -m unittest discover -s tests -v
```

The tests simulate SmartPlus responses and never access a live account.

### Browser smoke test

The opt-in browser smoke test signs in to a dedicated Home Assistant test instance and visits every non-destructive panel tab. Do not point it at a production instance. Install the browser test dependencies and Chromium, then provide credentials for an administrator account on an instance where Akuvox SmartPlus is configured:

```sh
npm install
npx playwright install chromium
AKUVOX_HA_URL=http://localhost:8123 \
AKUVOX_HA_USERNAME=smoke-test-admin \
AKUVOX_HA_PASSWORD=change-me \
npm run test:panel-browser
```

## Help and support

For help, use the [Home Assistant community discussion](https://community.home-assistant.io/t/akuvox-smartplus-view-door-camera-feeds-open-doors-and-manage-temporary-keys/623187) or [open an issue](https://github.com/nimroddolev/akuvox/issues). Include your Home Assistant version, integration version, relevant logs, and steps to reproduce. Never include passwords, tokens, pairing links, SIP credentials, or private image URLs.

If this integration is useful to you, you can support its development:

[![Buy me a coffee](https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=%E2%98%95&slug=nimroddolev&button_colour=FFDD00&font_colour=000000&font_family=Inter&outline_colour=000000&coffee_colour=ffffff)](https://www.buymeacoffee.com/nimroddolev)
