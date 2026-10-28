# Apple Home: camera, unlock and doorbell alerts

This guide puts an Akuvox SmartPlus door into Apple Home on iPhone, iPad, Mac and Apple TV:

- the door camera, with live view and a snapshot tile;
- a **lock** tile that unlocks the door;
- a **doorbell notification** with the camera picture when someone calls from the panel.

It uses Home Assistant's built-in [HomeKit Bridge](https://www.home-assistant.io/integrations/homekit/), the [ha-sip](https://github.com/arnonym/ha-plugins/tree/main/ha-sip) add-on and the example package in [`examples/apple_home_package.yaml`](examples/apple_home_package.yaml).

Two-way audio with the visitor stays in the SmartPlus app. HomeKit can't relay the SmartPlus call.

## 1. Camera and lock

1. Copy [`examples/apple_home_package.yaml`](examples/apple_home_package.yaml) to `/config/packages/`. Replace the camera and relay entity IDs, as described at the top of the file.
2. If `configuration.yaml` doesn't load packages yet, add this:

   ```yaml
   homeassistant:
     packages: !include_dir_named packages
   ```

3. Restart Home Assistant. The first time, a full restart is needed because the `homekit` YAML bridges are only created at startup.
4. Under **Notifications**, HA shows one pairing code per bridge. In the Home app, choose **+ → Add Accessory → More options** and add both bridges.
5. Put the lock in the same room as the camera, so it appears on the doorbell notification.

Why it's built this way:

- **The relay is a lock, not the raw button.** HomeKit Bridge shows a `button` entity as an on/off switch. The template lock presses the relay and reports "unlocked" for 5 seconds. Apple Home then treats it like any door lock: iPhone and iPad ask for Face ID before unlocking from a locked screen, and Apple TV can unlock it.
- **The camera has its own bridge in accessory mode.** This is what HomeKit recommends for cameras, and it's required for the doorbell notification.
- **`support_audio: false` is set.** The SmartPlus cloud stream's audio can't be relayed to HomeKit.

## 2. Doorbell alerts

### Why the door log isn't enough

The SmartPlus door log in many buildings records only unlocks, not calls. Even where calls are logged, they arrive late. Ring detection that works in real time listens on a SmartPlus SIP line instead.

When a SmartPlus account is called, the panel sends a SIP call to that account's SIP line. The ha-sip add-on registers on that line in **listen** mode. It never answers; it only sets `sensor.ha_sip_account_1` to `true` while the panel is ringing.

### Set up the SIP line

1. In SmartPlus, use a dedicated **family member** account for Home Assistant, not your own app login. Your phone then keeps ringing normally.
2. Get that account's SIP details from **Akuvox SmartPlus → Settings → SIP export** in Home Assistant. You need the server, port, user name and password.
3. In the SmartPlus app on the main account, open **Call Settings**:
   - **Call Type:** set it to **SmartPlus**, the app. "Phone" (landline) calling only works if your building has the landline service; without it the panel answers every call with an immediate busy signal.
   - **Contact Preference:** set it to **Group Call**, so the Home Assistant line rings at the same time as your phones. With Sequence Call, it only rings once the earlier accounts time out.

### Install ha-sip

Add the repository `https://github.com/arnonym/ha-plugins` in **Settings → Add-ons → Add-on store → ⋮ → Repositories**, install **ha-sip**, and set:

```yaml
sip:
  enabled: true
  registrar_uri: "sip:<sip server>:<port>;transport=tcp"
  id_uri: "sip:<sip user>@<sip server>"
  realm: "*"
  user_name: "<sip user>"      # keep the quotes: SmartPlus SIP users are numbers
  password: "<sip password>"   # keep the quotes as well
  answer_mode: listen
sensors:
  enabled: true                # creates sensor.ha_sip_account_1
  entity_prefix: ha_sip
```

This was tested with ha-sip 5.6. Start the add-on. Its log should show `registration success, status=200`.

If saving fails with `expected str`, the user name or password is missing its quotes.

Use the sensor, not ha-sip's webhook. The add-on calls webhooks through the Supervisor proxy, and those requests reach Home Assistant without a client IP. A `local_only` webhook then drops them, while ha-sip still logs `Webhook response 200`.

### Test without a visitor

In **Developer tools → States**, pick `sensor.ha_sip_account_1`, set the state to `true` and choose **Set state**. The doorbell sensor turns on for 20 seconds, and every Apple device in the home shows the doorbell notification. Afterwards set it back to `false` the same way; the doorbell only fires when the sensor changes to `true`.

On a real ring, ha-sip's log shows `Incoming call from ...` followed by `Sensor update sensor.ha_sip_account_1: 200`.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| ha-sip logs the incoming call and `Webhook response 200`, but the doorbell stays off | You're using ha-sip's webhook. Home Assistant answers 200 even when it ignores a webhook, and it ignores proxied add-on requests to `local_only` webhooks. Enable ha-sip's `sensors` option and trigger on `sensor.ha_sip_account_1`, as in the example package. |
| `sensor.ha_sip_account_1` turns `true`, but the doorbell stays off | Reload **Template entities** (Developer tools → YAML) or restart after every edit to the package. |
| ha-sip registers but never logs an incoming call | Check the SmartPlus Call Settings above: Call Type **SmartPlus** and Contact Preference **Group Call**. Also check that the SIP details belong to the account that the panel calls. |
| The lobby panel gives an immediate busy signal | Call Type is set to "Phone", but the building has no landline service. Switch back to **SmartPlus**. |
| Apple Home live view stops after about 5 seconds, or the camera tile shows "No Response" | You need a version of this integration that gives HomeKit a go2rtc restream and cached snapshots. |
| The lock tile shows but unlocking does nothing | Check **Settings → Repairs** and the Akuvox integration for a re-authentication request: SmartPlus can end the session, and every unlock then fails with `token invalid` in the log. Sign in again. |
| The unlock shows as an on/off switch | Expose the template **lock** from the package to HomeKit, not the `button` entity. |
| An accessory disappears from Apple Home after reinstalling the integration | Call the `homekit.reset_accessory` action on its entity. If it's still missing, remove the bridge in the Home app and pair it again. |
