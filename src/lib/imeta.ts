import { parseFileEncryption, type FileEncryption } from '@/lib/encryptedFile';

/** Parsed imeta entry from NIP-94 tags. */
export interface ImetaEntry {
  url: string;
  thumbnail?: string;
  mime?: string;
  /** Summary text (used as webxdc app name for webxdc attachments). */
  summary?: string;
  /** Webxdc session UUID — present when the attachment is a stateful webxdc app. */
  webxdc?: string;
  /** Pixel dimensions from NIP-94 `dim` tag, e.g. "1280x720". */
  dim?: string;
  /** Blurhash placeholder from NIP-94 `blurhash` tag. */
  blurhash?: string;
  /**
   * Present when the file is encrypted. `mime` is then the type of the
   * plaintext, and `url` addresses ciphertext that must be decrypted before it
   * can be rendered.
   */
  encryption?: FileEncryption;
}

/** Parse all imeta tags into a map keyed by URL. Works for any event kind. */
export function parseImetaMap(tags: string[][]): Map<string, ImetaEntry> {
  const map = new Map<string, ImetaEntry>();
  for (const tag of tags) {
    if (tag[0] !== 'imeta') continue;
    const entry: Record<string, string> = {};
    // `fallback` may appear more than once; every other field is single-valued.
    const fallbacks: string[] = [];
    for (let i = 1; i < tag.length; i++) {
      const part = tag[i];
      const spaceIdx = part.indexOf(' ');
      if (spaceIdx === -1) continue;
      const key = part.slice(0, spaceIdx);
      const value = part.slice(spaceIdx + 1);
      if (key === 'fallback') fallbacks.push(value);
      else entry[key] = value;
    }
    if (entry.url) {
      map.set(entry.url, {
        url: entry.url,
        thumbnail: entry.image,
        mime: entry.m,
        summary: entry.summary,
        webxdc: entry.webxdc,
        dim: entry.dim,
        blurhash: entry.blurhash,
        encryption: parseFileEncryption({
          algorithm: entry['encryption-algorithm'],
          key: entry['decryption-key'],
          nonce: entry['decryption-nonce'],
          hash: entry.ox,
          mime: entry.m,
          fallbacks,
        }),
      });
    }
  }
  return map;
}
