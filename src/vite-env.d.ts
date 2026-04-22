/// <reference types="vite/client" />

// Fontsource packages export CSS — they have no TS declarations
declare module '@fontsource-variable/*';
declare module '@fontsource/comic-relief/*';

interface ImportMetaEnv {
  /** Hex pubkey of the nostr-push server for Web Push notifications. */
  readonly VITE_NOSTR_PUSH_PUBKEY?: string;
  /**
   * Canonical origin used when generating shareable URLs (QR codes, copy-link,
   * remote-login callbacks, etc). Overridden by `shareOrigin` in `ditto.json`
   * and by user config in localStorage. Falls back to `window.location.origin`
   * when unset. Primarily useful for native (Capacitor) builds, where
   * `window.location.origin` is `capacitor://localhost` or `https://localhost`.
   */
  readonly VITE_SHARE_ORIGIN?: string;
  /** Semver version from package.json (e.g., "2.0.0"). */
  readonly VERSION: string;
  /** ISO 8601 timestamp of when the app was built (e.g., "2026-03-26T19:42:00.000Z"). */
  readonly BUILD_DATE: string;
  /** Short git commit SHA (e.g., "c1266823"). Empty string if unavailable. */
  readonly COMMIT_SHA: string;
  /** Git tag for the current commit (e.g., "v2.0.0"). Empty string if untagged (pre-release build). */
  readonly COMMIT_TAG: string;
  /** Build-time configuration injected from ditto.json as a JSON string. `"null"` when no config file was provided. */
  readonly DITTO_CONFIG: string;
}
