[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/integration )<!-- ![version](https://img.shields.io/github/v/release/nimroddolev/akuvox) --> <a href="https://www.buymeacoffee.com/nimroddolev"><img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" height="20px"></a>

# Akuvox SmartPlus Integration for Home Assistant

<img src="https://user-images.githubusercontent.com/1849295/269948645-08c99fe2-253e-49cc-b38b-2a2937c2726d.png" width="100">

Integrate your Akuvox SmartPlus mobile app with Home Assistant. With this integration, you can access you door camera feeds, trigger door relays to open doors, and view your temporary keys _(support for adding temporary keys comming soon)_.

**Disclaimer:** This integration is not affiliated with or endorsed by Akuvox. It is a community-contributed project and is provided as-is without any warranty or guarantee. Use it at your own discretion and responsibility.

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Installation](#installation)
  - [Via HACS (Recommended)](#via-hacs-recommended)
  - [Manual Installation](#manual-installation)
- [Adding the Akuvox Integration](#adding-the-akuvox-integration)
  - [Method 1: SMS Verification (Recommended)](#method-1-sms-verification-recommended)
  - [Method 2: App Tokens (Advanced)](#method-2-app-tokens-advanced)
- [Show Your Support](#show-your-support)

***

## Features

- **Door Camera Feeds:** Access live camera feeds from your Akuvox SmartPlus Door Intercom.
- **Relay Button Control:** Open doors remotely using Home Assistant.
- **Temporary Keys:** View your temporary access keys.

***

## Installation

The easiest way to install Akuvox is though [HACS (the Home Assistant Community Store)](https://hacs.xyz/)

### Via HACS (Recommended)

1. If you don't have HACS installed yet, follow the [official installation guide](https://hacs.xyz/docs/installation/manual).

2. Add the Akuvox SmartPlus repository to HACS by clicking here: <a href="https://my.home-assistant.io/redirect/hacs_repository/?owner=nimroddolev&repository=akuvox&category=integration" title="Akuvox HACS repository" target="_blank"><img loading="lazy" src="https://my.home-assistant.io/badges/hacs_repository.svg"></a>

3. Click `ADD`:

<img src="https://user-images.githubusercontent.com/1849295/269950712-4cdd226d-b0d5-4d8c-8acd-eba7301aa5c3.png" height="200">

4. Restart Home Assistant.

Or:

### Manual Installation

1. Using your file browser of choice open the directory for your HA configuration (where you find configuration.yaml).
2. Create a ```custom_components``` directory if it does not already exist.
3. Add a subdirectory inside ```custom_components``` named ```akuvox```.
4. Download all the files from the ```custom_components/akuvox/``` directory in this repository.
5. Place them into the new ```custom_components/akuvox``` directory you created.
6. Restart Home Assistant.

***

## Adding the Akuvox Integration

1. Click this button: <a href="https://my.home-assistant.io/redirect/config_flow_start/?domain=akuvox" rel="nofollow"><img src="https://camo.githubusercontent.com/637fd24a458765d763a6dced4b312c503f54397bdd9b683584ef8054f305cd7f/68747470733a2f2f6d792e686f6d652d617373697374616e742e696f2f6261646765732f636f6e6669675f666c6f775f73746172742e737667" alt="Open your Home Assistant instance and start setting up a new integration." data-canonical-src="https://my.home-assistant.io/badges/config_flow_start.svg" style="max-width: 100%;"></a> to add the integration.

2. Click `OPEN LINK`

3. Click `OK`:

<img src="https://user-images.githubusercontent.com/1849295/269954970-15b480b7-6e41-4be3-966b-451143ab21a1.png" width="400">

4. Select a sign in method:

<img src="https://user-images.githubusercontent.com/1849295/269956184-eba99117-c9e2-4db9-8b96-011e1ba585e6.png" width="500">

### Method 1: SMS Verification (Recommended)

Sigining in via SMS verification will sign you out from the SmartPlus app on your device. If you wish to stay signed in on the app and also use the integration in Home Assistant please use the [App Tokens](#method-2-app-tokens-advanced) sign in method.

1. Select `Continue sign-in with SMS Verification` and click `NEXT`

<img src="https://user-images.githubusercontent.com/1849295/270022694-4ff0cb9f-2b15-4333-abec-df38e8b61d85.png" width="650">

2. Enter your phone number and click `NEXT` to receive your SMS verification code

<img src="https://user-images.githubusercontent.com/1849295/269956757-ef24502e-38ed-4ea6-9b6e-07c0d50ecdc3.png" width="500">

3. Enter your code and click `SUBMIT`

<img src="https://user-images.githubusercontent.com/1849295/269956800-e5bb633b-db85-4acb-b90d-effa81c1fa05.png" width="400">

### Method 2: App Tokens (Advanced)

To obtain your tokens you can use an HTTP proxy (such as [mitmproxy](https://mitmproxy.org/))

1. Connect your device to your HTTP proxy

2. Log out from your SmartPlus app, and then log in with your phone number and SMS code

3. Search for `akuvox`, and you should see the `servers_list` request. Click on it and in the `Requests` tab you should find your `auth_token` and `token` values:
![mitmproxy](https://github.com/nimroddolev/akuvox/assets/1849295/2972d105-2b5a-47d5-a713-59b869f5949d)

4. Enter your phone number, your `auth_token` and your `token` values and click `SUBMIT`:
<img src="https://user-images.githubusercontent.com/1849295/269958871-071008db-c2d8-4455-a612-eb0a9721ea39.png" width="400">

### You should now have one device per Akuvox door camera

<img src="https://user-images.githubusercontent.com/1849295/270029169-53f3afaf-146b-466b-8950-b7e19da79565.png" width="600">


Once configured, Akuvox cameras & door buttons will appear as a device with a camera entity and a button entity, which when pressed triggers the door relay and opens the doors directly from Home Assistant.

## Show Your Support

If you find Chime TTS useful, consider showing your support:
<a href="https://www.buymeacoffee.com/nimroddolev" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 30px !important;width: 140px !important;" ></a>
