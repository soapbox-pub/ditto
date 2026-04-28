/**
 * React hook for reading and mutating the user's installed-tile list.
 *
 * The list of `naddr1` identifiers lives in `AppConfig.installedTiles`
 * (synced across devices via encrypted settings). Each tile's raw
 * kind-30207 event body is cached **locally** via `tileCache`, not in
 * the synced config, so we don't pump Lua source through encrypted
 * settings on every device.
 *
 * Install / uninstall here opens the canvas gate — the runtime must be
 * mounted before a tile can be registered with it.
 */

import { useCallback, useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useAppContext } from '@/hooks/useAppContext';
import { decodeTileNaddr, getDTag, tileEventToNaddr } from '@/lib/nostr-canvas/identifiers';
import { tileNavItemId } from '@/lib/sidebarItems';
import {
  getCachedTileEvent,
  listCachedTileEvents,
  putCachedTileEvent,
  removeCachedTileEvent,
} from '@/lib/nostr-canvas/tileCache';
import { useCanvasGate } from '@/lib/nostr-canvas/canvasGate';

export interface InstalledTileEntry {
  naddr: string;
  event: NostrEvent;
}

export interface UseInstalledTilesResult {
  /** Installed tile naddrs, in insertion order (oldest first). */
  installedNaddrs: string[];
  /** Every installed tile whose raw event is present in the local cache. */
  installedTiles: InstalledTileEntry[];
  /** Install a new tile from its kind-30207 event. */
  installTile: (event: NostrEvent, relayHint?: string) => string;
  /**
   * Uninstall a tile by its `naddr1`. Returns true when the tile was
   * actually removed (it was present in the list).
   */
  uninstallTile: (naddr: string) => boolean;
  /** Return the cached event for a given `naddr1`, or `undefined`. */
  getInstalledEvent: (naddr: string) => NostrEvent | undefined;
  /** Return true when an identical tile is already installed. */
  isInstalledByNaddr: (naddr: string) => boolean;
}

/**
 * Hook exposing the user's installed-tile list plus install/uninstall
 * mutators. The raw tile events are read from a local cache; entries
 * whose cached event is missing (e.g. after clearing storage) are
 * included in `installedNaddrs` but omitted from `installedTiles` so
 * callers can still show a "missing content — reinstall" placeholder.
 */
export function useInstalledTiles(): UseInstalledTilesResult {
  const { config, updateConfig } = useAppContext();
  const { requestGate } = useCanvasGate();

  const installedNaddrs = useMemo(
    () => config.installedTiles ?? [],
    [config.installedTiles],
  );

  // Resolve each naddr to its cached event. We rebuild this from
  // `listCachedTileEvents()` to avoid N separate localStorage reads.
  const installedTiles = useMemo<InstalledTileEntry[]>(() => {
    const cached = listCachedTileEvents();
    const byNaddr = new Map(cached.map((entry) => [entry.naddr, entry.event]));
    const result: InstalledTileEntry[] = [];
    for (const naddr of installedNaddrs) {
      const event = byNaddr.get(naddr);
      if (event) result.push({ naddr, event });
    }
    return result;
  }, [installedNaddrs]);

  const installTile = useCallback(
    (event: NostrEvent, relayHint?: string): string => {
      const naddr = tileEventToNaddr(event, relayHint);
      putCachedTileEvent(naddr, event);
      updateConfig((c) => {
        const current = c.installedTiles ?? [];
        if (current.includes(naddr)) return c;
        return { ...c, installedTiles: [...current, naddr] };
      });
      // Opening the gate on install guarantees the runtime is ready to
      // accept the registration on the next render.
      requestGate();
      return naddr;
    },
    [updateConfig, requestGate],
  );

  const uninstallTile = useCallback(
    (naddr: string): boolean => {
      let wasPresent = false;
      // Resolve the tile's identifier before we remove the cached event so
      // we can strip any matching synthetic tile-nav sidebar entry too.
      const cachedEvent = getCachedTileEvent(naddr);
      const identifier = cachedEvent ? getDTag(cachedEvent) : undefined;
      const navSidebarId = identifier ? tileNavItemId(identifier) : undefined;

      updateConfig((c) => {
        const current = c.installedTiles ?? [];
        if (!current.includes(naddr)) return c;
        wasPresent = true;
        const nextOrder = navSidebarId
          ? (c.sidebarOrder ?? []).filter((id) => id !== navSidebarId)
          : c.sidebarOrder;
        const nextWidgets = identifier
          ? (c.sidebarWidgets ?? []).filter(
              (w) => !(w.id === 'tile' && w.tileIdentifier === identifier),
            )
          : c.sidebarWidgets;
        return {
          ...c,
          installedTiles: current.filter((entry) => entry !== naddr),
          sidebarOrder: nextOrder ?? c.sidebarOrder,
          sidebarWidgets: nextWidgets ?? c.sidebarWidgets,
        };
      });
      removeCachedTileEvent(naddr);
      return wasPresent;
    },
    [updateConfig],
  );

  const getInstalledEvent = useCallback(
    (naddr: string): NostrEvent | undefined => getCachedTileEvent(naddr),
    [],
  );

  const isInstalledByNaddr = useCallback(
    (naddr: string): boolean => {
      // First try exact string match (fast path — covers the common case where
      // both the stored naddr and the query naddr were produced without relay
      // hints, or with identical hints).
      if (installedNaddrs.includes(naddr)) return true;
      // Slow path: decode both sides and compare (kind, pubkey, identifier).
      // This handles the case where the stored naddr was produced with a relay
      // hint but the queried naddr wasn't, or vice versa.
      const decoded = decodeTileNaddr(naddr);
      if (!decoded) return false;
      return installedNaddrs.some((n) => {
        const d = decodeTileNaddr(n);
        return (
          d !== null &&
          d.kind === decoded.kind &&
          d.pubkey === decoded.pubkey &&
          d.identifier === decoded.identifier
        );
      });
    },
    [installedNaddrs],
  );

  return {
    installedNaddrs,
    installedTiles,
    installTile,
    uninstallTile,
    getInstalledEvent,
    isInstalledByNaddr,
  };
}
