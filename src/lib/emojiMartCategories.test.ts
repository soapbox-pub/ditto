/**
 * Pins the emoji-mart behaviour these helpers work around, so a dependency
 * bump that changes it fails here rather than in the picker.
 */

import data, { type EmojiMartData } from '@emoji-mart/data';
import { Data, init, SearchIndex } from 'emoji-mart';
import { describe, expect, it } from 'vitest';

import {
  customPickerId,
  pruneFrequentlyUsed,
  syncEmojiMartCategories,
  type EmojiMartCustomCategory,
} from '@/lib/emojiMartCategories';

type Entry = { skins: { native?: string; src?: string }[] };
const emojis = () => (Data as unknown as { emojis: Record<string, Entry> }).emojis;

// Shaped as EmojiPicker builds them.
function pack(index: number, shortcodes: string[]): EmojiMartCustomCategory {
  return {
    id: `custom-${index}`,
    name: `Pack ${index}`,
    emojis: shortcodes.map((s) => ({
      id: customPickerId(s, `https://e/${s}.png`),
      name: s,
      keywords: [s],
      skins: [{ src: `https://e/${s}.png` }],
    })),
  };
}

async function initWith(custom: EmojiMartCustomCategory[]) {
  syncEmojiMartCategories(custom);
  await init({ data, custom, set: 'native', categories: ['frequent', ...custom.map((c) => c.id), 'people'] });
}

describe('custom emoji in emoji-mart', () => {
  it('leaves a built-in emoji alone when a pack has an emoji of the same name', async () => {
    await initWith([pack(0, ['heart'])]);

    expect(emojis().heart.skins[0].native).toBe('❤️');
  });

  it('forgets the emoji of a palette that is gone, in search too', async () => {
    await initWith([pack(0, ['blobwave'])]);
    expect((await SearchIndex.search('blobwave'))?.length).toBe(1);

    await initWith([]);

    expect(Object.keys(emojis()).filter((id) => id.startsWith('nip30-blobwave'))).toEqual([]);
    expect(await SearchIndex.search('blobwave')).toEqual([]);
  });

  it('keeps a pack added after the first init, and drops one removed since', async () => {
    await initWith([pack(0, ['a1'])]);
    await initWith([pack(0, ['a1']), pack(1, ['b1'])]);
    expect((Data as { categories: { id: string }[] }).categories.map((c) => c.id)).toContain('custom-1');

    await initWith([pack(0, ['a1'])]);
    expect((Data as { categories: { id: string }[] }).categories.map((c) => c.id)).not.toContain('custom-1');
  });
});

describe('pruneFrequentlyUsed', () => {
  it('drops ids that resolve to nothing, keeping built-in and custom ones', () => {
    const custom = customPickerId('blobcat', 'https://e/blobcat.png');
    localStorage.setItem('emoji-mart.frequently', JSON.stringify({ heart: 5, blobcat: 9, [custom]: 9 }));

    pruneFrequentlyUsed((data as unknown as EmojiMartData).emojis);

    expect(JSON.parse(localStorage.getItem('emoji-mart.frequently')!)).toEqual({ heart: 5, [custom]: 9 });
  });
});
