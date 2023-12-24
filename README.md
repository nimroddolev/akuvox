[![hacs_badge](https://img.shields.io/badge/HACS-Default-41BDF5.svg)](https://github.com/hacs/integration )
![version](https://img.shields.io/github/v/release/nimroddolev/akuvox)
[![Community Forum][forum-shield]][forum]
<a href="https://www.buymeacoffee.com/nimroddolev"><img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" height="20px"></a>

# Akuvox SmartPlus Integration for Home Assistant

<img src="https://user-images.githubusercontent.com/1849295/269948645-08c99fe2-253e-49cc-b38b-2a2937c2726d.png" width="100">

Integrate your Akuvox SmartPlus mobile app with Home Assistant. With this integration you can access you door camera feeds, trigger door relays to open doors, be notified when doors are opened, and view your temporary keys _(support for adding temporary keys comming soon)_.

**Disclaimer:** This integration is not affiliated with or endorsed by Akuvox. It is a community-contributed project and is provided as-is without any warranty or guarantee. Use it at your own discretion and responsibility.

For troubleshooting and general discussion please join the [discussion in the Home Assistant forum](https://community.home-assistant.io/t/akuvox-smartplus-view-door-camera-feeds-open-doors-and-manage-temporary-keys/623187).

---

## Show Your Support

If you find this integration useful, consider showing your support:
<a href="https://www.buymeacoffee.com/nimroddolev" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 30px !important;width: 140px !important;" ></a>

---

[forum-shield]: https://img.shields.io/badge/community-forum-brightgreen.svg?style=popout
[forum]: https://community.home-assistant.io/t/akuvox-smartplus-view-door-camera-feeds-open-doors-and-manage-temporary-keys/623187

## Table of Contents

- [Features](#features)
  - [Door Camera Feeds](#door-camera-feeds)
  - [Relay Button Control](#relay-button-control)
  - [Temporary Keys](#temporary-keys)
  - [Door Bell & Door Open Events](#door-bell--door-open-events)
    - [YAML Examples](#yaml-examples)
      - [Example 1: Play a sound effect and announce that a door was **rung**](#example-1-play-a-sound-effect-and-announce-that-a-door-was-rung)
      - [Example 2: Send a notification when a door is opened](#example-2-send-a-notification-when-a-door-is-opened)
- [Installation](#installation)
  - [Via HACS (Recommended)](#via-hacs-recommended)
  - [Manual Installation](#manual-installation)
- [Adding the Akuvox Integration](#adding-the-akuvox-integration)
  - [Method 1: SMS Verification (Recommended)](#method-1-sms-verification-recommended)
  - [Method 2: App Tokens (Advanced)](#method-2-app-tokens-advanced)
- [Configuration](#configuration)
- [Finding Your SmartPlus Account Tokens](#finding-your-smartplus-account-tokens)

***

## Features

### Door Camera Feeds
You door camera feeds are accessible as camera entities in Home Assistant.

### Relay Button Control
Your door's relays are added as buttons in Home Assistant which allow you to trigger your doors to open remotely.

### Temporary Keys
You can view your temporary access keys from the SmartPlus app in Home Assistant.

### Door Bell & Door Open Events
Whenever any of your doors are rung or opened, the `akuvox_door_update` event is fired in Home Assistant. When you use the `akuvox_door_update` even as an automation trigger, you will have access to data associated with the specific door ring/open event, accessible under: `trigger.event.data`.

#### 1. `trigger.event.data.Location`
The `Location` value represents the name of the Akuvox door that was rung or opened, eg: `Front Door`, `Side Door`, etc.

#### 2. `trigger.event.data.CallType`
The `CallType` value represents the door event type:
| `CallType` Value | Meaning |
|-|-|
| `Call` | Someone rang the door. |
| `Face Unlock` | The door was opened via facial recognition. |
| `Unlock on SmartPlus` | The door opened by a SmartPlus app account. |

#### 3. `trigger.event.data.Initiator`
The `Initiator` value represents the name of the individual that triggered the event.
| Scenario | Value |
|-|-|
| Door opened by a SmartPlus account holder | `John Smith` |
| Door rung by an unknown individual | `Visitor` |

#### 4. `trigger.event.data.PicUrl`
The `PicUrl` value contains a URL to the camera screenshot image taken at the time of the door ring/open event.

#### 5. `trigger.event.data.RelayName`
The `RelayName` value represents the name of the door relay that was opened (useful if your door has multiple relays), eg: `Relay1`, `Relay2`, etc.

---

##### YAML Examples

###### Example 1: Play a sound effect and announce that a door was _**rung**_

```
trigger:
  - platform: event
    event_type: akuvox_door_update
    event_data:
      CaptureType: Call
    variables:
      door_name: "{{ trigger.event.data.Location }}"

condition: []

action:

  # Play Ding Dong
  - service: media_player.play_media
    target:
      entity_id: media_player.kitchen_speaker
    data:
      media_content_id: media-source://media_source/local/sounds/ding_dong.mp3
      media_content_type: audio/mpeg
    metadata:
      title: ding_dong.mp3
      media_class: music
      navigateIds:
        - {}
        - media_content_type: app
          media_content_id: media-source://media_source
        - media_content_type: ""
          media_content_id: media-source://media_source/local/sounds

  # Wait 3 seconds
  - delay:
      hours: 0
      minutes: 0
      seconds: 3
      milliseconds: 0

  # Announce which door was rung
  - service: tts.google_say
    data:
      entity_id: media_player.macbook_pro
      message: Someone's at the {{ door_name }}
      language: en
```

###### Example 2: Send a notification when a door is _**opened**_

```
trigger:
  - platform: event
    event_type: akuvox_door_update
action:
  - service: notify.notify
    data:
      title: Door Opened
      mwessage: >-
        {{ trigger.event.data.Location }} door opened by {{ trigger.event.data.Initiator }}
```
![notification](https://github.com/nimroddolev/akuvox/assets/1849295/15a49b4f-0b2f-4760-9864-66c06aa483be)



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

1. Click this button: <a href="https://my.home-assistant.io/redirect/config_flow_start/?domain=akuvox" rel="nofollow" target="_blank"><img src="https://camo.githubusercontent.com/637fd24a458765d763a6dced4b312c503f54397bdd9b683584ef8054f305cd7f/68747470733a2f2f6d792e686f6d652d617373697374616e742e696f2f6261646765732f636f6e6669675f666c6f775f73746172742e737667" alt="Open your Home Assistant instance and start setting up a new integration." data-canonical-src="https://my.home-assistant.io/badges/config_flow_start.svg" style="max-width: 100%;"></a> to add the integration.

2. Click `OPEN LINK`

3. Click `OK`:

<img src="https://user-images.githubusercontent.com/1849295/269954970-15b480b7-6e41-4be3-966b-451143ab21a1.png" width="400">

4. Select a sign in method:

<img src="https://user-images.githubusercontent.com/1849295/273309170-31e1e9cf-4d93-469a-9a7c-0bc101b4ac4c.png" width="500">


### Method 1: SMS Verification (Recommended)

Sigining in via SMS verification will sign you out from the SmartPlus app on your device. If you wish to stay signed in on the app and also use the integration in Home Assistant please use the [App Tokens](#method-2-app-tokens-advanced) sign in method.

1. Select `Continue sign-in with SMS Verification` and click `NEXT`

<img src="https://user-images.githubusercontent.com/1849295/270022694-4ff0cb9f-2b15-4333-abec-df38e8b61d85.png" width="650">

2. Enter your phone number and click `NEXT` to receive your SMS verification code

<img src="https://user-images.githubusercontent.com/1849295/269956757-ef24502e-38ed-4ea6-9b6e-07c0d50ecdc3.png" width="500">

3. Enter your code and click `SUBMIT`

<img src="https://user-images.githubusercontent.com/1849295/269956800-e5bb633b-db85-4acb-b90d-effa81c1fa05.png" width="400">


### Method 2: App Tokens (Advanced)

Sigining in using your SmartLife app tokens will allow you to remain signed in to the SmartLife app on your device.

1. Obtain your `auth_token` and `token` values (for help with finding your tokens, please refer to the [Finding you SmartPlus Account Tokens](#finding-your-smartplus-account-tokens) section below).

1. Enter your phone number, `auth_token` and `token` values and click `SUBMIT`:
<img src="https://user-images.githubusercontent.com/1849295/269958871-071008db-c2d8-4455-a612-eb0a9721ea39.png" width="400">

### You should now have one device per Akuvox door camera with a camera and door relay button/s entity

<img src="https://user-images.githubusercontent.com/1849295/270029169-53f3afaf-146b-466b-8950-b7e19da79565.png" width="600">

Once configured, Akuvox cameras & door buttons will appear as a device with a camera entity and a button entity, which when pressed triggers the door relay and opens the doors directly from Home Assistant.


## Configuration

Via the integration's `CONFIGURE` button you can adjust the following:

1. Update your SmartLife account's tokens used to communicate with the Akuvox API. This is particularly useful if you logged into the SmartLife app on your device after adding the integration. For help accessing your account's tokens, please refer to the [Finding you SmartPlus Account Tokens](#finding-your-smartplus-account-tokens) section below.
   
1. Choose between two options for `akuvox_door_update` event handling:
   - Wait for camera screenshots to become available before triggering the event.
   - Receive the event as soon as it is generated, without waiting for camera screenshots.

## Finding your SmartPlus Account Tokens

To obtain your SmartPlus account tokens you can use an HTTP proxy (such as [mitmproxy](https://mitmproxy.org/))

1. Connect your device to your HTTP proxy

2. Log out from your SmartPlus app, and then log in with your phone number and SMS code

3. Search for `akuvox`, and you should see the `servers_list` request. Click on it and in the `Requests` tab you should find your `auth_token` and `token` values:

__NOTE: If you see `passwd` instead of `auth_token`, please use the `passwd` value as your `auth_token`.__

![mitmproxy](https://github.com/nimroddolev/akuvox/assets/1849295/d7d2b7ba-cc0e-4f64-b62b-43850bbc90c1)

