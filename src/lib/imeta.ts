import { parseFileEncryption, type FileEncryption } from '@/lib/encryptedFile';

/** Parsed imeta entry from NIP-94 tags. */
export interface ImetaEntry {
  url: string;
  thumbnail?: string;
  mime?: string;
  /** Alt text for accessibility. */
  alt?: string;
  /** Summary text (used as webxdc app name for webxdc attachments). */
  summary?: string;
  /** Webxdc session UUID — present when the attachment is a stateful webxdc app. */
  webxdc?: string;
  /** Pixel dimensions from NIP-94 `dim` tag, e.g. "1280x720". */
  dim?: string;
  /** Blurhash placeholder from NIP-94 `blurhash` tag. */
  blurhash?: string;
  /** File size in bytes, as a string, from the NIP-94 `size` tag. */
  size?: string;
  /** Duration in seconds, as a string — NIP-71 video and audio attachments. */
  duration?: string;
  /** Alternative sources for the same file, from repeated `fallback` fields. */
  fallbacks?: string[];
  /**
   * Present when the file is encrypted. `mime` is then the type of the
   * plaintext, and `url` addresses ciphertext that must be decrypted before it
   * can be rendered.
   */
  encryption?: FileEncryption;
}

/**
 * Parse every imeta tag into an ordered list.
 *
 * This is the one imeta parser — anything that reads `imeta` should come
 * through here rather than re-implementing the space-split loop, or it silently
 * drops fields it has never heard of. The encryption fields are exactly that
 * trap: an ad-hoc parser renders ciphertext instead of the file.
 */
export function parseImetaEntries(tags: string[][]): ImetaEntry[] {
  const entries: ImetaEntry[] = [];

  for (const tag of tags) {
    if (tag[0] !== 'imeta') continue;

    const fields: Record<string, string> = {};
    // `fallback` may appear more than once; every other field is single-valued.
    const fallbacks: string[] = [];

    for (let i = 1; i < tag.length; i++) {
      const part = tag[i];
      const spaceIdx = part.indexOf(' ');
      if (spaceIdx === -1) continue;
      const key = part.slice(0, spaceIdx);
      const value = part.slice(spaceIdx + 1);
      if (key === 'fallback') fallbacks.push(value);
      else fields[key] = value;
    }

    if (!fields.url) continue;

    entries.push({
      url: fields.url,
      thumbnail: fields.image ?? fields.thumb,
      mime: fields.m,
      alt: fields.alt,
      summary: fields.summary,
      webxdc: fields.webxdc,
      dim: fields.dim,
      blurhash: fields.blurhash,
      size: fields.size,
      duration: fields.duration,
      fallbacks: fallbacks.length ? fallbacks : undefined,
      encryption: parseFileEncryption({
        algorithm: fields['encryption-algorithm'],
        key: fields['decryption-key'],
        nonce: fields['decryption-nonce'],
        hash: fields.ox,
        mime: fields.m,
        fallbacks,
      }),
    });
  }

  return entries;
}

/**
 * Parse all imeta tags into a map keyed by URL. Works for any event kind.
 *
 * Duplicate URLs collapse — use {@link parseImetaEntries} where order or
 * repeats matter.
 */
export function parseImetaMap(tags: string[][]): Map<string, ImetaEntry> {
  const map = new Map<string, ImetaEntry>();
  for (const entry of parseImetaEntries(tags)) {
    map.set(entry.url, entry);
  }
  return map;
}

/** The first imeta entry, for kinds that carry exactly one attachment. */
export function parseFirstImeta(tags: string[][]): ImetaEntry | undefined {
  return parseImetaEntries(tags)[0];
}
