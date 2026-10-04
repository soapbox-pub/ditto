import { decryptFileToObjectUrl, type FileEncryption } from '@/lib/encryptedFile';

/**
 * Decrypted object URLs shared between every element showing the same file.
 *
 * `useDecryptedFile` decrypts per element, which suits an attachment rendered
 * once. A profile picture is different: one author's avatar sits beside every
 * one of their posts, in every reply, mention, and hover card, so a busy feed
 * would fetch and decrypt the same blob dozens of times and hold as many copies
 * in memory. Here a file is decrypted once and its object URL handed to all of
 * them, reference-counted, and revoked a while after the last one unmounts so
 * a windowed feed scrolling back up doesn't decrypt it again.
 */

export interface SharedDecryption {
  status: 'loading' | 'ready' | 'error';
  /** The object URL, once `ready`. */
  src?: string;
}

interface Entry {
  snapshot: SharedDecryption;
  refs: number;
  listeners: Set<() => void>;
  controller: AbortController;
  releaseTimer?: ReturnType<typeof setTimeout>;
}

/** How long an unused decryption is kept before its object URL is revoked. */
const RELEASE_DELAY_MS = 60_000;

const LOADING: SharedDecryption = { status: 'loading' };

const entries = new Map<string, Entry>();

/** Identity of a decryption — the same ciphertext under the same key, verified the same way. */
export function sharedDecryptionKey(url: string, encryption: FileEncryption): string {
  const { algorithm, key, nonce, hash = '', mime = '' } = encryption;
  return [url, algorithm, key, nonce, hash, mime].join('\n');
}

/** Current state for `key`. Stable between changes, as `useSyncExternalStore` requires. */
export function getSharedDecryption(key: string): SharedDecryption {
  return entries.get(key)?.snapshot ?? LOADING;
}

/**
 * Hold a reference to the decryption of `url`, starting it if nobody else has.
 * `listener` fires whenever its state changes. Returns the release function.
 */
export function subscribeSharedDecryption(
  url: string,
  encryption: FileEncryption,
  fallbackUrls: string[],
  listener: () => void,
): () => void {
  const key = sharedDecryptionKey(url, encryption);
  let entry = entries.get(key);

  if (!entry) {
    const created: Entry = {
      snapshot: LOADING,
      refs: 0,
      listeners: new Set(),
      controller: new AbortController(),
    };
    entry = created;
    entries.set(key, created);

    const settle = (snapshot: SharedDecryption) => {
      created.snapshot = snapshot;
      for (const l of created.listeners) l();
    };

    decryptFileToObjectUrl(url, encryption, { signal: created.controller.signal, fallbackUrls })
      .then(({ objectUrl }) => {
        // Evicted while decrypting — nobody can see this URL any more.
        if (entries.get(key) !== created) URL.revokeObjectURL(objectUrl);
        else settle({ status: 'ready', src: objectUrl });
      })
      .catch(() => {
        if (entries.get(key) === created) settle({ status: 'error' });
      });
  }

  const held = entry;
  clearTimeout(held.releaseTimer);
  held.refs++;
  held.listeners.add(listener);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    held.listeners.delete(listener);
    held.refs--;
    if (held.refs > 0) return;

    held.releaseTimer = setTimeout(() => {
      if (held.refs > 0 || entries.get(key) !== held) return;
      entries.delete(key);
      held.controller.abort();
      if (held.snapshot.src) URL.revokeObjectURL(held.snapshot.src);
    }, RELEASE_DELAY_MS);
  };
}
