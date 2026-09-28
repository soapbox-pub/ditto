/**
 * Display names and pictures for notification authors, cached in IndexedDB
 * across the worker's short lives.
 */

import { isLocalNetworkUrl, sanitizeUrl } from '@/lib/sanitizeUrl';

import { parseEvent } from './event';
import { idbRequest, openDb, txDone } from './idb';
import { requestEventFromAny } from './relays';

export interface Profile {
  name: string | null;
  picture: string | null;
}

interface ProfileRow extends Profile {
  pubkey: string;
  fetchedAt: number;
}

export const NO_PROFILE: Profile = { name: null, picture: null };

const PROFILE_DB = 'ditto-push-profiles';
const PROFILE_STORE = 'profiles';
/** How long a resolved profile is reused. */
const PROFILE_TTL_MS = 12 * 60 * 60 * 1000;
/** How long a failed lookup is remembered, so a burst doesn't retry per event. */
const PROFILE_MISS_TTL_MS = 30 * 60 * 1000;
/** Drop cached profiles nobody has needed in this long. */
const PROFILE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * How long to wait for a kind 0. Deliberately short: the host binds a
 * notification's picture the first time it draws the row and never goes back
 * for it, so a face that arrives late is a face nobody sees — better a prompt
 * notification reading "Someone" than a slow one with a name on it.
 */
const PROFILE_TIMEOUT_MS = 2500;
const MAX_NAME_LENGTH = 40;

async function readCachedProfile(pubkey: string): Promise<Profile | null> {
  try {
    const db = await openDb(PROFILE_DB, PROFILE_STORE);
    try {
      const tx = db.transaction(PROFILE_STORE, 'readonly');
      const row: ProfileRow | undefined = await idbRequest(tx.objectStore(PROFILE_STORE).get(pubkey));
      if (!row) return null;
      const ttl = row.name || row.picture ? PROFILE_TTL_MS : PROFILE_MISS_TTL_MS;
      if (Date.now() - row.fetchedAt > ttl) return null;
      return row;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

async function writeCachedProfile(pubkey: string, profile: Profile): Promise<void> {
  try {
    const db = await openDb(PROFILE_DB, PROFILE_STORE);
    try {
      const tx = db.transaction(PROFILE_STORE, 'readwrite');
      const store = tx.objectStore(PROFILE_STORE);
      const now = Date.now();
      store.put({ ...profile, pubkey, fetchedAt: now } satisfies ProfileRow, pubkey);

      // Opportunistic pruning — this store would otherwise grow with every
      // stranger who ever interacted with the user. One request, then
      // synchronous deletes, so the transaction never goes inactive waiting.
      const rows: ProfileRow[] = await idbRequest(store.getAll());
      for (const row of rows) {
        if (row?.pubkey && now - row.fetchedAt > PROFILE_MAX_AGE_MS) store.delete(row.pubkey);
      }

      await txDone(tx);
    } finally {
      db.close();
    }
  } catch {
    // A broken cache costs a lookup next time, nothing more.
  }
}

export function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\s+/g, ' ').trim();
  if (!name) return null;
  return name.length > MAX_NAME_LENGTH ? `${name.slice(0, MAX_NAME_LENGTH - 1)}…` : name;
}

/**
 * An author's kind 0, as `{ name, picture }` with nulls for whatever couldn't
 * be found. Never rejects — a nameless notification still beats no
 * notification.
 */
async function requestProfile(relays: string[], pubkey: string): Promise<Profile> {
  const event = await requestEventFromAny(
    relays,
    { kinds: [0], authors: [pubkey] },
    PROFILE_TIMEOUT_MS,
    (candidate) => {
      const event = parseEvent(candidate);
      return event?.kind === 0 && event.pubkey === pubkey ? event : null;
    },
  );
  if (!event) return NO_PROFILE;

  let metadata: Record<string, unknown>;
  try {
    metadata = JSON.parse(event.content);
  } catch {
    return NO_PROFILE;
  }
  if (!metadata || typeof metadata !== 'object') return NO_PROFILE;

  return {
    name: cleanName(metadata.display_name) ?? cleanName(metadata.name),
    picture: typeof metadata.picture === 'string' ? notificationImage(metadata.picture) : null,
  };
}

/**
 * An event-sourced image fit for a notification: https only (anything else
 * the host refuses), and never at a local-network address, which would let
 * whoever set it probe the viewer's LAN through the notification's fetch.
 */
export function notificationImage(raw: string | undefined): string | null {
  const url = sanitizeUrl(raw);
  return url && !isLocalNetworkUrl(url) ? url : null;
}

export async function resolveProfile(relays: string[], pubkey: string): Promise<Profile> {
  const cached = await readCachedProfile(pubkey);
  if (cached) return cached;
  const profile = await requestProfile(relays, pubkey);
  await writeCachedProfile(pubkey, profile);
  return profile;
}
