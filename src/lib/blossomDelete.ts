import type { NostrEvent, NostrSigner } from '@nostrify/nostrify';
import { N64 } from '@nostrify/nostrify/utils';

import { parseImetaEntries } from '@/lib/imeta';

/** A blob's sha256: the last path segment of a Blossom URL, extension optional. */
const BLOB_HASH = /(?:^|\/)([0-9a-f]{64})(?:\.[a-z0-9]+)?$/i;

/** How long the delete authorization stays valid. */
const AUTH_TTL_SECONDS = 5 * 60;
const REQUEST_TIMEOUT_MS = 20_000;

/** The sha256 a Blossom URL (or BUD-10 `blossom:` URI) names, if it names one. */
export function blobHashFromUrl(url: string): string | undefined {
  if (url.toLowerCase().startsWith('blossom:')) {
    return BLOB_HASH.exec(url.slice('blossom:'.length).split('?')[0])?.[1]?.toLowerCase();
  }
  try {
    const { protocol, pathname } = new URL(url);
    if (protocol !== 'https:') return undefined;
    return BLOB_HASH.exec(pathname)?.[1]?.toLowerCase();
  } catch {
    return undefined;
  }
}

function originOf(url: string): string | undefined {
  try {
    const { protocol, origin } = new URL(url);
    return protocol === 'https:' ? origin : undefined;
  } catch {
    return undefined;
  }
}

export interface PostBlobs {
  /** Blob hashes the post attaches. */
  hashes: string[];
  /** Origins those blobs were linked from, which may not be among the user's servers. */
  origins: string[];
}

/**
 * The Blossom blobs a post attaches: every `imeta` file, its preview image,
 * and its fallbacks, plus links in the content that point at a blob on one of
 * `ownServers`. Links to other hosts in the text are someone else's media far
 * more often than an attachment, so they're left alone.
 */
export function blobsInEvent(event: NostrEvent, ownServers: string[]): PostBlobs {
  const hashes = new Set<string>();
  const origins = new Set<string>();
  const add = (url: string | undefined) => {
    if (!url) return;
    const hash = blobHashFromUrl(url);
    if (!hash) return;
    hashes.add(hash);
    const origin = originOf(url);
    if (origin) origins.add(origin);
  };

  for (const entry of parseImetaEntries(event.tags)) {
    add(entry.url);
    add(entry.thumbnail);
    entry.fallbacks?.forEach(add);
  }

  const own = new Set(ownServers.map(originOf).filter((o): o is string => !!o));
  for (const [url] of event.content.matchAll(/https:\/\/[^\s<>"')\]]+/g)) {
    const origin = originOf(url);
    if (origin && own.has(origin)) add(url);
  }

  return { hashes: [...hashes], origins: [...origins] };
}

export interface BlobDeleteResult {
  /** Blobs removed from at least one server. */
  deleted: number;
  /** Blobs no server would delete (not stored there, not ours, or the server refused). */
  failed: number;
}

/**
 * Delete blobs from Blossom servers (BUD-12 `DELETE /<sha256>`).
 *
 * Signs one BUD-11 authorization for the whole batch, scoped with `x` tags to
 * exactly these blobs and with `server` tags to exactly these servers, so a
 * leaked token can't delete anything else anywhere else. Servers only drop the
 * signer's ownership; a blob someone else also uploaded stays up for them.
 */
export async function deleteBlobs(
  hashes: string[],
  servers: string[],
  signer: NostrSigner,
): Promise<BlobDeleteResult> {
  const targets = [...new Set(servers.map(originOf).filter((o): o is string => !!o))];
  if (hashes.length === 0 || targets.length === 0) return { deleted: 0, failed: hashes.length };

  const now = Math.floor(Date.now() / 1000);
  const auth = await signer.signEvent({
    kind: 24242,
    content: hashes.length === 1 ? 'Delete blob' : `Delete ${hashes.length} blobs`,
    created_at: now,
    tags: [
      ['t', 'delete'],
      ['expiration', String(now + AUTH_TTL_SECONDS)],
      ...hashes.map((hash) => ['x', hash]),
      ...targets.map((origin) => ['server', new URL(origin).hostname]),
    ],
  });
  const authorization = `Nostr ${N64.encodeEventUrl(auth)}`;

  const results = await Promise.all(hashes.map(async (hash) => {
    const attempts = await Promise.allSettled(targets.map(async (origin) => {
      const response = await fetch(new URL(`/${hash}`, origin), {
        method: 'DELETE',
        headers: { authorization },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`${response.status}`);
    }));
    return attempts.some((a) => a.status === 'fulfilled');
  }));

  const deleted = results.filter(Boolean).length;
  return { deleted, failed: hashes.length - deleted };
}
