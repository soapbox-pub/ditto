import { parseImetaEntries, type ImetaEntry } from '@/lib/imeta';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/**
 * NIP-94 `imeta` tags on a kind 0, describing the profile's `picture` and
 * `banner`. A profile picture gets the same treatment as any other attached
 * image: declared `fallback` hosts, a `blurhash` placeholder, `dim`, `alt`,
 * and — proposed for NIP-94 in nostr-protocol/nips#2437 — encryption, so the
 * blob on the media server is ciphertext and the key travels in the event.
 *
 * An entry describes a field only when its `url` is that field's value
 * exactly. Stale entries, left over from a picture the profile no longer uses,
 * are ignored rather than applied to the new one.
 */
export interface ProfileImeta {
  picture?: ImetaEntry;
  banner?: ImetaEntry;
}

/** The kind 0 fields an imeta tag can describe. */
export type ProfileImageField = keyof ProfileImeta;

const FIELDS: readonly ProfileImageField[] = ['picture', 'banner'];

/** Match the profile's `picture` and `banner` to the imeta tags describing them. */
export function parseProfileImeta(
  tags: string[][],
  metadata: { picture?: unknown; banner?: unknown } | undefined,
): ProfileImeta | undefined {
  if (!metadata || !tags.some(([name]) => name === 'imeta')) return undefined;

  const entries = parseImetaEntries(tags);
  const result: ProfileImeta = {};
  for (const field of FIELDS) {
    const value = metadata[field];
    if (typeof value !== 'string' || !value) continue;
    const entry = entries.find((e) => e.url === value);
    if (entry) result[field] = entry;
  }
  return result.picture || result.banner ? result : undefined;
}

/**
 * The entry for `src` if `imeta` describes it, else undefined.
 *
 * Call sites often hand over `sanitizeUrl(metadata.picture)`, whose normalised
 * `href` can differ from the raw string the entry was matched on, so either
 * spelling counts. Anything else — a profile being edited whose picture no
 * longer matches the stored event — gets no imeta at all: applying one file's
 * key, hash, or fallbacks to another would only break it.
 */
export function imetaFor(src: string | undefined, imeta: ImetaEntry | undefined): ImetaEntry | undefined {
  if (!src || !imeta) return undefined;
  if (imeta.url === src || sanitizeUrl(imeta.url) === src) return imeta;
  return undefined;
}

/** Turn the NIP-94 tags `useUploadFile` returns (plus any probed fields) into an `imeta` tag. */
export function imetaTagFromUpload(tags: string[][]): string[] {
  return ['imeta', ...tags.filter(([name, value]) => name && value).map(([name, value]) => `${name} ${value}`)];
}

/** The `url` an imeta tag describes, without parsing the rest of it. */
export function imetaUrl(tag: string[]): string | undefined {
  if (tag[0] !== 'imeta') return undefined;
  for (let i = 1; i < tag.length; i++) {
    if (tag[i].startsWith('url ')) return tag[i].slice(4);
  }
  return undefined;
}

/**
 * The imeta tags to publish on a new kind 0: one for the `picture` and one for
 * the `banner`, each the first tag in `candidates` whose `url` matches.
 *
 * Pass this session's uploads first and the previous kind 0's tags after, so a
 * freshly uploaded image is described by its own upload while an unchanged one
 * keeps the tag it already had. A field set by hand to some other URL gets
 * nothing, and tags for images no longer in use are dropped.
 */
export function profileImetaTags(
  metadata: { picture?: unknown; banner?: unknown },
  candidates: readonly string[][],
): string[][] {
  const out: string[][] = [];
  const used = new Set<string>();
  for (const field of FIELDS) {
    const value = metadata[field];
    if (typeof value !== 'string' || !value || used.has(value)) continue;
    const tag = candidates.find((t) => imetaUrl(t) === value);
    if (tag) {
      out.push([...tag]);
      used.add(value);
    }
  }
  return out;
}
