/// <reference types="vite/client" />

// Fontsource packages export CSS — they have no TS declarations
declare module '@fontsource-variable/*';
declare module '@fontsource/comic-relief/*';

interface ImportMetaEnv {
  /** Hex pubkey of the nostr-push server for Web Push notifications. */
  readonly VITE_NOSTR_PUSH_PUBKEY?: string;
  /** Semver version from package.json (e.g., "2.0.0"). */
  readonly VERSION: string;
  /** ISO 8601 timestamp of when the app was built (e.g., "2026-03-26T19:42:00.000Z"). */
  readonly BUILD_DATE: string;
  /** Short git commit SHA (e.g., "c1266823"). Empty string if unavailable. */
  readonly COMMIT_SHA: string;
  /** Git tag for the current commit (e.g., "v2.0.0"). Empty string if untagged (pre-release build). */
  readonly COMMIT_TAG: string;
}

/**
 * Build-time configuration injected by Vite from ditto.json.
 * `null` when no config file was provided at build time.
 */
declare const __DITTO_CONFIG__: Partial<import('@/contexts/AppContext').AppConfig> | null;
