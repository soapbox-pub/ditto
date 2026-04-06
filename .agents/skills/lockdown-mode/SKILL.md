---
name: lockdown-mode
description: iOS Lockdown Mode restrictions and their impact on web APIs inside WKWebView/Capacitor. Reference when debugging or building features for lockdown-enabled devices.
---

# iOS Lockdown Mode

Apple's Lockdown Mode is an opt-in security hardening profile on iOS/macOS that disables or restricts many web platform APIs inside Safari and WKWebView. Since this app ships inside a Capacitor WKWebView shell, **every restriction that applies to Safari also applies to our app**.

This document is based on testing against **iOS 18.7 / Safari 26.4** on an iPhone with Lockdown Mode enabled (April 2026).

## Blocked APIs

These APIs are **completely unavailable** (return `undefined`, `null`, or throw) when Lockdown Mode is active.

| API | Impact | Notes |
|-----|--------|-------|
| **IndexedDB** | Critical | `indexedDB` global is missing entirely. Any library that relies on IndexedDB for storage will fail (Dexie, idb, localForage with IndexedDB driver, etc.). |
| **Service Workers** | High | `navigator.serviceWorker` is absent. No offline caching, no background sync, no push notifications via SW. |
| **Cache API** | High | `caches` global is absent. Often used alongside Service Workers for offline strategies. |
| **WebAssembly** | High | `WebAssembly` global is `undefined`. Libraries compiled to WASM (e.g. libsodium-wrappers, secp256k1-wasm, SQLite WASM) will not load. |
| **Web Locks** | High | `navigator.locks` is absent. Cross-tab coordination patterns that depend on this will break silently. |
| **WebRTC** | High | `RTCPeerConnection` is absent. No peer-to-peer audio/video/data channels. |
| **WebGL / WebGL2** | Medium | All canvas `getContext('webgl'*)` calls return `null`. GPU-accelerated rendering, maps (Mapbox GL, deck.gl), and 3D are broken. |
| **FileReader** | Medium | `FileReader` constructor is absent. Cannot read `Blob`/`File` objects client-side (e.g. image preview before upload). Use the `File` constructor + `URL.createObjectURL()` as a workaround for previews. |
| **SharedArrayBuffer** | Medium | `SharedArrayBuffer` is `undefined`. May also require COOP/COEP headers on non-lockdown browsers, so this is often already unavailable. |
| **Speech Synthesis** | Low | `window.speechSynthesis` is absent. Text-to-speech features won't work. |
| **Notifications API** | Low | `Notification` is absent. Web push permission prompts won't appear. (Capacitor local notifications via the native plugin are unaffected.) |
| **WebCodecs** | Low | `VideoDecoder` / `VideoEncoder` are absent (`AudioDecoder` remains). Low-level media processing is unavailable. |
| **Gamepad API** | Low | `navigator.getGamepads` is absent. |
| **Web Share API** | Low | `navigator.share` is absent. Use Capacitor's `@capacitor/share` plugin instead -- the native share sheet still works. |

## Available APIs

These APIs **still work** under Lockdown Mode and can be relied on.

| API | Notes |
|-----|-------|
| **File constructor** | `new File(...)` works. You can create File/Blob objects. |
| **FontFace API** | Dynamic font loading via `new FontFace()` succeeds. Remote font fetches may fail with a network error (data URIs rejected). |
| **JIT compilation** | JavaScript JIT appears active (~110ms for 1M iterations). Performance is not interpreter-level degraded. |
| **PDF viewer** | `navigator.pdfViewerEnabled` is `true`. Inline `<embed type="application/pdf">` works. |
| **Cookies** | `navigator.cookieEnabled` is `true`. |
| **Credential Management** | `navigator.credentials` is available. |
| **localStorage / sessionStorage** | Standard Web Storage APIs remain functional. |

## Implications for This App

### Storage

- **localStorage works** -- our primary client-side storage (app config, relay lists, etc.) is unaffected.
- **IndexedDB is gone** -- if any dependency silently uses IndexedDB (e.g. some Nostr caching layers, TanStack Query persisters), it will fail. Ensure all storage paths fall back to localStorage or in-memory.

### Cryptography

- **WebAssembly is blocked** -- any WASM-based crypto libraries (secp256k1 compiled to WASM, libsodium WASM builds) will not load. Use pure-JS implementations (e.g. `@noble/secp256k1`, `@noble/hashes`) which are already what nostr-tools uses.
- **WebCrypto (`crypto.subtle`)** -- not listed as blocked in testing. The SubtleCrypto API should still be available for NIP-44 encryption via the standard Web Crypto path.

### Media & Rendering

- **WebGL is gone** -- map libraries that require WebGL (Mapbox GL JS, Google Maps WebGL renderer) will show blank canvases. Use raster tile alternatives or static map images.
- **FileReader is gone** -- image/file preview workflows that use `FileReader.readAsDataURL()` need a workaround. Use `URL.createObjectURL(file)` directly for `<img src>` previews instead.

### Communication

- **WebRTC is gone** -- any peer-to-peer features (voice/video calls, WebRTC data channels) are completely unavailable.
- **Fetch / XMLHttpRequest** -- standard network requests appear unaffected. Relay WebSocket connections should work normally.

### Native Plugin Workarounds

Several blocked web APIs have Capacitor plugin equivalents that bypass WKWebView restrictions entirely:

| Blocked Web API | Capacitor Alternative |
|---|---|
| Web Share | `@capacitor/share` (already installed) |
| Notifications | `@capacitor/local-notifications` (already installed) |
| File downloads | `@capacitor/filesystem` + share (already implemented in `downloadFile.ts`) |

### Detection

The report used a scoring heuristic (7/11 key APIs blocked = 68%) to detect Lockdown Mode. There is no official API to query Lockdown Mode status. Detection relies on probing for the absence of multiple APIs that are specifically disabled by Lockdown Mode but normally present in Safari.

## Raw Diagnostic Report

For exact error messages, navigator properties, weight scores, and per-API diagnostic output, see [lockdown-mode-report.txt](lockdown-mode-report.txt).

## Guidance for Feature Decisions

When building new features, consider:

1. **Always provide pure-JS fallbacks** for any crypto or data-processing library that might ship a WASM build.
2. **Never depend on IndexedDB** as the sole storage mechanism. Always fall back to localStorage or in-memory stores.
3. **Avoid WebGL-dependent UI** for core functionality. Use it as a progressive enhancement with a CSS/Canvas 2D fallback.
4. **Use Capacitor plugins** for sharing, notifications, and file operations rather than web APIs -- they work on all native platforms regardless of Lockdown Mode.
5. **Test on a Lockdown Mode device** when shipping features that touch storage, crypto, or media APIs.
