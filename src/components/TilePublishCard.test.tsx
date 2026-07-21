import type { NostrEvent } from '@nostrify/nostrify';
import { render, screen } from '@testing-library/react';
import { finalizeEvent } from 'nostr-tools';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { TilePublishCard } from './TilePublishCard';

const PRIVATE_KEY = new Uint8Array(32).fill(1);

function tileEvent(tags?: string[][]): NostrEvent {
  return finalizeEvent({
    created_at: 1_700_000_000,
    kind: 30207,
    content: 'function render() return ui.Text("This Lua source must not render as a note") end',
    tags: tags ?? [
      ['d', 'alice@example.com:weather'],
      ['name', 'Weather'],
      ['v', '1.2.3'],
      ['s', '3'],
      ['language', 'lua'],
      ['t', 'nostr-canvas-tile'],
      ['summary', 'Local weather at a glance'],
    ],
  }, PRIVATE_KEY);
}

describe('TilePublishCard', () => {
  it('renders native tile metadata rather than the Lua event content and links to the tile detail route', () => {
    render(
      <MemoryRouter>
        <TilePublishCard event={tileEvent()} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Weather')).toBeInTheDocument();
    expect(screen.getByText('Local weather at a glance')).toBeInTheDocument();
    expect(screen.queryByText(/This Lua source/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /weather/i })).toHaveAttribute('href', expect.stringMatching(/^\/tiles\/naddr1/));
  });

  it('hides malformed definitions instead of rendering their source as a text note', () => {
    const { container } = render(
      <MemoryRouter>
        <TilePublishCard event={tileEvent([['d', 'alice@example.com:weather'], ['s', '3'], ['language', 'lua']])} />
      </MemoryRouter>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
