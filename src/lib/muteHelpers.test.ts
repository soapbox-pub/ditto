import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';

import { createMuteMatcher, isEventMuted, type MuteListItem } from './muteHelpers';

const WALLET = 'a'.repeat(64);
const SENDER = 'b'.repeat(64);
const USER = 'c'.repeat(64);

function zap(tags: string[][]): NostrEvent {
  return {
    id: 'd'.repeat(64),
    pubkey: WALLET,
    created_at: 1_700_000_000,
    kind: 9735,
    tags: [['p', USER], ...tags],
    content: '',
    sig: '0'.repeat(128),
  };
}

const request = JSON.stringify({ kind: 9734, pubkey: SENDER, tags: [], content: 'nice' });

describe('isEventMuted on zap receipts', () => {
  const mutedSender: MuteListItem[] = [{ type: 'pubkey', value: SENDER }];

  it('mutes a zap by its sender, not just the wallet service that signed it', () => {
    expect(isEventMuted(zap([['description', request]]), mutedSender)).toBe(true);
    expect(isEventMuted(zap([['P', SENDER]]), mutedSender)).toBe(true);
  });

  it('still mutes a zap by the wallet service that signed it', () => {
    expect(isEventMuted(zap([['description', request]]), [{ type: 'pubkey', value: WALLET }])).toBe(true);
  });

  it('leaves a zap from someone else alone', () => {
    expect(isEventMuted(zap([['description', request]]), [{ type: 'pubkey', value: USER }])).toBe(false);
  });
});

describe('inMutedThread', () => {
  const ROOT = 'e'.repeat(64);
  const matcher = createMuteMatcher([{ type: 'thread', value: ROOT }]);
  const post = (id: string, tags: string[][]): NostrEvent => ({
    id, pubkey: USER, created_at: 1_700_000_000, kind: 1, tags, content: 'hi', sig: '0'.repeat(128),
  });

  it('covers the root and every reply inside the thread', () => {
    expect(matcher.inMutedThread(post(ROOT, []))).toBe(true);
    expect(matcher.inMutedThread(post('1'.repeat(64), [['e', ROOT, '', 'root'], ['e', '2'.repeat(64), '', 'reply']]))).toBe(true);
    expect(matcher.inMutedThread(post('3'.repeat(64), [['E', ROOT], ['e', '2'.repeat(64)]]))).toBe(true);
  });

  it('leaves quotes and other threads alone', () => {
    expect(matcher.inMutedThread(post('4'.repeat(64), [['e', ROOT, '', 'mention']]))).toBe(false);
    expect(matcher.inMutedThread(post('5'.repeat(64), [['e', '6'.repeat(64), '', 'root']]))).toBe(false);
  });
});
