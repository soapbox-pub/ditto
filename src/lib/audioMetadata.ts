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

/**
 * Most bytes read from a remote file. A tag block declares its own size (up
 * to 256 MB for ID3v2), and players read tags as they scroll into a feed, so
 * without a cap a post could make every viewer download and hold hundreds of
 * megabytes. Real tag blocks with cover art fit comfortably.
 */
const MAX_READ_BYTES = 4 * 1024 * 1024;

/** Largest cover shown. */
const MAX_COVER_BYTES = 2 * 1024 * 1024;

/** How long a read may take before it's given up on. */
const READ_TIMEOUT_MS = 15_000;

/**
 * Cover types shown. The type is the file's own claim, and the cover becomes
 * a same-origin `blob:` URL: an SVG there would run script as Ditto if ever
 * opened directly, so only raster formats get through.
 */
const COVER_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/bmp']);

/** `fetch`, but every response together may carry at most `limit` bytes. */
function cappedFetch(limit: number): typeof fetch {
  let total = 0;
  return async (input, init) => {
    const response = await fetch(input, init);
    if (!response.body) return response;
    const counted = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength;
        if (total > limit) controller.error(new Error('Audio metadata read limit exceeded'));
        else controller.enqueue(chunk);
      },
    }));
    return new Response(counted, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
}

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
 * Never throws: a file mediabunny can't parse, a host that refuses the read,
 * or one that sends too much or too slowly, just comes back with nothing.
 */
export async function readAudioMetadata(source: Blob | string): Promise<AudioMetadata> {
  let input: Input | undefined;
  try {
    // Loaded on demand: the main bundle has no other use for it.
    const { ADTS, BlobSource, FLAC, Input, MATROSKA, MP3, MP4, OGG, UrlSource, WAVE, WEBM } = await import('mediabunny');
    let src: Source;
    if (typeof source !== 'string') src = new BlobSource(source);
    else if (source.startsWith('blob:')) src = new BlobSource(await (await fetch(source)).blob());
    else {
      src = new UrlSource(source, {
        fetchFn: cappedFetch(MAX_READ_BYTES),
        maxCacheSize: MAX_READ_BYTES,
        getRetryDelay: () => null,
      });
    }

    // Audio containers only: HLS would have mediabunny fetch whatever a
    // playlist posing as the file lists.
    const reader = new Input({ source: src, formats: [MP3, FLAC, OGG, MP4, WAVE, ADTS, MATROSKA, WEBM] });
    input = reader;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tags = await Promise.race([
      reader.getMetadataTags(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Audio metadata read timed out')), READ_TIMEOUT_MS);
      }),
    ]).finally(() => clearTimeout(timer));
    const images = (tags.images ?? []).filter((img) =>
      COVER_TYPES.has(img.mimeType.toLowerCase()) && img.data.byteLength <= MAX_COVER_BYTES,
    );
    const art = images.find((img) => img.kind === 'coverFront') ?? images[0];
    return {
      ...audioTagsFrom(tags),
      cover: art ? new Blob([art.data as Uint8Array<ArrayBuffer>], { type: art.mimeType.toLowerCase() }) : undefined,
    };
  } catch {
    return {};
  } finally {
    input?.dispose();
  }
}
