import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Avatar, AvatarFallback, AvatarImage } from './avatar';

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
