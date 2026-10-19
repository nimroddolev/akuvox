# Akuvox SmartPlus for Home Assistant

View door cameras, unlock relays, manage temporary keys, and build door-event automations using your existing SmartPlus account.

> This is an unofficial community integration that uses SmartPlus's private cloud API.

## Overview

![Illustrated overview of camera access, activity, temporary keys, automations, and account sharing](https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/integration-overview-light.jpeg)

## Devices

![Devices tab with a front-door camera preview and relay controls](https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/devices-preview-light.jpeg)

## Latest Activity

![Latest Activity tab with filters and a chronological door-event list](https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/latest-activity-preview-light.jpeg)

## Call History

![Call History tab with caller callee status and duration columns](https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/call-history-preview-light.jpeg)

## Temporary Keys

![Temporary Keys tab with generic, masked access codes](https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/temporary-keys-preview-light.jpeg)

## Automations

![Automations tab with a no-code front-door notification workflow](https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/automations-preview-light.jpeg)

## Account Sharing

![Share an account settings showing connected, disconnected, waiting, expired, and revoked receivers](https://raw.githubusercontent.com/nimroddolev/akuvox/main/docs/images/share-account-nodes-preview-light.jpeg)

## Setup and documentation

After downloading, restart Home Assistant and add **Akuvox SmartPlus** from **Settings → Devices & services**. Sign in using email/password with an emailed verification code, SMS, or a pairing link from another Home Assistant instance.

The **Akuvox SmartPlus** sidebar panel is available to Home Assistant administrators.

See the [full setup instructions, features, and screenshots](https://github.com/nimroddolev/akuvox/blob/main/README.md) for temporary-key and automation wizards, sharing permissions, local history, camera settings, and SIP exports.

## Security and privacy

Treat pairing links, copied RTSP URLs, SIP exports, and exported history as sensitive data. Clearing local history removes only the integration's stored copy, not SmartPlus cloud data.

## Help and support

Visit the [community discussion](https://community.home-assistant.io/t/akuvox-smartplus-view-door-camera-feeds-open-doors-and-manage-temporary-keys/623187) or [report an issue](https://github.com/nimroddolev/akuvox/issues). Remove passwords, tokens, pairing links, and private URLs before sharing logs.
