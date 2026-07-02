import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';

import { getCanonicalBlobbiD } from './blobbi';
import {
  KIND_BLOBBI_INTERACTION,
  buildInteractionEventTemplate,
  parseInteractionEvent,
  isValidInteractionEvent,
} from './blobbi-interaction';

const OWNER = 'a'.repeat(64);
const PET_ID = '0123456789';
const D = getCanonicalBlobbiD(OWNER, PET_ID);
const AUTHOR = 'b'.repeat(64);

function makeInteractionEvent(tags: string[][], overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: 'f'.repeat(64),
    pubkey: AUTHOR,
    created_at: 1_700_000_000,
    kind: KIND_BLOBBI_INTERACTION,
    tags,
    content: '',
    sig: '0'.repeat(128),
    ...overrides,
  };
}

describe('buildInteractionEventTemplate', () => {
  it('builds a canonical 1124 template using the address helper', () => {
    const template = buildInteractionEventTemplate({
      ownerPubkey: OWNER,
      blobbiDTag: D,
      action: 'feed',
      source: 'blobbi-page',
    });

    expect(template.kind).toBe(KIND_BLOBBI_INTERACTION);
    expect(template.content).toBe('');

    const aTag = template.tags.find(([n]) => n === 'a')?.[1];
    expect(aTag).toBe(`31124:${OWNER}:${D}`);

    expect(template.tags).toContainEqual(['p', OWNER]);
    expect(template.tags).toContainEqual(['action', 'feed']);
    expect(template.tags).toContainEqual(['source', 'blobbi-page']);
    // short-id derived from canonical d-tag
    expect(template.tags).toContainEqual(['blobbi', PET_ID]);
    // NIP-31 alt
    expect(template.tags).toContainEqual(['alt', 'Blobbi interaction: feed']);
  });

  it('includes an item tag when provided', () => {
    const template = buildInteractionEventTemplate({
      ownerPubkey: OWNER,
      blobbiDTag: D,
      action: 'medicate',
      source: 'companion',
      itemId: 'medicine-basic',
    });
    expect(template.tags).toContainEqual(['item', 'medicine-basic']);
  });
});

describe('parseInteractionEvent', () => {
  it('parses a valid interaction event (behavior unchanged)', () => {
    const template = buildInteractionEventTemplate({
      ownerPubkey: OWNER,
      blobbiDTag: D,
      action: 'play',
      source: 'blobbi-page',
      itemId: 'toy-ball',
    });
    const event = makeInteractionEvent(template.tags);

    const parsed = parseInteractionEvent(event);
    expect(parsed).toBeDefined();
    expect(parsed!.blobbiCoordinate).toBe(`31124:${OWNER}:${D}`);
    expect(parsed!.ownerPubkey).toBe(OWNER);
    expect(parsed!.action).toBe('play');
    expect(parsed!.source).toBe('blobbi-page');
    expect(parsed!.blobbiShortId).toBe(PET_ID);
    expect(parsed!.itemId).toBe('toy-ball');
    expect(parsed!.authorPubkey).toBe(AUTHOR);
    expect(isValidInteractionEvent(event)).toBe(true);
  });

  it('round-trips build → event → parse', () => {
    const template = buildInteractionEventTemplate({
      ownerPubkey: OWNER,
      blobbiDTag: D,
      action: 'clean',
      source: 'companion',
    });
    const parsed = parseInteractionEvent(makeInteractionEvent(template.tags));
    expect(parsed?.action).toBe('clean');
    expect(parsed?.blobbiCoordinate).toBe(`31124:${OWNER}:${D}`);
  });

  it('rejects events with the wrong kind', () => {
    const template = buildInteractionEventTemplate({
      ownerPubkey: OWNER,
      blobbiDTag: D,
      action: 'feed',
      source: 'blobbi-page',
    });
    const event = makeInteractionEvent(template.tags, { kind: 1 });
    expect(parseInteractionEvent(event)).toBeUndefined();
  });

  it('rejects a malformed a-tag coordinate', () => {
    // wrong kind prefix
    expect(
      parseInteractionEvent(
        makeInteractionEvent([
          ['a', `11125:${OWNER}:${D}`],
          ['p', OWNER],
          ['action', 'feed'],
          ['source', 'blobbi-page'],
        ]),
      ),
    ).toBeUndefined();

    // missing d segment
    expect(
      parseInteractionEvent(
        makeInteractionEvent([
          ['a', `31124:${OWNER}`],
          ['p', OWNER],
          ['action', 'feed'],
          ['source', 'blobbi-page'],
        ]),
      ),
    ).toBeUndefined();
  });

  it('rejects events missing required tags', () => {
    const base: string[][] = [
      ['a', `31124:${OWNER}:${D}`],
      ['p', OWNER],
      ['action', 'feed'],
      ['source', 'blobbi-page'],
    ];
    // Drop each required tag in turn
    for (const drop of ['a', 'p', 'action', 'source']) {
      const tags = base.filter(([n]) => n !== drop);
      expect(parseInteractionEvent(makeInteractionEvent(tags))).toBeUndefined();
    }
  });

  it('rejects an unrecognised action value', () => {
    expect(
      parseInteractionEvent(
        makeInteractionEvent([
          ['a', `31124:${OWNER}:${D}`],
          ['p', OWNER],
          ['action', 'teleport'],
          ['source', 'blobbi-page'],
        ]),
      ),
    ).toBeUndefined();
  });

  it('ignores an extra legacy `t` tag on an otherwise valid event', () => {
    // Ditto's 1124 schema does not use `t`; a stray one must not break parsing.
    const parsed = parseInteractionEvent(
      makeInteractionEvent([
        ['a', `31124:${OWNER}:${D}`],
        ['p', OWNER],
        ['action', 'feed'],
        ['source', 'blobbi-page'],
        ['t', 'blobbi'],
      ]),
    );
    expect(parsed?.action).toBe('feed');
  });
});
