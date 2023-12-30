import { Debug, TTLCache, z } from '@/deps.ts';
import { Time } from '@/utils/time.ts';
import { fetchWorker } from '@/workers/fetch.ts';

const debug = Debug('ditto:nip05');

const nip05Cache = new TTLCache<string, Promise<string | null>>({ ttl: Time.hours(1), max: 5000 });

const NIP05_REGEX = /^(?:([\w.+-]+)@)?([\w.-]+)$/;

interface LookupOpts {
  signal?: AbortSignal;
}

/** Get pubkey from NIP-05. */
async function lookup(value: string, opts: LookupOpts = {}): Promise<string | null> {
  const { signal = AbortSignal.timeout(2000) } = opts;

  const match = value.match(NIP05_REGEX);
  if (!match) return null;

  const [_, name = '_', domain] = match;

  try {
    const res = await fetchWorker(`https://${domain}/.well-known/nostr.json?name=${name}`, {
      signal,
    });

    const { names } = nostrJsonSchema.parse(await res.json());

    return names[name] || null;
  } catch (_e) {
    return null;
  }
}

/** nostr.json schema. */
const nostrJsonSchema = z.object({
  names: z.record(z.string(), z.string()),
  relays: z.record(z.string(), z.array(z.string())).optional().catch(undefined),
});

/**
 * Lookup the NIP-05 and serve from cache first.
 * To prevent race conditions we put the promise in the cache instead of the result.
 */
function lookupNip05Cached(value: string): Promise<string | null> {
  const cached = nip05Cache.get(value);
  if (cached !== undefined) return cached;

  debug(`Lookup ${value}`);
  const result = lookup(value);
  nip05Cache.set(value, result);

  return result;
}

/** Verify the NIP-05 matches the pubkey, with cache. */
async function verifyNip05Cached(value: string, pubkey: string): Promise<boolean> {
  const result = await lookupNip05Cached(value);
  return result === pubkey;
}

export { lookupNip05Cached, verifyNip05Cached };