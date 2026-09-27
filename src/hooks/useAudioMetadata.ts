import { useEffect, useState } from 'react';

import { readAudioMetadata, type AudioMetadata } from '@/lib/audioMetadata';

/** A file's tags, with its cover as an object URL ready for an `<img>`. */
export type AudioDisplay = Omit<AudioMetadata, 'cover'> & { coverUrl?: string };

/** Whether there is anything to show beyond a bare player. */
export function hasAudioMetadata(meta: AudioDisplay | undefined): meta is AudioDisplay {
  return !!meta && !!(meta.title || meta.artist || meta.album || meta.coverUrl);
}

/** How many files' metadata the session keeps; the oldest goes first. */
const MAX_ENTRIES = 200;

/**
 * Read once per file per session, keyed by the file's URL rather than the
 * per-decrypt object URL it resolved to, so a track that scrolls back into
 * view isn't parsed again.
 */
const settled = new Map<string, AudioDisplay>();
const pending = new Map<string, Promise<AudioDisplay>>();

function settle(key: string, value: AudioDisplay): void {
  settled.delete(key);
  settled.set(key, value);
  while (settled.size > MAX_ENTRIES) {
    const [oldest, entry] = settled.entries().next().value!;
    if (entry.coverUrl) URL.revokeObjectURL(entry.coverUrl);
    settled.delete(oldest);
  }
}

function load(key: string, src: string): Promise<AudioDisplay> {
  let promise = pending.get(key);
  if (!promise) {
    promise = readAudioMetadata(src).then(({ cover, ...tags }) => {
      const display = { ...tags, coverUrl: cover ? URL.createObjectURL(cover) : undefined };
      pending.delete(key);
      settle(key, display);
      return display;
    });
    pending.set(key, promise);
  }
  return promise;
}

/**
 * The tags and cover art embedded in an audio file. `key` names the file (its
 * original URL); `src` is where its bytes can be read — the decrypted object
 * URL for an encrypted file, or the URL itself, which is read by range
 * request so only the tag block is fetched. Without `src` only an
 * already-read result is returned.
 */
export function useAudioMetadata(key: string, src?: string): AudioDisplay | undefined {
  const [value, setValue] = useState<AudioDisplay | undefined>(() => settled.get(key));
  useEffect(() => {
    const done = settled.get(key);
    if (done) {
      setValue(done);
      return;
    }
    setValue(undefined);
    if (!src) return;
    let live = true;
    void load(key, src).then((result) => {
      if (live) setValue(result);
    });
    return () => {
      live = false;
    };
  }, [key, src]);
  return value;
}
