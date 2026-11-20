/**
 * Optional NIP-13 proof of work on the events Ditto publishes: everything a
 * relay is handed as an EVENT, never a seal or auth token. The difficulty is
 * `AppConfig.powDifficulty`, pushed here by `AppProvider`; unset is off.
 */
import { sha256 } from '@noble/hashes/sha256';
import type { NostrEvent, NostrSigner } from '@nostrify/types';

export const MAX_POW_DIFFICULTY = 32;

/** Mining runs on the UI thread, so it yields this often. */
const SLICE_MS = 5;

/**
 * Kinds the user's signer signs that never reach a relay as an EVENT: seals
 * (NIP-59) ride inside a wrap, AUTH and HTTP/Blossom tokens are credentials,
 * and a zap request goes to the LNURL server.
 */
const POW_EXEMPT_KINDS = new Set([13, 9734, 22242, 24242, 27235]);

type EventTemplate = Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>;

let chosenDifficulty = 0;

export function setPowDifficulty(bits: number | undefined): void {
  chosenDifficulty = bits === undefined || !Number.isInteger(bits) || bits < 0
    ? 0
    : Math.min(bits, MAX_POW_DIFFICULTY);
}

export function powDifficulty(): number {
  return chosenDifficulty;
}

/** NIP-13 difficulty: the number of leading zero bits of an id. */
export function leadingZeroBits(hash: Uint8Array): number {
  let bits = 0;
  for (const byte of hash) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

/**
 * `template` with a `nonce` tag that gives `pubkey`'s event at least
 * `difficulty` leading zero bits. `created_at` is left alone. Any `nonce` tag
 * already present is replaced.
 */
export async function minePow<T extends EventTemplate>(
  template: T,
  pubkey: string,
  difficulty: number = powDifficulty(),
): Promise<T> {
  const tags = template.tags.filter(([name]) => name !== 'nonce');
  if (difficulty <= 0) return tags.length === template.tags.length ? template : { ...template, tags };

  // The NIP-01 serialization, split around the nonce value so only the nonce and
  // what follows it are hashed per attempt.
  const target = String(difficulty);
  const tagsJson = JSON.stringify([...tags, ['nonce', '', target]]);
  const tail = `",${JSON.stringify(target)}]]`;
  const prefix = `[0,${JSON.stringify(pubkey)},${template.created_at},${template.kind},${tagsJson.slice(0, -tail.length)}`;
  const encoder = new TextEncoder();
  const base = sha256.create().update(encoder.encode(prefix));
  const suffix = encoder.encode(`${tail},${JSON.stringify(template.content)}]`);

  let sliceStart = performance.now();
  for (let n = 0; ; n++) {
    const nonce = n.toString();
    const hash = base.clone().update(encoder.encode(nonce)).update(suffix).digest();
    if (leadingZeroBits(hash) >= difficulty) {
      return { ...template, tags: [...tags, ['nonce', nonce, target]] };
    }
    // Checked every attempt: one hashes the whole content, so on a slow phone a
    // few dozen already overrun the slice.
    if (performance.now() - sliceStart >= SLICE_MS) {
      await yieldToEventLoop();
      sliceStart = performance.now();
    }
  }
}

/** A macrotask turn without `setTimeout`'s nested 4ms clamp, which would idle a long mine ~half the time. */
function yieldToEventLoop(): Promise<void> {
  if (typeof MessageChannel === 'undefined') return new Promise((resolve) => setTimeout(resolve, 0));
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => {
      port1.close();
      resolve();
    };
    port2.postMessage(null);
  });
}

/** Mines `template` for `pubkey` unless its kind is never published as an event. */
export function minePowFor<T extends EventTemplate>(template: T, pubkey: string): Promise<T> {
  if (POW_EXEMPT_KINDS.has(template.kind)) return Promise.resolve(template);
  return minePow(template, pubkey);
}

/**
 * `signer` with proof of work mined into every event before it is signed, so a
 * bunker or extension is asked to sign the final event.
 */
export function signerWithPow<S extends NostrSigner>(signer: S, pubkey: string): S {
  return new Proxy(signer, {
    get(target, prop) {
      if (prop === 'signEvent') {
        return async (event: EventTemplate) => target.signEvent(await minePowFor(event, pubkey));
      }
      // Bound to the signer itself: class signers keep their keys in #private fields.
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
