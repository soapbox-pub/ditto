import type { NostrEvent } from '@nostrify/nostrify';
import { finalizeEvent } from 'nostr-tools';
import { describe, expect, it } from 'vitest';
import { parseTileDefinition } from './definition';

const PRIVATE_KEY = new Uint8Array(32).fill(1);

function tileEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  const { id: _id, pubkey: _pubkey, sig: _sig, ...unsigned } = overrides;
  return {
    ...finalizeEvent({
      created_at: 1_700_000_000,
      kind: 30207,
      content: 'function render() return ui.Text("Weather") end',
      tags: [
      ['d', 'alice@example.com:weather'],
      ['name', 'Weather'],
      ['v', '1.2.3'],
      ['s', '3'],
      ['language', 'lua'],
      ['t', 'nostr-canvas-tile'],
      ['summary', 'Local weather at a glance'],
      ['description', 'A **weather** tile.'],
      ['image', 'https://cdn.example.com/weather.png'],
      ['perm', 'fetch'],
      ['widget', 'label:Weather'],
      ],
      ...unsigned,
    }, PRIVATE_KEY),
    ...overrides,
  };
}

describe('parseTileDefinition', () => {
  it('uses the upstream parser and exposes safe marketplace metadata', () => {
    const tile = parseTileDefinition(tileEvent());

    expect(tile).toMatchObject({
      identifier: 'alice@example.com:weather',
      name: 'Weather',
      version: '1.2.3',
      language: 'lua',
      summary: 'Local weather at a glance',
      description: 'A **weather** tile.',
      image: 'https://cdn.example.com/weather.png',
      perms: ['fetch'],
      widget: { label: 'Weather' },
    });
  });

  it.each([
    ['wrong kind', tileEvent({ kind: 1 })],
    ['unsupported schema', tileEvent({ tags: [['d', 'alice@example.com:weather'], ['name', 'Weather'], ['s', '99'], ['language', 'lua']] })],
    ['missing identifier', tileEvent({ tags: [['name', 'Weather'], ['s', '3'], ['language', 'lua']] })],
    ['missing name', tileEvent({ tags: [['d', 'alice@example.com:weather'], ['s', '3'], ['language', 'lua']] })],
    ['missing language', tileEvent({ tags: [['d', 'alice@example.com:weather'], ['name', 'Weather'], ['s', '3']] })],
  ])('returns null for %s', (_reason, event) => {
    expect(parseTileDefinition(event)).toBeNull();
  });

  it('rejects a definition with an unsafe optional image', () => {
    const tile = parseTileDefinition(tileEvent({
      tags: [
        ['d', 'alice@example.com:weather'],
        ['name', 'Weather'],
        ['s', '3'],
        ['language', 'lua'],
        ['image', 'javascript:alert(1)'],
      ],
    }));

    expect(tile).toBeNull();
  });
});
