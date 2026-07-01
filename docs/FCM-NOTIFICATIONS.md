# FCM Push Notifications (Android)

Battery-free, OS-delivered push notifications for the Android app via Firebase
Cloud Messaging (FCM), bridged through the self-hosted **nostr-push** server.

This replaces what the Android "Push" delivery style used to do (nothing) with
real push. The "Persistent" style — a foreground service that polls relays — is
kept as a fallback for devices without Google Play Services.

## Architecture

```
Nostr event ──▶ nostr-push server (watches relays, matches filters)
                     │  FCM HTTP v1 (deliverFcm)
                     ▼
              Firebase Cloud Messaging
                     │
                     ▼
              Android device ──▶ DittoFirebaseMessagingService / OS tray
```

- The app fetches its FCM token via the `DittoNotification.getFcmToken()`
  native plugin method (`DittoNotificationPlugin.java`).
- `useFcmNotifications` registers one nostr-push subscription per notification
  type (reactions, mentions, zaps, …) with `push_subscription.type: "fcm"`,
  reusing `NOTIFICATION_TEMPLATES` and the same `$contacts` / `#p` filter logic
  as web push.
- RPC events are signed with an **ephemeral per-device keypair** (shared with
  the web push flow) so the user's Nostr signer is never prompted.
- `DittoFirebaseMessagingService` renders foreground messages and handles token
  refresh; backgrounded messages are auto-displayed by the OS from the
  `notification` block the server sends.

## Setup

### 1. nostr-push server

Deploy nostr-push with FCM configured (see the nostr-push repo):

```
FCM_SERVICE_ACCOUNT_KEY='<entire Firebase service-account JSON, one line>'
```

Note the server's `worker_pubkey` from its startup logs.

### 2. Ditto build env

Set the nostr-push server pubkey (required — FCM is inactive without it):

```
VITE_NOSTR_PUSH_PUBKEY="<worker_pubkey hex>"
# Recommended on native builds so subscriptions key off the real domain:
VITE_SHARE_ORIGIN="https://ditto.pub"
```

### 3. Firebase Android app + google-services.json

1. In the Firebase console, add an **Android app** whose package name matches
   `capacitor.config.ts` `appId` (e.g. `pub.ditto.app`, or your test package).
2. Download **google-services.json** and place it at:

   ```
   android/app/google-services.json
   ```

   The `com.google.gms.google-services` Gradle plugin is applied automatically
   when this file is present (see `android/app/build.gradle`). Without it, the
   app still builds — `getFcmToken()` simply rejects and FCM stays inactive.

### 4. Build & run

```
npm run build
npm run cap:sync
npx cap run android   # real device or an emulator with Google Play services
```

FCM requires Google Play Services, so test on a physical device or a
"Google Play" emulator image (not a bare AOSP image).

## Testing without the full app flow

You can validate the server → device path independently:

1. Log the FCM token (it's returned by `getFcmToken()` / logged by the service).
2. Firebase console → Cloud Messaging → "Send test message" to that token to
   confirm the device receives it.
3. Then verify the server path: trigger a matching Nostr event and confirm
   nostr-push's `deliverFcm` sends it.

## Notes

- `android/app/google-services.json` is currently **not** gitignored. For a
  shared/production repo, consider adding it to `.gitignore` and injecting it in
  CI, since it identifies your Firebase app.
- iOS FCM is not wired up yet. The `fcm` transport is platform-neutral on the
  server, so adding iOS later is additive (Firebase iOS SDK + APNs key in
  Firebase + register with `type: "fcm"`).
