/**
 * Mounts the nostr-canvas `TileRuntime` into Ditto's React tree.
 *
 * This component does three things:
 *
 *  1. Builds the `NostrAdapter` that bridges the tile runtime to Ditto's
 *     existing Nostrify pool, signer, profile cache, CORS proxy, and
 *     router.
 *  2. Wires `onPermissionRequest` up to a UI dialog so the user can
 *     approve or deny each capability request, with decisions persisted
 *     via the permission cache (scoped per-user pubkey).
 *  3. Registers every tile in `AppConfig.installedTiles` with the
 *     runtime at mount time (using the raw event JSON cached locally),
 *     and uninstalls any tile that disappears from that list.
 *
 * The component is default-exported so `React.lazy()` can pick it up and
 * defer the ~500 KB `wasmoon` WASM blob until any part of Ditto actually
 * needs to run a tile. See `CanvasGate`.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNostr } from '@nostrify/react';
import { useNavigate } from 'react-router-dom';
import {
  NostrCanvasProvider as LibProvider,
  useNostrCanvas,
} from '@soapbox.pub/nostr-canvas/react';
import {
  parseTileDefEvent,
  type Capability,
  type ModalRequest,
  type PermissionDecision,
} from '@soapbox.pub/nostr-canvas';
import type { NostrAdapter } from '@soapbox.pub/nostr-canvas';
import type { NostrEvent as NostrifyEvent } from '@nostrify/nostrify';
import type { NostrEvent as NostrToolsEvent } from 'nostr-tools';

import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { getProfileCached } from '@/lib/profileCache';
import {
  createDittoAdapter,
  type AdapterContextRef,
} from '@/lib/nostr-canvas/adapter';
import { createScopedPermissionCache } from '@/lib/nostr-canvas/capabilityCache';
import { getCachedTileEvent } from '@/lib/nostr-canvas/tileCache';
import { setTileNavItemRegistry } from '@/lib/sidebarItems';
import { CanvasMount } from '@/lib/nostr-canvas/useSafeNostrCanvas';
import { TilePermissionDialog } from '@/components/nostr-canvas/TilePermissionDialog';
import { TileModalSlot } from '@/components/nostr-canvas/TileModalSlot';

/**
 * A single outstanding capability request. The promise resolver is stored
 * here so the dialog can resolve it when the user clicks Allow/Deny.
 */
interface PermissionPromptState {
  identifier: string;
  capability: Capability;
  resolve: (decision: PermissionDecision) => void;
}

interface NostrCanvasRuntimeProviderProps {
  children: ReactNode;
}

/**
 * Host-side wrapper around the library's `NostrCanvasProvider`. This is the
 * component consumers import via `React.lazy`.
 */
function NostrCanvasRuntimeProvider({
  children,
}: NostrCanvasRuntimeProviderProps) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const navigate = useNavigate();
  const publish = useNostrPublish();

  // -------------------------------------------------------------------------
  // Adapter — built once, updated via a stable ref so auth changes don't
  // rebuild the runtime.
  // -------------------------------------------------------------------------

  // `publish` is a `useMutation` result; its `mutateAsync` is stable. We use
  // a ref so the adapter sees the latest signer automatically.
  const publishMutateRef = useRef(publish.mutateAsync);
  useEffect(() => {
    publishMutateRef.current = publish.mutateAsync;
  });

  const adapterRef = useRef<{ current: AdapterContextRef }>({
    current: {
      user: user
        ? { pubkey: user.pubkey, signer: user.signer }
        : null,
      corsProxy: config.corsProxy,
      getCachedMetadata: (pubkey) => getProfileCached(pubkey)?.metadata,
    },
  });

  // Keep the ref synced with the latest auth + config state on every render.
  adapterRef.current.current = {
    user: user ? { pubkey: user.pubkey, signer: user.signer } : null,
    corsProxy: config.corsProxy,
    getCachedMetadata: (pubkey) => getProfileCached(pubkey)?.metadata,
  };

  const adapter = useMemo<NostrAdapter>(
    () =>
      createDittoAdapter({
        nostr,
        ref: adapterRef.current,
        navigate,
        publishEvent: async (unsigned) => {
          // Route through `useNostrPublish` so the NIP-89 `client` tag,
          // `published_at` logic, and inbox-relay delivery all happen
          // exactly the way they do for every other publish in Ditto.
          const signed = await publishMutateRef.current({
            kind: unsigned.kind,
            content: unsigned.content ?? '',
            tags: unsigned.tags ?? [],
            created_at:
              unsigned.created_at ?? Math.floor(Date.now() / 1000),
          });
          return signed as unknown as NostrToolsEvent;
        },
      }),
    // The adapter MUST be stable — the library's `NostrCanvasProvider`
    // captures it on mount and ignores later changes. The ref pattern
    // above takes care of runtime updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // -------------------------------------------------------------------------
  // Permission handling
  // -------------------------------------------------------------------------

  // Permission cache scoped per-user. Switching accounts re-initialises.
  const permissionCacheRef = useRef(
    createScopedPermissionCache(user?.pubkey ?? null),
  );
  const lastPubkeyRef = useRef(user?.pubkey ?? null);
  if ((user?.pubkey ?? null) !== lastPubkeyRef.current) {
    lastPubkeyRef.current = user?.pubkey ?? null;
    permissionCacheRef.current = createScopedPermissionCache(
      user?.pubkey ?? null,
    );
  }

  const [promptState, setPromptState] =
    useState<PermissionPromptState | null>(null);

  const promptUser = useCallback(
    (identifier: string, capability: Capability): Promise<PermissionDecision> => {
      return new Promise<PermissionDecision>((resolve) => {
        setPromptState({ identifier, capability, resolve });
      });
    },
    [],
  );

  // The library captures `onPermissionRequest` at construction time and never
  // re-reads it, so this must be a stable closure that always reads the
  // *current* permission cache from the ref. Using .wrap() here would bake in
  // the cache object that existed when the memo ran, breaking permission checks
  // after account switches (the cache changes but the closure doesn't).
  const onPermissionRequest = useCallback(
    async (identifier: string, capability: Capability): Promise<PermissionDecision> => {
      const cache = permissionCacheRef.current;
      // Short-circuit if a decision is already stored (covers both the
      // "previously granted" and "previously denied" cases, and correctly
      // re-prompts if the decision has been revoked via TileSettingsPage).
      const cached = cache.get(identifier, capability);
      if (cached !== undefined) return cached;
      const decision = await promptUser(identifier, capability);
      // Persist so the user isn't asked again for the same tile + capability.
      cache.set(identifier, capability, decision);
      return decision;
    },
    [promptUser],
  );

  const respondToPrompt = useCallback(
    (decision: PermissionDecision) => {
      if (!promptState) return;
      promptState.resolve(decision);
      // Persist the decision under the active scope so next time the tile
      // asks for the same capability we skip the dialog.
      permissionCacheRef.current.set(
        promptState.identifier,
        promptState.capability,
        decision,
      );
      setPromptState(null);
    },
    [promptState],
  );

  return (
    <LibProvider adapter={adapter} options={{ onPermissionRequest }}>
      <CanvasMount />
      <InstalledTilesBinder />
      <TileNavItemBinder />
      <AuthBroadcaster />
      {children}
      <TileModalSlot />
      <ToastBridge />
      {promptState && (
        <TilePermissionDialog
          identifier={promptState.identifier}
          capability={promptState.capability}
          onAllow={() => respondToPrompt('granted')}
          onDeny={() => respondToPrompt('denied')}
        />
      )}
    </LibProvider>
  );
}

export default NostrCanvasRuntimeProvider;

// ---------------------------------------------------------------------------
// InstalledTilesBinder — registers/uninstalls tiles with the runtime to
// mirror `AppConfig.installedTiles`.
// ---------------------------------------------------------------------------

/**
 * Keeps the runtime's registered tile set in sync with
 * `AppConfig.installedTiles`. Registers tiles present in the list, and
 * uninstalls tiles the runtime still knows about that have been removed.
 *
 * Separating this into its own component inside the provider lets it
 * call `useNostrCanvas()` without having to thread the runtime handle
 * through the top-level component.
 */
function InstalledTilesBinder(): null {
  const { runtime } = useNostrCanvas();
  const { config } = useAppContext();
  const installed = useMemo(
    () => config.installedTiles ?? [],
    [config.installedTiles],
  );

  useEffect(() => {
    // 1. Register every cached tile event — duplicates are no-ops inside
    //    the runtime (it keys by identifier).
    const nowInstalled = new Set<string>();
    for (const naddr of installed) {
      const event = getCachedTileEvent(naddr);
      if (!event) continue;
      const parsed = parseTileDefEvent({
        id: event.id,
        pubkey: event.pubkey,
        created_at: event.created_at,
        kind: event.kind,
        content: event.content,
        tags: event.tags,
      });
      if (!parsed) continue;
      try {
        runtime.registerFromEvent(parsed);
        nowInstalled.add(parsed.identifier);
      } catch (err) {
        console.error('[NostrCanvas] Failed to register tile', parsed.identifier, err);
      }
    }

    // 2. Uninstall any tiles the runtime still has but that aren't in our
    //    current list (e.g. the user uninstalled on another device and we
    //    just synced the shorter list back).
    for (const identifier of runtime.getInstalledIdentifiers()) {
      if (!nowInstalled.has(identifier)) {
        try {
          runtime.uninstallTile(identifier);
        } catch {
          // Swallow — idempotent.
        }
      }
    }
  }, [installed, runtime]);

  return null;
}

// ---------------------------------------------------------------------------
// TileNavItemBinder — push runtime nav items into the sidebar registry
// ---------------------------------------------------------------------------

/**
 * Mirrors the live `useNostrCanvas().navItems` list into the module-level
 * tile-nav-item registry consumed by `sidebarItems.tsx`. The sidebar's
 * `itemLabel`/`itemPath`/`sidebarItemIcon` helpers read from that
 * registry synchronously so synthetic `tile-nav:<identifier>` ids resolve
 * without threading a React context through every caller.
 *
 * Additionally, this component appends every new tile nav item to
 * `AppConfig.sidebarOrder` the first time it appears — so installing a
 * tile with a nav item puts it directly in the user's sidebar, the same
 * way a newly-registered widget ends up in the widget sidebar. The user
 * can reorder or hide it afterwards like any other sidebar entry.
 */
function TileNavItemBinder(): null {
  const { navItems } = useNostrCanvas();
  const { config, updateConfig } = useAppContext();

  // Re-publish the registry whenever nav items change so sidebar
  // consumers subscribed via useSyncExternalStore re-render.
  useEffect(() => {
    setTileNavItemRegistry(
      navItems.map((n) => ({ identifier: n.identifier, label: n.label })),
    );
  }, [navItems]);

  // Auto-add new tile nav items to the sidebar order. We only append ids
  // the user hasn't seen before — if they explicitly removed one, we
  // don't re-add it on their next render.
  const addedOnceRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const order = config.sidebarOrder ?? [];
    const toAppend: string[] = [];
    for (const n of navItems) {
      const id = `tile-nav:${n.identifier}`;
      if (addedOnceRef.current.has(id)) continue;
      if (order.includes(id)) {
        addedOnceRef.current.add(id);
        continue;
      }
      addedOnceRef.current.add(id);
      toAppend.push(id);
    }
    if (toAppend.length === 0) return;
    updateConfig((c) => ({
      ...c,
      sidebarOrder: [...(c.sidebarOrder ?? []), ...toAppend],
    }));
  }, [navItems, config.sidebarOrder, updateConfig]);

  // Cleanup: drop the registry on unmount so stale nav items don't
  // linger after the runtime tears down.
  useEffect(() => {
    return () => setTileNavItemRegistry([]);
  }, []);

  return null;
}

// ---------------------------------------------------------------------------
// AuthBroadcaster — pushes login/logout + scope changes into the runtime
// ---------------------------------------------------------------------------

/**
 * Forwards Ditto's auth state into the tile runtime. Live tiles receive
 * `auth:login`/`auth:logout` events on the public bus, and per-tile KV
 * stores are scoped per-pubkey so tiles can't read another user's data.
 */
function AuthBroadcaster(): null {
  const { runtime } = useNostrCanvas();
  const { user } = useCurrentUser();
  const previousPubkeyRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = previousPubkeyRef.current;
    const next = user?.pubkey ?? null;
    if (prev === next) return;

    if (prev && !next) {
      runtime.notifyLogout();
    } else if (next && next !== prev) {
      runtime.notifyLogin(next);
    }
    runtime.setScope(next);
    previousPubkeyRef.current = next;
  }, [runtime, user?.pubkey]);

  return null;
}

// ---------------------------------------------------------------------------
// ToastBridge — forwards `ctx.show_toast` calls to Ditto's toast system
// ---------------------------------------------------------------------------

/**
 * The library delivers tile toasts via `useNostrCanvas().toasts` and
 * expects the host to dismiss each one when it's handled. We forward
 * them to Ditto's existing `useToast` and then mark them dismissed.
 */
function ToastBridge(): null {
  const { toasts, dismissToast } = useNostrCanvas();
  const { toast } = useToast();
  const handledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const t of toasts) {
      if (handledRef.current.has(t.id)) continue;
      handledRef.current.add(t.id);
      toast({
        description: t.message,
        // Library variants: "default" | "success" | "warning" | "danger"
        // Ditto Toast variants: "default" | "destructive"
        variant: t.variant === 'danger' ? 'destructive' : 'default',
      });
      // The library's own dismissal timer fires after `t.duration`. We
      // mark the handled Set up-front so a re-render doesn't re-toast.
      // Host-side cleanup isn't strictly required but keeps the context
      // clean for any debug UI that inspects it.
      setTimeout(() => dismissToast(t.id), 0);
    }
  }, [toasts, toast, dismissToast]);

  return null;
}

// Suppress TS `unused import` error when the types are only referenced inside
// comments: this keeps the reference alive and documents the contract.
type _ReferencedTypes = NostrifyEvent | ModalRequest;
