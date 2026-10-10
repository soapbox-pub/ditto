import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

import { imageMeta } from '@/lib/fileMetadata';
import { imetaTagFromUpload, imetaUrl, profileImetaTags } from '@/lib/profileImeta';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/** Largest image downloaded to describe it. Profile images are rarely near this. */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** How long a save waits on the downloads before publishing without them. */
const TIMEOUT_MS = 10_000;

/**
 * Download an image by URL and describe it as an `imeta` tag: `m`, `x`, `size`,
 * `dim`, and `blurhash`. Undefined when it can't be fetched (CORS, 404, too
 * big) or doesn't decode as an image — which is also what ciphertext whose key
 * was lost looks like, and that must not be described as a plain image.
 */
export async function describeImageUrl(url: string, signal?: AbortSignal): Promise<string[] | undefined> {
  if (!sanitizeUrl(url)) return undefined;
  try {
    const res = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok || Number(res.headers.get('content-length')) > MAX_IMAGE_BYTES) return undefined;
    const blob = await res.blob();
    if (blob.size > MAX_IMAGE_BYTES) return undefined;

    const { fields } = await imageMeta(blob);
    if (!fields.some(([name]) => name === 'dim')) return undefined;

    // Some servers send `application/octet-stream`; leave `m` out rather than repeat that.
    const mime = blob.type.split(';')[0].trim().toLowerCase();
    const x = bytesToHex(sha256(new Uint8Array(await blob.arrayBuffer())));
    return imetaTagFromUpload([
      ['url', url],
      ['m', mime.startsWith('image/') ? mime : ''],
      ['x', x],
      ['size', String(blob.size)],
      ...fields,
    ]);
  } catch {
    return undefined;
  }
}

/**
 * {@link profileImetaTags}, plus a tag computed by downloading any `picture` or
 * `banner` that none of `candidates` describes — so a profile set up before
 * imeta, or by a client that doesn't write it, gains it on its next save.
 *
 * Never throws, and never holds a save up for more than {@link TIMEOUT_MS}: an
 * image that can't be described in time is published without a tag, as before.
 */
export async function completeProfileImetaTags(
  metadata: { picture?: unknown; banner?: unknown },
  candidates: readonly string[][],
): Promise<string[][]> {
  const tags = profileImetaTags(metadata, candidates);
  const described = new Set(tags.map(imetaUrl));
  const missing = new Set<string>();
  for (const value of [metadata.picture, metadata.banner]) {
    if (typeof value === 'string' && value && !described.has(value)) missing.add(value);
  }
  if (!missing.size) return tags;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // Aborting stops the downloads; the race also cuts off a slow decode.
    const computed: (string[] | undefined)[] = await Promise.race([
      Promise.all([...missing].map((url) => describeImageUrl(url, controller.signal))),
      new Promise<undefined[]>((resolve) => controller.signal.addEventListener('abort', () => resolve([]))),
    ]);
    const found = computed.filter((tag): tag is string[] => !!tag);
    // Re-run the matcher so the tags come out in field order, one per image.
    return found.length ? profileImetaTags(metadata, [...tags, ...found]) : tags;
  } finally {
    clearTimeout(timer);
  }
}
