/**
 * Resolve furniture placements to Simple Nostr Object trees for the 3D room.
 *
 * Official furniture comes from the bundled SNO models; `sno:` placements are
 * fetched from relays (filtered by author, since they're addressable) along
 * with anything they place. Each object is fetched once and cached.
 */

import { useCallback, useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQueries, type Query } from '@tanstack/react-query';

import { resolveSnoTree, type SnoNode } from '@/hooks/useSnoTree';
import { isEncryptedSno, parseSno, SNO_KIND, type SnoObject } from '@/lib/sno';

import { isOfficialFurnitureId } from '../lib/furniture-registry';
import type { FurniturePlacement } from '../lib/room-furniture-schema';
import { getOfficialModel, missingObjectModel, type ModelExtras } from '../lib/room-scene/official-models';
import { parseSnoFurnitureId, type SnoAddress } from '../lib/sno-furniture';

export interface FurnitureModel {
  node: SnoNode;
  extras?: ModelExtras;
  /** Object name, from the SNO payload; empty when it has none (the UI shows a translated fallback). */
  name: string;
  /** A stand-in for an object that couldn't be loaded. */
  missing?: boolean;
}

/**
 * Objects bigger than these aren't built: doing it on the main thread could
 * freeze the room. Faces count separately, since a few vertices can make
 * any number of them; a part placed many times counts each time it's drawn.
 */
const MAX_VERTICES = 60_000;
const MAX_FACES = 100_000;

function isTooBig(root: SnoNode): boolean {
  let vertices = 0;
  let faces = 0;
  const visit = (node: SnoNode) => {
    vertices += node.object.positions.length / 3;
    faces += node.object.faces.length;
    for (const p of node.parts) if (p.node) visit(p.node);
  };
  visit(root);
  return vertices > MAX_VERTICES || faces > MAX_FACES;
}

/** How long a fetched object is kept; one that wasn't found is looked for again sooner. */
const FOUND_STALE_MS = 10 * 60 * 1000;
const NOT_FOUND_STALE_MS = 30 * 1000;

let missingModel: FurnitureModel | undefined;

function getMissingModel(): FurnitureModel {
  if (!missingModel) {
    const object = parseSno(JSON.stringify(missingObjectModel().payload));
    missingModel = { node: { object, parts: [] }, name: object.name, missing: true };
  }
  return missingModel;
}

const officialNodes = new Map<string, FurnitureModel | null>();

/** Official model as a parsed SNO tree, or null if the ID has no model. */
export function getOfficialFurnitureModel(id: string): FurnitureModel | null {
  const cached = officialNodes.get(id);
  if (cached !== undefined) return cached;
  const model = getOfficialModel(id);
  let result: FurnitureModel | null = null;
  if (model) {
    const object = parseSno(JSON.stringify(model.payload));
    result = { node: { object, parts: [] }, extras: model.extras, name: object.name };
  }
  officialNodes.set(id, result);
  return result;
}

/**
 * Fetch and resolve one published SNO by address: null if it isn't there or
 * can't be used. Network failures throw, so they're retried rather than kept.
 */
async function fetchSnoFurniture(
  nostr: ReturnType<typeof useNostr>['nostr'],
  address: SnoAddress,
  signal: AbortSignal,
): Promise<FurnitureModel | null> {
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
  const events = await nostr.query(
    [{ kinds: [SNO_KIND], authors: [address.pubkey], '#d': [address.identifier], limit: 1 }],
    { signal: timeout },
  );
  const event = events
    .filter((e) => e.pubkey === address.pubkey && e.kind === SNO_KIND)
    .sort((a, b) => b.created_at - a.created_at)[0];
  if (!event || isEncryptedSno(event)) return null;
  let object: SnoObject;
  try {
    object = parseSno(event.content);
  } catch {
    return null;
  }
  const node = await resolveSnoTree((filters) => nostr.query(filters, { signal: timeout }), event, object);
  if (isTooBig(node)) return null;
  return { node, name: object.name.trim() };
}

/**
 * Models for each placement, by array index. Missing entries are still
 * loading; objects that couldn't be loaded get a stand-in (`missing`).
 */
export function useFurnitureModels(placements: FurniturePlacement[] | undefined): Map<number, FurnitureModel> {
  const { nostr } = useNostr();

  const addresses = useMemo(() => {
    const unique = new Map<string, SnoAddress>();
    for (const p of placements ?? []) {
      const address = parseSnoFurnitureId(p.id);
      if (address) unique.set(p.id, address);
    }
    return [...unique.entries()];
  }, [placements]);

  const combine = useCallback((results: { data?: FurnitureModel | null; isError: boolean }[]) => {
    const byId = new Map<string, FurnitureModel>();
    addresses.forEach(([id], i) => {
      const result = results[i];
      // null: fetched, but not there or not usable; an error: couldn't fetch it, for now
      if (result?.data) byId.set(id, result.data);
      else if (result?.data === null || result?.isError) byId.set(id, getMissingModel());
    });
    return byId;
  }, [addresses]);

  const byId = useQueries({
    queries: addresses.map(([id, address]) => ({
      queryKey: ['blobbi-sno-furniture', id],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchSnoFurniture(nostr, address, signal),
      staleTime: (query: Query<FurnitureModel | null>) => (query.state.data === null ? NOT_FOUND_STALE_MS : FOUND_STALE_MS),
    })),
    combine,
  });

  return useMemo(() => {
    const models = new Map<number, FurnitureModel>();
    (placements ?? []).forEach((p, i) => {
      const model = isOfficialFurnitureId(p.id) ? getOfficialFurnitureModel(p.id) : byId.get(p.id);
      if (model) models.set(i, model);
    });
    return models;
  }, [placements, byId]);
}
