import { fireEvent, render, screen, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { describe, expect, it, vi } from 'vitest';

import { StickerPicker } from '@/components/StickerPicker';
import type { CustomEmoji } from '@/hooks/useCustomEmojis';

vi.mock('@/components/CustomEmoji', () => ({
  CustomEmojiImg: ({ name }: { name: string }) => <span>{name}</span>,
}));

const CATS = `30030:${'a'.repeat(64)}:cats`;
const DOGS = `30030:${'b'.repeat(64)}:dogs`;

// Palette order as useCustomEmojis builds it: stickers on the list first, then each pack.
const palette: CustomEmoji[] = [
  { shortcode: 'wave', url: 'https://example.com/wave.webp' },
  { shortcode: 'cat_happy', url: 'https://example.com/cat_happy.webp', packCoord: CATS, packName: 'Cats' },
  { shortcode: 'cat_sad', url: 'https://example.com/cat_sad.webp', packCoord: CATS, packName: 'Cats' },
  { shortcode: 'dog_happy', url: 'https://example.com/dog_happy.webp', packCoord: DOGS },
];

function renderPicker(customEmojis: CustomEmoji[], onSelect = vi.fn()) {
  render(
    <IntlProvider locale="en">
      <StickerPicker customEmojis={customEmojis} onSelect={onSelect} autoFocus={false} />
    </IntlProvider>,
  );
}

/** Each section's header and the stickers in it, top to bottom. */
function sections() {
  return screen.getAllByRole('group').map((group) => ({
    name: group.firstElementChild?.textContent,
    stickers: within(group).getAllByRole('button').map((button) => button.title),
  }));
}

describe('StickerPicker', () => {
  it('shows each pack in its own section, named by its title or else its identifier', () => {
    renderPicker(palette);

    expect(sections()).toEqual([
      { name: 'Custom', stickers: ['wave'] },
      { name: 'Cats', stickers: ['cat_happy', 'cat_sad'] },
      { name: 'dogs', stickers: ['dog_happy'] },
    ]);
  });

  it('sends the sticker that was clicked', () => {
    const onSelect = vi.fn();
    renderPicker(palette, onSelect);

    fireEvent.click(within(screen.getByRole('group', { name: 'Cats' })).getByTitle('cat_sad'));

    expect(onSelect).toHaveBeenCalledWith(palette[2]);
  });

  it('keeps only packs with a match while searching', () => {
    renderPicker(palette);

    fireEvent.change(screen.getByPlaceholderText('Search stickers...'), { target: { value: ' HAPPY ' } });

    expect(sections()).toEqual([
      { name: 'Cats', stickers: ['cat_happy'] },
      { name: 'dogs', stickers: ['dog_happy'] },
    ]);
  });
});
