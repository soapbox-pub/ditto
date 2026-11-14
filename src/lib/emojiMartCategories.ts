import { Data, SearchIndex } from 'emoji-mart';

/** A custom (NIP-30 pack) category handed to emoji-mart's `custom` option. */
export interface EmojiMartCustomCategory {
  id: string;
  name: string;
  emojis: { id: string; name: string; keywords: string[]; skins: { src: string }[] }[];
}

const CUSTOM_ID_PREFIX = 'nip30-';

/**
 * The emoji-mart id for a custom emoji. emoji-mart keeps one module-global
 * table of every emoji by id, built-ins included, and a custom emoji written
 * under a built-in's id (a pack's `heart`, `+1`, `fire`) replaces it — its
 * image then shows, and gets sent, wherever the user picks that built-in. The
 * prefix keeps custom ids apart from built-in ones, and the URL hash keeps
 * two packs' same-named emojis apart. Stable across sessions and devices, so
 * "Frequently used" keeps its counts.
 */
export function customPickerId(shortcode: string, url: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    hash ^= url.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${CUSTOM_ID_PREFIX}${shortcode}-${(hash >>> 0).toString(36)}`;
}

/**
 * Reconcile emoji-mart's module-global tables with the custom categories
 * we're about to initialise a Picker with. Call it even with none.
 *
 * emoji-mart keeps `Data` on the module, and its `categories` (ordering) option
 * filters `Data.originalCategories` — an array that only ever receives custom
 * categories during the FIRST `init`. Every later init pushes its customs onto
 * a different array, which the filter then discards. The visible effect is a
 * picker frozen at whatever packs existed when it was first opened: add a pack
 * mid-session and its emojis never get a section until a full page reload.
 *
 * It also never forgets a custom emoji, so one from a pack since removed (or
 * from an account since logged out) would stay in search until a reload.
 *
 * So we reconcile both ourselves. Guarded — if a future emoji-mart drops either
 * field, this degrades to emoji-mart's own behaviour rather than throwing.
 */
export function syncEmojiMartCategories(categories: EmojiMartCustomCategory[]): void {
  const data = Data as { originalCategories?: unknown; emojis?: Record<string, unknown> } | undefined;
  if (!data || !Array.isArray(data.originalCategories)) return;

  // Every custom category we've ever supplied carries this prefix, so a pack
  // the user has since removed is dropped along with the stale copies.
  const kept = (data.originalCategories as { id: string }[]).filter((c) => !c.id.startsWith('custom-'));
  data.originalCategories = [...kept, ...categories];

  if (!data.emojis) return;
  const live = new Set(categories.flatMap((c) => c.emojis.map((e) => e.id)));
  let purged = false;
  for (const id of Object.keys(data.emojis)) {
    if (id.startsWith(CUSTOM_ID_PREFIX) && !live.has(id)) {
      delete data.emojis[id];
      purged = true;
    }
  }
  // The search pool is a snapshot of `Data.emojis`, rebuilt only when an emoji is new.
  if (purged) SearchIndex.reset();
}

const FREQUENTLY_KEY = 'emoji-mart.frequently';

/**
 * Drop "Frequently used" ids that resolve to nothing — such as the bare
 * shortcodes custom emojis had before {@link customPickerId}. emoji-mart sorts
 * them into the row before discarding them, so each one costs a slot. A custom
 * id is kept even while its pack is absent. Effective before the session's
 * first Picker, which caches the table.
 */
export function pruneFrequentlyUsed(nativeEmojis: Record<string, unknown>): void {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(FREQUENTLY_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return;
    const entries = Object.entries(raw);
    const kept = entries.filter(([id]) => Object.hasOwn(nativeEmojis, id) || id.startsWith(CUSTOM_ID_PREFIX));
    if (kept.length < entries.length) localStorage.setItem(FREQUENTLY_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Unavailable or corrupt — emoji-mart copes with either.
  }
}
