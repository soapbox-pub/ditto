import { Data } from 'emoji-mart';

/** A custom (NIP-30 pack) category handed to emoji-mart's `custom` option. */
export interface EmojiMartCustomCategory {
  id: string;
  name: string;
  emojis: { id: string; name: string; keywords: string[]; skins: { src: string }[] }[];
}

/**
 * Reconcile emoji-mart's module-global category table with the custom
 * categories we're about to initialise a Picker with.
 *
 * emoji-mart keeps `Data` on the module, and its `categories` (ordering) option
 * filters `Data.originalCategories` — an array that only ever receives custom
 * categories during the FIRST `init`. Every later init pushes its customs onto
 * a different array, which the filter then discards. The visible effect is a
 * picker frozen at whatever packs existed when it was first opened: add a pack
 * mid-session and its emojis never get a section until a full page reload.
 *
 * So we reconcile it ourselves: drop any stale custom entry, then append the
 * fresh objects. Guarded — if a future emoji-mart drops the field, ordering
 * degrades to the default rather than throwing.
 */
export function syncEmojiMartCategories(categories: EmojiMartCustomCategory[]): void {
  const data = Data as { originalCategories?: unknown } | undefined;
  if (!data || !Array.isArray(data.originalCategories)) return;

  // Every custom category we've ever supplied carries this prefix, so a pack
  // the user has since removed is dropped along with the stale copies.
  const kept = (data.originalCategories as { id: string }[]).filter((c) => !c.id.startsWith('custom-'));
  data.originalCategories = [...kept, ...categories];
}
