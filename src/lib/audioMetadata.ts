import type { Input, MetadataTags, Source } from 'mediabunny';

/**
 * What a music file says about itself, read out of the file's own container
 * metadata (ID3, Vorbis comments, MP4 `ilst`, …). Nothing here travels in the
 * event: every client reads the same bytes.
 */
export interface AudioMetadata {
  title?: string;
  artist?: string;
  album?: string;
  /** Release year, four digits. */
  year?: string;
  /** The embedded front cover, as the file carries it. */
  cover?: Blob;
}

/** Cap on a displayed tag: the bytes are the uploader's to fill. */
const MAX_TAG_CHARS = 200;

/** One line, trimmed and capped. */
function cleanTag(value: string | undefined): string | undefined {
  // eslint-disable-next-line no-control-regex
  const line = value?.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return line ? line.slice(0, MAX_TAG_CHARS) : undefined;
}

/**
 * Normalize a container's tags for display. The track artist wins over the
 * album artist, which only stands in when the track has none (a
 * compilation's album artist is "Various Artists").
 */
export function audioTagsFrom(tags: MetadataTags): Omit<AudioMetadata, 'cover'> {
  const year = tags.date && !Number.isNaN(tags.date.getTime()) ? String(tags.date.getUTCFullYear()) : undefined;
  return {
    title: cleanTag(tags.title),
    artist: cleanTag(tags.artist) ?? cleanTag(tags.albumArtist),
    album: cleanTag(tags.album),
    year: year && /^\d{4}$/.test(year) ? year : undefined,
  };
}

/**
 * Read an audio file's tags and front cover. `source` is the file itself, or
 * a URL to it: a `blob:` URL (a decrypted file) is read whole, since it is
 * already in memory; an http(s) URL is read with range requests, so only the
 * tag block is fetched, not the track.
 *
 * Never throws: a file mediabunny can't parse, or a host that refuses the
 * read, just comes back with nothing.
 */
export async function readAudioMetadata(source: Blob | string): Promise<AudioMetadata> {
  let input: Input | undefined;
  try {
    // Loaded on demand: the main bundle has no other use for it.
    const { ALL_FORMATS, BlobSource, Input, UrlSource } = await import('mediabunny');
    let src: Source;
    if (typeof source !== 'string') src = new BlobSource(source);
    else if (source.startsWith('blob:')) src = new BlobSource(await (await fetch(source)).blob());
    else src = new UrlSource(source);

    input = new Input({ source: src, formats: ALL_FORMATS });
    const tags = await input.getMetadataTags();
    const images = (tags.images ?? []).filter((img) => img.mimeType.startsWith('image/'));
    const art = images.find((img) => img.kind === 'coverFront') ?? images[0];
    return {
      ...audioTagsFrom(tags),
      cover: art ? new Blob([art.data as Uint8Array<ArrayBuffer>], { type: art.mimeType }) : undefined,
    };
  } catch {
    return {};
  } finally {
    input?.dispose();
  }
}
