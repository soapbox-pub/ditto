import type { CustomEmoji } from '@/hooks/useCustomEmojis';

/**
 * The durable, per-account copy of the last resolved custom-emoji palette.
 *
 * The React Query cache is in-memory and wiped on every reload, so without a
 * durable floor the picker, quick-react row and shortcode autocomplete
 * re-derive from a live two-hop relay read (10030 list → 30030 packs) on each
 * load and come up empty whenever that read loses its race.
 *
 * It is also the reload-surviving evidence that a list EXISTS, which the
 * kind-10030 write path checks before it will build a list from scratch.
 *
 * Kept in localStorage (not IndexedDB) for the synchronous read: it seeds
 * `useCustomEmojis`' `initialData`, so the palette is there on the first frame.
 * One key per account, capped at {@link MAX_STORED_EMOJIS} entries: every
 * origin shares one ~5 MB localStorage quota, and a user with dozens of large
 * packs mustn't crowd out writes that matter more (logins, settings). The
 * floor only has to be good enough until the live read lands.
 */

const KEY_PREFIX = 'ditto:custom-emojis:';

/** Roughly 300K characters at typical URL/shortcode lengths. */
const MAX_STORED_EMOJIS = 1500;

const paletteKey = (pubkey: string) => `${KEY_PREFIX}${pubkey}`;

function isCustomEmoji(e: unknown): e is CustomEmoji {
  return !!e && typeof e === 'object' &&
    typeof (e as CustomEmoji).shortcode === 'string' &&
    typeof (e as CustomEmoji).url === 'string';
}

/** The stored palette for `pubkey`, or an empty list. */
export function loadPalette(pubkey: string): CustomEmoji[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(paletteKey(pubkey)) ?? '');
    return Array.isArray(parsed) ? parsed.filter(isCustomEmoji) : [];
  } catch {
    return [];
  }
}

/** Replace the stored palette for `pubkey` (a no-op when nothing changed). */
export function savePalette(pubkey: string, emojis: CustomEmoji[]): void {
  try {
    const key = paletteKey(pubkey);
    const next = JSON.stringify(emojis.slice(0, MAX_STORED_EMOJIS));
    if (localStorage.getItem(key) !== next) localStorage.setItem(key, next);
  } catch {
    // localStorage full/unavailable — the in-memory result still stands.
  }
}

/** Whether this account has ever resolved a non-empty palette on this device. */
export function hasDurableEmojis(pubkey: string): boolean {
  // `savePalette` only ever writes a JSON array of objects, so one opening
  // with an object holds at least one entry — no need to parse it all.
  try {
    return localStorage.getItem(paletteKey(pubkey))?.startsWith('[{') ?? false;
  } catch {
    return false;
  }
}
