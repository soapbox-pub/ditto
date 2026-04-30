---
name: capacitor-compat
description: Browser-API gotchas inside Capacitor's WKWebView (iOS) and Android WebView — which common web APIs silently fail, the downloadTextFile/openUrl helpers that bridge web and native, platform detection, and the installed Capacitor plugins. Load when writing code that interacts with file downloads, external URLs, or platform-specific behavior.
---

# Capacitor Compatibility

Ditto runs inside Capacitor's WKWebView on iOS and WebView on Android. Several common web APIs **do not work** in this environment. Always account for native platforms when writing code that interacts with browser-specific features.

## What Doesn't Work in WKWebView (iOS)

- **`<a download>` file downloads** — programmatically creating an anchor with `a.download` and clicking it silently fails. WKWebView ignores the `download` attribute entirely.
- **`<a target="_blank">` new tabs** — programmatic clicks on anchors with `target="_blank"` are blocked. There are no tabs in a native app.
- **`window.open()`** — may be blocked or behave unexpectedly without user-gesture context.

For a deeper list of Apple Lockdown Mode restrictions that also affect WKWebView, load the **`lockdown-mode`** skill.

## File Downloads and URL Opening

`src/lib/downloadFile.ts` provides two utilities that handle the web/native split automatically. **Always use these** instead of manually constructing anchors.

### `downloadTextFile(filename, content)`

Saves a text file to the user's device. On web it uses the `<a download>` pattern. On native it writes to the Capacitor cache directory via `@capacitor/filesystem` and presents the native share sheet via `@capacitor/share`.

```typescript
import { downloadTextFile } from '@/lib/downloadFile';

await downloadTextFile('backup.txt', fileContents);
```

### `openUrl(url)`

Opens a URL in a new browser tab on web, or presents the native share sheet on Capacitor.

```typescript
import { openUrl } from '@/lib/downloadFile';

await openUrl('https://example.com/image.jpg');
```

**CRITICAL**: Never use `document.createElement('a')` with `.click()` for downloads or opening URLs. The utilities above work correctly on all platforms; manual anchors silently fail on iOS.

## Detecting Native Platforms

Use `Capacitor.isNativePlatform()` from `@capacitor/core` when you need platform-specific behavior:

```typescript
import { Capacitor } from '@capacitor/core';

if (Capacitor.isNativePlatform()) {
  // iOS or Android
} else {
  // Web browser
}
```

Reserve platform forks for cases where behavior genuinely differs (share sheets, secure storage, haptics). Most UI code should stay platform-agnostic.

## Installed Capacitor Plugins

- `@capacitor/app` — app lifecycle events (deep links, back button)
- `@capacitor/core` — core runtime and platform detection
- `@capacitor/filesystem` — read/write files on the native filesystem
- `@capacitor/haptics` — native haptics
- `@capacitor/keyboard` — keyboard control (hide accessory bar, etc.)
- `@capacitor/local-notifications` — schedule local push notifications
- `@capacitor/share` — native share sheet
- `@capacitor/status-bar` — control the native status-bar style
- `@capgo/capacitor-autofill-save-password` — iOS keychain autofill for nsec
- `capacitor-secure-storage-plugin` — OS-level secure storage (iOS Keychain / Android KeyStore)

After adding or removing plugins, run `npm run cap:sync` to update the native projects.
