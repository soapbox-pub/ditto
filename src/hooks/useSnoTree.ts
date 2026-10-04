import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  applyPalette,
  indexFetched,
  isEncryptedSno,
  parsePaletteEvent,
  parseSno,
  SNO_KIND,
  SNO_MAX_DEPTH,
  snoEventKey,
  snoFetchFilters,
  snoPaletteRefKey,
  snoRefKey,
  SnoError,
  type SnoObject,
  type SnoPart,
} from '@/lib/sno';

/** An object with the objects it places, resolved. */
export interface SnoNode {
  object: SnoObject;
  parts: SnoPlacement[];
}

/** A placement; without a `node` it's drawn as a placeholder (§1.10). */
export interface SnoPlacement {
  part: SnoPart;
  node?: SnoNode;
}

/**
 * Most placed objects resolved for one tree. Placements multiply level by
 * level — a floor of 129 tiles, each placing a few more — and the depth
 * bound alone doesn't stop that; past this, placements become placeholders.
 */
const MAX_NODES = 4096;

interface PendingNode extends SnoNode {
  /** Keys of this object and every parent, to refuse cycles. */
  chain: Set<string>;
}

/**
 * Fetch what an object places, level by level, and any palette it names.
 * One request per level, however many objects are on it.
 */
export async function resolveSnoTree(
  query: (filters: ReturnType<typeof snoFetchFilters>) => Promise<NostrEvent[]>,
  event: NostrEvent,
  object: SnoObject,
): Promise<SnoNode> {
  const root: PendingNode = { object, parts: [], chain: new Set([snoEventKey(event), event.id]) };
  // Shared, so an object placed many times is one SnoObject and the renderer builds it once.
  const parsed = new Map<string, SnoObject | undefined>();
  const recolored = new Map<SnoObject, SnoObject>();
  let nodeCount = 1;
  let level: PendingNode[] = [root];

  for (let depth = 0; level.length; depth++) {
    const placesMore = depth < SNO_MAX_DEPTH;
    const refs = placesMore ? level.flatMap((node) => node.object.refs) : [];
    const paletteRefs = level.flatMap((node) => (node.object.paletteRef ? [node.object.paletteRef] : []));
    const filters = snoFetchFilters(refs, paletteRefs);
    const fetched = indexFetched(filters.length ? await query(filters).catch(() => []) : []);

    // A palette that can't be fetched or read leaves the built-in (§1.3b).
    for (const node of level) {
      const ref = node.object.paletteRef;
      const paletteEvent = ref && fetched.get(snoPaletteRefKey(ref));
      const palette = paletteEvent && parsePaletteEvent(paletteEvent);
      if (!palette) continue;
      let next = recolored.get(node.object);
      if (!next) {
        next = applyPalette(node.object, palette);
        recolored.set(node.object, next);
      }
      node.object = next;
    }

    const nextLevel: PendingNode[] = [];
    for (const node of level) {
      node.parts = node.object.parts.map((part): SnoPlacement => {
        if (!placesMore || nodeCount >= MAX_NODES) return { part };
        const placed = fetched.get(snoRefKey(node.object.refs[part.ref]));
        if (!placed || placed.kind !== SNO_KIND || isEncryptedSno(placed)) return { part };
        const key = snoEventKey(placed);
        if (node.chain.has(key) || node.chain.has(placed.id)) return { part };

        if (!parsed.has(placed.id)) {
          try {
            parsed.set(placed.id, parseSno(placed.content));
          } catch {
            parsed.set(placed.id, undefined);
          }
        }
        const child = parsed.get(placed.id);
        const unit = child ? child.unit + part.step : -1;
        if (!child || unit < 0 || unit > 84) return { part };

        nodeCount++;
        const childNode: PendingNode = { object: child, parts: [], chain: new Set([...node.chain, key, placed.id]) };
        nextLevel.push(childNode);
        return { part, node: childNode };
      });
    }
    level = nextLevel;
  }

  return root;
}

/**
 * A Simple Nostr Object event (kind 33331) parsed and validated, with the
 * objects it places and the palette it names fetched. `error` is set when the
 * payload fails validation, and such an object is never drawn (§4).
 */
export function useSnoTree(event: NostrEvent) {
  const { nostr } = useNostr();

  const parsed = useMemo((): { object?: SnoObject; error?: string } => {
    if (isEncryptedSno(event)) return {};
    try {
      return { object: parseSno(event.content) };
    } catch (error) {
      return { error: error instanceof SnoError ? error.message : 'unreadable' };
    }
  }, [event]);

  const { object } = parsed;
  const needsFetch = !!object && (object.refs.length > 0 || !!object.paletteRef);

  const tree = useQuery({
    queryKey: ['sno-tree', event.id],
    queryFn: ({ signal }) => resolveSnoTree(
      (filters) => nostr.query(filters, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) }),
      event,
      object!,
    ),
    enabled: needsFetch,
    staleTime: 5 * 60 * 1000,
  });

  const root = useMemo(
    (): SnoNode | undefined => (object && !needsFetch ? { object, parts: [] } : tree.data),
    [object, needsFetch, tree.data],
  );

  return {
    /** The object as published, before anything it names is fetched. */
    object,
    root,
    error: parsed.error,
    isLoading: needsFetch && tree.isLoading,
  };
}

/**
 * A rendered still of a resolved object, as a data: URL; `null` without
 * WebGL. Pulls in three.js on demand. Shared by every card showing the event.
 */
export function useSnoPreview(eventId: string, root: SnoNode | undefined, enabled = true) {
  return useQuery({
    queryKey: ['sno-preview', eventId],
    queryFn: async () => {
      const { renderSnoPreview } = await import('@/lib/snoRenderer');
      return (await renderSnoPreview(root!, 800, 600)) ?? null;
    },
    enabled: !!root && enabled,
    staleTime: Infinity,
  });
}
