import { describe, expect, it } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';
import { decode, nprofileEncode, npubEncode } from 'nostr-tools/nip19';

import { ALL_NOTIFICATION_KINDS } from '@/lib/notificationKinds';

import {
  isWanted,
  mentionPubkeys,
  notificationActions,
  notificationPath,
  renderText,
  resolveMentions,
  templateFor,
  TEMPLATES,
} from './render';

const USER = 'a'.repeat(64);
const AUTHOR = 'b'.repeat(64);
const TARGET = 'c'.repeat(64);
const ID = 'd'.repeat(64);

function event(kind: number, tags: string[][] = [], content = ''): NostrEvent {
  return { id: ID, pubkey: AUTHOR, kind, tags, content, created_at: 1, sig: 'e'.repeat(128) };
}

function decodePath(path: string) {
  return decode(path.slice(1));
}

describe('templates', () => {
  it('cover every kind the push filters ask for', () => {
    expect([...TEMPLATES.keys()].sort()).toEqual([...ALL_NOTIFICATION_KINDS].sort());
  });

  it('name likes and dislikes and leave their symbol out', () => {
    expect(renderText(event(7, [], '+'), templateFor(event(7, [], '+'))!, 'Alice'))
      .toEqual({ title: 'Alice liked your post', body: '' });
    expect(renderText(event(7, [], '-'), templateFor(event(7, [], '-'))!, null).title)
      .toBe('Someone disliked your post');
    expect(renderText(event(7, [], '🔥'), templateFor(event(7, [], '🔥'))!, 'Alice').body).toBe('🔥');
  });

  it('keep a display name with replacement patterns as written', () => {
    const like = event(7, [], '+');
    expect(renderText(like, templateFor(like)!, "$& $'").title).toBe("$& $' liked your post");
  });
});

describe('mentions', () => {
  const NPUB = npubEncode(TARGET);
  const names = new Map([[TARGET, 'Team Soapbox']]);

  it('name a nostr: mention in the body', () => {
    const note = event(1, [], `thanks nostr:${NPUB}!`);
    expect(mentionPubkeys(note.content)).toEqual([TARGET]);
    expect(renderText(note, templateFor(note)!, 'Alice', names).body).toBe('thanks @Team Soapbox!');
  });

  it('name an nprofile mention, and one after opening punctuation', () => {
    const nprofile = nprofileEncode({ pubkey: TARGET, relays: ['wss://relay.ditto.pub'] });
    expect(resolveMentions(`cc nostr:${nprofile} (nostr:${NPUB})`, names))
      .toBe('cc @Team Soapbox (@Team Soapbox)');
  });

  it('leave a mention nobody could name as its raw token', () => {
    expect(resolveMentions(`hi nostr:${NPUB}`, new Map())).toBe(`hi nostr:${NPUB}`);
  });

  it('leave bare npubs alone: only NIP-21 URIs are mentions', () => {
    expect(mentionPubkeys(`hi ${NPUB}`)).toEqual([]);
    expect(resolveMentions(`hi ${NPUB}`, names)).toBe(`hi ${NPUB}`);
  });

  it('never rewrite an npub inside a URL', () => {
    for (const url of [
      `https://ditto.pub/${NPUB}`,
      `https://njump.me/nostr:${NPUB}`,
      `https://example.com/?u=nostr:${NPUB}`,
      `ditto.pub/nostr:${NPUB}`,
    ]) {
      expect(mentionPubkeys(`see ${url}`)).toEqual([]);
      expect(resolveMentions(`see ${url}`, names)).toBe(`see ${url}`);
    }
  });

  it('ignore a token with a bad checksum', () => {
    expect(mentionPubkeys('nostr:npub1notrealatall')).toEqual([]);
  });

  it('resolve before truncating, so a long name cannot leave half a token', () => {
    const note = event(1, [], `${'x'.repeat(100)} nostr:${NPUB}`);
    expect(renderText(note, templateFor(note)!, 'Alice', names).body).toBe(`${'x'.repeat(100)} @Team Soapbox`);
  });
});

describe('notificationPath', () => {
  it('opens the post a reaction is about, from the last e tag', () => {
    const path = notificationPath(event(7, [['e', 'f'.repeat(64)], ['e', TARGET, '', USER]], '+'), []);
    expect(decodePath(path)).toEqual({ type: 'nevent', data: { id: TARGET, relays: [], author: USER } });
  });

  it('opens a mention itself, with the relays it was seen on', () => {
    const path = notificationPath(event(1), ['wss://relay.ditto.pub']);
    expect(decodePath(path)).toEqual({
      type: 'nevent',
      data: { id: ID, relays: ['wss://relay.ditto.pub'], author: AUTHOR, kind: 1 },
    });
  });

  it('opens the awarded badge', () => {
    const path = notificationPath(event(8, [['a', `30009:${AUTHOR}:first-post`]]), []);
    expect(decodePath(path)).toEqual({
      type: 'naddr',
      data: { kind: 30009, pubkey: AUTHOR, identifier: 'first-post', relays: [] },
    });
  });

  it('falls back to /notifications without a usable target', () => {
    expect(notificationPath(event(7, [['a', `0:${USER}:`]], '+'), [])).toBe('/notifications');
    expect(notificationPath(event(6, [['e', 'not-hex']]), [])).toBe('/notifications');
    expect(notificationPath(event(8, [['a', '30009:bad:x']]), [])).toBe('/notifications');
  });

  it('sends letters to the inbox', () => {
    expect(notificationPath(event(8211), [])).toBe('/letters');
  });
});

describe('notificationActions', () => {
  it('offers Reply only on what can be answered', () => {
    expect(notificationActions(event(1)).map((a) => a.action)).toEqual(['reply', 'mark-read']);
    expect(notificationActions(event(1111)).map((a) => a.action)).toEqual(['reply', 'mark-read']);
    expect(notificationActions(event(7, [], '+')).map((a) => a.action)).toEqual(['mark-read']);
    expect(notificationActions(null).map((a) => a.action)).toEqual(['mark-read']);
  });
});

describe('isWanted', () => {
  const subscriptions = [{ filters: [{ kinds: [1, 7], '#p': [USER] }], relays: [] }];

  it('requires a match against the stored filters', () => {
    expect(isWanted(event(1, [['p', USER]]), { pubkey: USER, subscriptions })).toBe(true);
    expect(isWanted(event(1, [['p', AUTHOR]]), { pubkey: USER, subscriptions })).toBe(false);
    expect(isWanted(event(1111, [['p', USER]]), { pubkey: USER, subscriptions })).toBe(false);
  });

  it('drops the user\'s own events', () => {
    expect(isWanted({ ...event(1, [['p', USER]]), pubkey: USER }, { pubkey: USER, subscriptions })).toBe(false);
  });

  it('honours "only from people I follow"', () => {
    const state = { pubkey: USER, subscriptions, onlyFollowing: true };
    expect(isWanted(event(1, [['p', USER]]), { ...state, follows: [AUTHOR] })).toBe(true);
    expect(isWanted(event(1, [['p', USER]]), { ...state, follows: [TARGET] })).toBe(false);
  });

  it('drops events from muted pubkeys, including zaps they send', () => {
    const state = { pubkey: USER, subscriptions: [{ filters: [{ kinds: [1, 9735], '#p': [USER] }], relays: [] }] };
    expect(isWanted(event(1, [['p', USER]]), { ...state, muted: [AUTHOR] })).toBe(false);
    expect(isWanted(event(1, [['p', USER]]), { ...state, muted: [TARGET] })).toBe(true);

    const zap = event(9735, [['p', USER], ['description', JSON.stringify({ pubkey: TARGET, tags: [] })]]);
    expect(isWanted(zap, { ...state, muted: [TARGET] })).toBe(false);
  });
});
