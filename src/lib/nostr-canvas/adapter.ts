/**
 * Ditto's implementation of the nostr-canvas `NostrAdapter`.
 *
 * The adapter is the one required integration point between the tile runtime
 * and the host app. It never holds UI or auth state — it delegates every
 * capability to whatever Ditto already uses (the Nostrify pool, the signed-in
 * user's signer, our profile cache, the CORS proxy, the router).
 *
 * Every adapter method on the `NostrAdapter` interface is optional except
 * `subscribe`. When a tile invokes a capability Ditto has chosen not to
 * expose, the runtime replies with a graceful error and the tile keeps
 * running.
 */

import type {
  NostrEvent as NostrifyEvent,
  NostrFilter,
  NostrMetadata,
  NPool,
} from '@nostrify/nostrify';
import { NSchema as n } from '@nostrify/nostrify';
import type { NostrSigner } from '@nostrify/types';
import type {
  NostrAdapter,
  FetchRequest,
  FetchResult,
  NavigateTarget,
  NavigateResult,
  ProfileData,
} from '@soapbox.pub/nostr-canvas';
import type { NavigateFunction } from 'react-router-dom';
import type {
  NostrEvent as NostrToolsEvent,
  UnsignedEvent as NostrToolsUnsignedEvent,
  Filter as NostrToolsFilter,
} from 'nostr-tools';
import { nip19 } from 'nostr-tools';

import { templateUrl } from '@/lib/faviconUrl';
import { genUserName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal subset of the current user we need. Passed in by the provider so
 * the adapter can live outside the React tree and still access the latest
 * signer without re-subscribing to hooks.
 */
export interface AdapterUser {
  pubkey: string;
  signer: NostrSigner;
}

/**
 * Opaque stable container for the bits of app state the adapter reads.
 * Callers mutate `current.*` when the relevant state changes so the adapter
 * always sees the latest values — the runtime itself is a long-lived object
 * and creating a fresh adapter on every auth change would tear it down.
 */
export interface AdapterContextRef {
  /** The current logged-in user, or `null` when logged out. */
  user: AdapterUser | null;
  /** CORS proxy URL template. */
  corsProxy: string;
  /**
   * Lookup a cached kind-0 metadata for a pubkey. Should return `undefined`
   * when no profile is cached.
   */
  getCachedMetadata: (pubkey: string) => NostrMetadata | undefined;
}

export interface CreateAdapterOptions {
  nostr: NPool;
  /**
   * Stable ref-like container. `ref.current` is read on every adapter call
   * so consumers can swap the logged-in user without rebuilding the adapter.
   */
  ref: { current: AdapterContextRef };
  /** React Router `navigate` function. */
  navigate: NavigateFunction;
  /**
   * Called when a published event has been signed; lets the caller plug into
   * Ditto's normal publish pipeline (e.g. adding the NIP-89 client tag).
   * When omitted, the adapter falls back to signing + pool.event() directly.
   */
  publishEvent?: (event: NostrToolsUnsignedEvent) => Promise<NostrToolsEvent>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a `nostr-tools` Filter into the `NostrFilter` shape Nostrify uses.
 * They are structurally identical today, but we cast via `unknown` so the
 * compiler doesn't complain when Nostrify tightens its types in the future.
 */
function toNostrifyFilter(filter: NostrToolsFilter): NostrFilter {
  return filter as unknown as NostrFilter;
}

function toNostrToolsEvent(event: NostrifyEvent): NostrToolsEvent {
  return event as unknown as NostrToolsEvent;
}

/**
 * Resolve a kind-0 event into a nostr-canvas `ProfileData` shape. The library
 * type is a flat `{ [string]: string | undefined }` bag; we fill in the
 * well-known keys from `NostrMetadata` and fall back to a truncated npub for
 * `name`.
 */
function metadataToProfile(
  pubkey: string,
  metadata: NostrMetadata | undefined,
): ProfileData {
  const profile: ProfileData = {};
  if (metadata?.name) profile.name = metadata.name;
  if (metadata?.display_name) profile.display_name = metadata.display_name;
  if (metadata?.nip05) profile.nip05 = metadata.nip05;
  if (metadata?.picture) profile.picture = metadata.picture;
  if (metadata?.about) profile.about = metadata.about;
  if (metadata?.lud16) profile.lud16 = metadata.lud16;
  if (!profile.name && !profile.display_name) {
    profile.name = genUserName(pubkey);
  }
  return profile;
}

/**
 * Make a human-readable short handle for a pubkey. Prefers a verified NIP-05
 * address, falls back to the deterministic `genUserName()` label, and finally
 * to a truncated npub.
 */
function handleForPubkey(
  pubkey: string,
  metadata: NostrMetadata | undefined,
): string {
  if (metadata?.nip05) return metadata.nip05;
  if (metadata?.name) return metadata.name;
  try {
    const npub = nip19.npubEncode(pubkey);
    return `${npub.slice(0, 12)}…`;
  } catch {
    return genUserName(pubkey);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build a `NostrAdapter` for the nostr-canvas runtime wired to Ditto's
 * infrastructure. The returned adapter is stable for the runtime's lifetime —
 * auth and config changes are picked up through the `ref` container.
 */
export function createDittoAdapter(
  opts: CreateAdapterOptions,
): NostrAdapter {
  const { nostr, ref, navigate, publishEvent: publishEventHook } = opts;

  // -------------------------------------------------------------------------
  // subscribe — drives `ctx.request_cache(filter)` in tile Lua
  // -------------------------------------------------------------------------

  /**
   * Subscribe to relay events matching `filter`. We open a single `nostr.req`
   * with `limit: 0, since: now` so the relay only streams new events; the
   * library's `TileManager` handles the initial "what's already cached"
   * reply separately via its own event store.
   *
   * Returns a cleanup function that aborts the subscription. The runtime
   * guarantees it is called when the tile is removed, so we don't need our
   * own teardown accounting.
   */
  function subscribe(
    filter: NostrToolsFilter,
    onEvent: (event: NostrToolsEvent) => void,
  ): () => void {
    const ac = new AbortController();

    (async () => {
      try {
        // First, query historical events honoring the filter as given. This
        // gives tiles immediate data to render instead of waiting for the
        // next matching event to arrive.
        const historical = await nostr.query(
          [toNostrifyFilter(filter)],
          { signal: ac.signal },
        );
        for (const event of historical) {
          if (ac.signal.aborted) break;
          onEvent(toNostrToolsEvent(event));
        }
      } catch {
        // ignore — abort expected, or relay query failed
      }

      if (ac.signal.aborted) return;

      try {
        // Then stream future events. `limit: 0, since: now` ensures the relay
        // only sends new events, not the ones we already delivered above.
        const now = Math.floor(Date.now() / 1000);
        const streamFilter = { ...filter, since: now, limit: 0 };
        for await (const msg of nostr.req(
          [toNostrifyFilter(streamFilter)],
          { signal: ac.signal },
        )) {
          if (ac.signal.aborted) break;
          if (msg[0] === 'EVENT') {
            onEvent(toNostrToolsEvent(msg[2]));
          } else if (msg[0] === 'CLOSED') {
            break;
          }
        }
      } catch {
        // ignore — abort expected
      }
    })();

    return () => ac.abort();
  }

  // -------------------------------------------------------------------------
  // Auth-guarded capabilities
  // -------------------------------------------------------------------------

  function requireUser(): AdapterUser {
    const user = ref.current.user;
    if (!user) throw new Error('User is not logged in');
    return user;
  }

  async function getPublicKey(): Promise<string> {
    return requireUser().pubkey;
  }

  async function signEvent(
    event: NostrToolsUnsignedEvent,
  ): Promise<NostrToolsEvent> {
    const user = requireUser();
    const signed = await user.signer.signEvent(event);
    if (signed.pubkey !== user.pubkey) {
      throw new Error('Signed event pubkey does not match the logged-in user');
    }
    return signed as unknown as NostrToolsEvent;
  }

  async function publishEvent(
    event: NostrToolsUnsignedEvent,
  ): Promise<NostrToolsEvent> {
    if (publishEventHook) {
      return publishEventHook(event);
    }
    // Fallback: sign + publish directly. This path is only hit in tests or
    // when the caller opts out of Ditto's `useNostrPublish` pipeline.
    const signed = await signEvent(event);
    await nostr.event(signed as unknown as NostrifyEvent, {
      signal: AbortSignal.timeout(5000),
    });
    return signed;
  }

  async function nip44Encrypt(
    recipientPubkey: string,
    plaintext: string,
  ): Promise<string> {
    const user = requireUser();
    if (!user.signer.nip44) {
      throw new Error('Active signer does not support NIP-44');
    }
    return user.signer.nip44.encrypt(recipientPubkey, plaintext);
  }

  async function nip44Decrypt(
    senderPubkey: string,
    ciphertext: string,
  ): Promise<string> {
    const user = requireUser();
    if (!user.signer.nip44) {
      throw new Error('Active signer does not support NIP-44');
    }
    return user.signer.nip44.decrypt(senderPubkey, ciphertext);
  }

  // -------------------------------------------------------------------------
  // fetch — routes through the user's CORS proxy
  // -------------------------------------------------------------------------

  /**
   * Perform an outbound HTTP request on behalf of a tile. Every request is
   * forced through Ditto's configured CORS proxy so tiles can never directly
   * reach an origin that might ship Ditto's own cookies back, and so only
   * `https:` URLs are ever attempted.
   *
   * We also strip cookie-related and authorization headers from the tile's
   * request — those must never leak out of Ditto's own auth scope.
   */
  async function fetchForTile(request: FetchRequest): Promise<FetchResult> {
    const safeUrl = sanitizeUrl(request.url);
    if (!safeUrl) {
      return { ok: false, error: 'Only https:// URLs are permitted' };
    }

    let proxied: string;
    try {
      proxied = templateUrl({
        template: ref.current.corsProxy,
        url: safeUrl,
      });
    } catch {
      return { ok: false, error: 'CORS proxy template error' };
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers ?? {})) {
      const lower = key.toLowerCase();
      // Block any header that could forward Ditto's own identity or
      // cause the proxy to attach credentials.
      if (
        lower === 'cookie' ||
        lower === 'authorization' ||
        lower === 'x-csrf-token' ||
        lower.startsWith('sec-') ||
        lower.startsWith('proxy-')
      ) {
        continue;
      }
      headers.set(key, value);
    }

    try {
      const res = await fetch(proxied, {
        method: request.method ?? 'GET',
        headers,
        body: request.body,
        credentials: 'omit',
        mode: 'cors',
        redirect: 'follow',
      });

      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const body = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        headers: responseHeaders,
        body,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // -------------------------------------------------------------------------
  // Profiles — tile callbacks fire once with cached data, then on refresh
  // -------------------------------------------------------------------------

  function getProfile(
    pubkey: string,
    callback: (pubkey: string, profile: ProfileData) => void,
  ): () => void {
    let cancelled = false;

    // Fire immediately if we have a cached profile. The library contract
    // requires asynchronous delivery, so we queue a microtask rather than
    // calling the callback synchronously.
    const cached = ref.current.getCachedMetadata(pubkey);
    if (cached) {
      queueMicrotask(() => {
        if (!cancelled) callback(pubkey, metadataToProfile(pubkey, cached));
      });
    }

    // Subscribe to any further kind-0 updates. We use `subscribe` rather
    // than a one-shot query so the tile can reactively update when a
    // newer kind-0 arrives.
    const cleanup = subscribe(
      { kinds: [0], authors: [pubkey] },
      (event) => {
        try {
          const metadata = n.json().pipe(n.metadata()).parse(event.content);
          if (!cancelled) {
            callback(pubkey, metadataToProfile(pubkey, metadata));
          }
        } catch {
          // malformed kind 0 — ignore and keep listening
        }
      },
    );

    return () => {
      cancelled = true;
      cleanup();
    };
  }

  function resolveHandle(pubkey: string): string {
    const metadata = ref.current.getCachedMetadata(pubkey);
    return handleForPubkey(pubkey, metadata);
  }

  // -------------------------------------------------------------------------
  // navigate — tile navigation requests
  // -------------------------------------------------------------------------

  async function navigateFromTile(
    target: NavigateTarget,
  ): Promise<NavigateResult> {
    if ('identifier' in target && target.identifier) {
      const path = `/tiles/run/${encodeURIComponent(target.identifier)}`;
      navigate(path, { state: { tileProps: target.props ?? {} } });
      return { ok: true };
    }
    if ('pointer' in target && target.pointer) {
      try {
        // Validate that the pointer is a recognised NIP-19 identifier before
        // routing. Anything else is rejected so malformed tile input can't
        // cause arbitrary navigation.
        const decoded = nip19.decode(target.pointer);
        const recognised =
          decoded.type === 'npub' ||
          decoded.type === 'nprofile' ||
          decoded.type === 'note' ||
          decoded.type === 'nevent' ||
          decoded.type === 'naddr';
        if (!recognised) {
          return { ok: false, reason: 'rejected' };
        }
      } catch {
        return { ok: false, reason: 'rejected' };
      }
      navigate(`/${target.pointer}`);
      return { ok: true };
    }
    return { ok: false, reason: 'rejected' };
  }

  // -------------------------------------------------------------------------
  // Final adapter object
  // -------------------------------------------------------------------------

  return {
    subscribe,
    getPublicKey,
    signEvent,
    publishEvent,
    nip44Encrypt,
    nip44Decrypt,
    fetch: fetchForTile,
    getProfile,
    resolveHandle,
    navigate: navigateFromTile,
  };
}
