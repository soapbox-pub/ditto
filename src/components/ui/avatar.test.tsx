import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Avatar, AvatarFallback, AvatarImage } from './avatar';
import type { ImetaEntry } from '@/lib/imeta';

const HASH = 'd'.repeat(64);

/**
 * A kind-0 picture is, for anyone who uploaded it through the app, a
 * content-addressed URL on whichever Blossom server won the upload race. When
 * that server goes down the same bytes are on the others (BUD-04), so the
 * avatar walks the app's servers before it degrades to the initial. No
 * provider is mounted here on purpose: avatars render everywhere.
 */
describe('AvatarImage cross-server fallback', () => {
  function renderAvatar(src: string) {
    return render(
      <Avatar>
        <AvatarImage src={src} data-testid="img" />
        <AvatarFallback data-testid="fallback">A</AvatarFallback>
      </Avatar>,
    );
  }

  it('moves to the next app server on error before giving up', () => {
    renderAvatar(`https://blossom.ditto.pub/${HASH}.png`);
    const img = () => screen.getByTestId<HTMLImageElement>('img');
    expect(img().src).toBe(`https://blossom.ditto.pub/${HASH}.png`);

    fireEvent.error(img());
    expect(img().src).toBe(`https://blossom.dreamith.to/${HASH}.png`);
    fireEvent.error(img());
    expect(img().src).toBe(`https://blossom.primal.net/${HASH}.png`);

    fireEvent.error(img());
    expect(screen.queryByTestId('img')).toBeNull();
  });

  it('gives a non-Blossom picture one attempt', () => {
    renderAvatar('https://pics.example/me.jpg');
    fireEvent.error(screen.getByTestId('img'));
    expect(screen.queryByTestId('img')).toBeNull();
  });

  it('starts the walk over when the picture changes', () => {
    const { rerender } = renderAvatar(`https://blossom.ditto.pub/${HASH}.png`);
    fireEvent.error(screen.getByTestId('img'));
    const other = 'e'.repeat(64);
    rerender(
      <Avatar>
        <AvatarImage src={`https://blossom.ditto.pub/${other}.png`} data-testid="img" />
        <AvatarFallback data-testid="fallback">A</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByTestId<HTMLImageElement>('img').src).toBe(`https://blossom.ditto.pub/${other}.png`);
  });
});

/** A kind 0's imeta for its picture adds the author's own fallback hosts, ahead of the derived mirrors. */
describe('AvatarImage imeta', () => {
  function renderAvatar(src: string, imeta: ImetaEntry) {
    return render(
      <Avatar>
        <AvatarImage src={src} imeta={imeta} data-testid="img" />
        <AvatarFallback data-testid="fallback">A</AvatarFallback>
      </Avatar>,
    );
  }

  it('tries declared fallbacks before the app servers', () => {
    const src = `https://blossom.ditto.pub/${HASH}.png`;
    renderAvatar(src, { url: src, fallbacks: [`https://mirror.example/${HASH}.png`] });
    const img = () => screen.getByTestId<HTMLImageElement>('img');

    fireEvent.error(img());
    expect(img().src).toBe(`https://mirror.example/${HASH}.png`);
    fireEvent.error(img());
    expect(img().src).toBe(`https://blossom.dreamith.to/${HASH}.png`);
  });

  it('ignores imeta describing a different picture', () => {
    renderAvatar('https://pics.example/me.jpg', {
      url: 'https://pics.example/old.jpg',
      fallbacks: ['https://mirror.example/old.jpg'],
    });
    fireEvent.error(screen.getByTestId('img'));
    expect(screen.queryByTestId('img')).toBeNull();
  });

  it('shows the initial, never the ciphertext, while an encrypted picture decrypts', () => {
    vi.stubGlobal('fetch', () => new Promise(() => {}));
    const src = `https://blossom.ditto.pub/${HASH}`;
    renderAvatar(src, { url: src, encryption: { algorithm: 'aes-gcm', key: '00'.repeat(32), nonce: '00'.repeat(12) } });
    expect(screen.queryByTestId('img')).toBeNull();
    expect(screen.getByTestId('fallback')).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
