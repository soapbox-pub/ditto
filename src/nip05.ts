import { nip19, z } from '@/deps.ts';

const NIP05_REGEX = /^(?:([\w.+-]+)@)?([\w.-]+)$/;

interface LookupOpts {
  timeout?: number;
}

/** Adapted from nostr-tools. */
async function lookup(value: string, opts: LookupOpts = {}): Promise<nip19.ProfilePointer | undefined> {
  const { timeout = 1000 } = opts;

  const match = value.match(NIP05_REGEX);
  if (!match) return;

  const [_, name = '_', domain] = match;

  try {
    const res = await fetch(`https://${domain}/.well-known/nostr.json?name=${name}`, {
      signal: AbortSignal.timeout(timeout),
    });

    const { names, relays } = nostrJsonSchema.parse(await res.json());

    const pubkey = names[name];

    if (pubkey) {
      return {
        pubkey,
        relays: relays?.[pubkey],
      };
    }
  } catch (_e) {
    return;
  }
}

const nostrJsonSchema = z.object({
  names: z.record(z.string(), z.string()),
  relays: z.record(z.string(), z.array(z.string())).optional().catch(undefined),
});

async function verify(value: string, pubkey: string): Promise<boolean> {
  try {
    const result = await nip05.lookup(value);
    return result?.pubkey === pubkey;
  } catch (_e) {
    return false;
  }
}

const nip05 = {
  lookup,
  verify,
};

export { nip05 };
