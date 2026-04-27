/**
 * Hooks for reading tile registrations and matching events to tile renderers.
 *
 * `useTileRegistrations` returns the live list of `EventRegistration` objects
 * from the mounted `TileRuntime`. When the canvas gate is closed (runtime not
 * loaded), it returns an empty list — consumers can treat "no runtime" and
 * "no registrations" as the same condition and fall back to native rendering.
 *
 * `useTileNavItems` returns the live list of `NavItem` objects declared by
 * tiles via `register_nav_item()` — currently surfaced on the `/tiles` page.
 *
 * `findRendererForEvent` determines which installed tile (if any) should
 * render a given `NostrEvent` in the feed. When a tile is installed that
 * matches the event's kind (and any other filter constraints), **the
 * installed tile overrides Ditto's native renderer** per the design decision
 * locked in during planning. If multiple tiles match, the most-recently
 * installed one wins — it appears later in `installedTiles` and therefore
 * later in `getEventRegistrations()`.
 */

import { useCallback, useMemo } from 'react';
import { matchFilter } from 'nostr-tools';
import type { Filter } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import type {
  EventRegistration,
  NavItem,
} from '@soapbox.pub/nostr-canvas';

import { useCanvasGate } from '@/lib/nostr-canvas/canvasGate';
import { useSafeNostrCanvas } from '@/lib/nostr-canvas/useSafeNostrCanvas';

export interface TileRegistrationsResult {
  /** All active event registrations from installed tiles. */
  registrations: EventRegistration[];
  /** Registrations that opted in to feed rendering. */
  feedRegistrations: EventRegistration[];
  /**
   * Find the installed tile registration (if any) that should render the
   * given event. Returns `null` when no installed tile handles this kind —
   * callers should fall back to native rendering.
   */
  findRendererForEvent: (event: NostrEvent) => EventRegistration | null;
  /** All kinds any tile has opted into the feed. Useful when widening the feed query. */
  feedKinds: number[];
}

/**
 * Build the `kinds` list from every `include_in_feed` registration.
 * Duplicates are deduped.
 */
function collectFeedKinds(registrations: EventRegistration[]): number[] {
  const kinds = new Set<number>();
  for (const reg of registrations) {
    if (!reg.include_in_feed) continue;
    const filterKinds = (reg.filter as Filter).kinds;
    if (!filterKinds) continue;
    for (const kind of filterKinds) kinds.add(kind);
  }
  return [...kinds];
}

export function useTileRegistrations(): TileRegistrationsResult {
  const { gateOpen } = useCanvasGate();
  const canvas = useSafeNostrCanvas();

  const registrations = useMemo(
    () => (gateOpen ? canvas?.registrations ?? [] : []),
    [gateOpen, canvas?.registrations],
  );

  const feedRegistrations = useMemo(
    () => registrations.filter((r) => r.include_in_feed),
    [registrations],
  );

  const feedKinds = useMemo(
    () => collectFeedKinds(feedRegistrations),
    [feedRegistrations],
  );

  const findRendererForEvent = useCallback(
    (event: NostrEvent): EventRegistration | null => {
      // Walk in reverse — the runtime lists registrations in insertion
      // order, so the last match is the most-recently installed tile.
      for (let i = feedRegistrations.length - 1; i >= 0; i--) {
        const reg = feedRegistrations[i];
        try {
          if (matchFilter(reg.filter as Filter, event as never)) {
            return reg;
          }
        } catch {
          // Malformed filter — skip.
        }
      }
      return null;
    },
    [feedRegistrations],
  );

  return {
    registrations,
    feedRegistrations,
    feedKinds,
    findRendererForEvent,
  };
}

export function useTileNavItems(): NavItem[] {
  const { gateOpen } = useCanvasGate();
  const canvas = useSafeNostrCanvas();
  if (!gateOpen) return [];
  return canvas?.navItems ?? [];
}
