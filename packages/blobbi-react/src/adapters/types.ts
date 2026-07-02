/**
 * @blobbi/react adapter contracts.
 *
 * Type-only dependency-injection contracts that let host apps supply their own
 * implementations of the services @blobbi/react hooks need — without the package
 * ever importing host internals (`@/`, Ditto UI, toasts, shop catalog, signer,
 * publish, etc.).
 *
 * NOTE (Wave 2A): these are contracts only. No hook consumes them yet. Mutation/
 * publish hooks that will use these adapters are wired up in a later wave.
 */

import type { NostrEvent } from '@nostrify/nostrify';
import type { CareItemEffect } from '@blobbi/core/blobbi-social-projection';

/**
 * Identifies the current viewer/owner. Replaces a host-app `useCurrentUser`.
 */
export interface ViewerAdapter {
  /** Hex pubkey of the logged-in user, or `undefined` when logged out. */
  pubkey: string | undefined;
}

/**
 * Minimal Nostr event template accepted by {@link PublishAdapter.publish}.
 *
 * Mirrors the shape hosts already build for their signer/publish pipeline. The
 * host is responsible for signing, relay fan-out, `client`-tag injection, and
 * `published_at` preservation via `prev`.
 */
export interface PublishEventTemplate {
  kind: number;
  content?: string;
  tags?: string[][];
  created_at?: number;
  /**
   * The previous replaceable/addressable event being superseded, so the host
   * can preserve `published_at` and other invariants during read-modify-write.
   */
  prev?: NostrEvent;
}

/**
 * Publishes a signed Nostr event. Replaces a host-app `useNostrPublish`.
 */
export interface PublishAdapter {
  publish(template: PublishEventTemplate): Promise<NostrEvent>;
}

/**
 * Resolves catalog-item metadata the package needs, without embedding any
 * specific host catalog. Replaces direct `getShopItemById` coupling.
 */
export interface CatalogAdapter {
  /** Resolve a care-item's stat effect by id, or `undefined` if unknown. */
  resolveCareItemEffect(itemId: string): CareItemEffect | undefined;
}

/** Severity of a toast/notification surfaced to the user. */
export type ToastVariant = 'default' | 'success' | 'error' | 'warning';

/**
 * Surfaces user-facing feedback. Replaces a host-app toast. Optional by design:
 * hosts that don't want feedback can omit it and package code no-ops.
 */
export interface ToastAdapter {
  toast(message: { title?: string; description?: string; variant?: ToastVariant }): void;
}

/**
 * Persistent key/value storage. Replaces direct `localStorage` access so the
 * package works in non-DOM hosts (React Native, tests). Defaults to `window`
 * storage in DOM hosts when the host provides no adapter.
 */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Aggregate set of adapters a fully-wired @blobbi/react host would provide.
 * Individual hooks accept only the subset they actually need.
 */
export interface BlobbiReactAdapters {
  viewer: ViewerAdapter;
  publish: PublishAdapter;
  catalog: CatalogAdapter;
  toast?: ToastAdapter;
  storage?: StorageAdapter;
}
