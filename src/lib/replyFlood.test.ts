import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';

import { isMixedScript, replyFloodIds, shapeKey } from './replyFlood';

const SELF = 'a'.repeat(64);

/** A pubkey that is distinct per index but shaped like a real one. */
function key(n: number): string {
  return n.toString(16).padStart(2, '0').repeat(32);
}

let counter = 0;

function reply(author: string, content: string): NostrEvent {
  return {
    id: (counter++).toString(16).padStart(64, '0'),
    pubkey: author,
    created_at: 1_700_000_000 + counter,
    kind: 1,
    tags: [['p', SELF]],
    content,
    sig: '0'.repeat(128),
  };
}

/** Deterministic PRNG, so a generated campaign is the same every run. */
function rng(seed: number): () => number {
  return () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
    return seed / 2 ** 31;
  };
}

describe('DISGUISE', () => {
  // Both observed live, one each from two throwaway keys, hours apart.
  const LOOK = '👀 L\u0555\u039Fk a\u0422 \u13A2hi\u0405: https://one.example.cc/?ref=3j5w3a\n⏳ \u13A2i\u041C\u13AC i\u13DA limi\u03A4\u0415d!';
  const AIRDROP = '🪂 Airdrop alert: https://one.example.cc/?ref=xjz2uo\n🪂 Airdro\u03A1 \u13DAea\u0405on is her\u0395.';

  it('folds a lone linked reply spelled in mixed scripts', () => {
    const look = reply(key(1), LOOK);
    const airdrop = reply(key(2), AIRDROP);
    expect(replyFloodIds([look])).toEqual(new Set([look.id]));
    expect(replyFloodIds([airdrop])).toEqual(new Set([airdrop.id]));
  });

  it('reads the disguised words back as the Latin they imitate', () => {
    expect(shapeKey(AIRDROP)).toBe('🪂 airdrop alert: @ 🪂 airdrop season is here.');
  });

  it('leaves whole words in another script alone', () => {
    expect(isMixedScript('привет')).toBe(false);
    expect(isMixedScript('Pokémon')).toBe(false);
    const russian = reply(key(3), 'Привет всем, посмотрите https://example.com очень интересно');
    expect(replyFloodIds([russian])).toEqual(new Set());
    expect(shapeKey('Привет всем')).toBe('привет всем');
  });

  it('needs a link', () => {
    const ev = reply(key(4), 'L\u0555\u039Fk a\u0422 \u13A2hi\u0405');
    expect(replyFloodIds([ev])).toEqual(new Set());
  });

  it('never folds the reader or a follow', () => {
    const own = reply(SELF, LOOK);
    const friend = reply(key(5), LOOK);
    expect(replyFloodIds([own, friend], { self: SELF, follows: new Set([key(5)]) })).toEqual(new Set());
  });
});

describe('SALAD', () => {
  it('still folds a crowd of word salads drawn from one pool', () => {
    // The observed shape: every key posts a unique permutation of one small
    // vocabulary, plus filler of its own and a rotated payload link.
    const pool = ['feed', 'slow', 'af', 'today', 'vibes', 'random', 'scroll', 'nothing', 'happening', 'dead', 'quiet', 'timeline'];
    const next = rng(7);
    const replies = Array.from({ length: 20 }, (_, i) => {
      const words = [...pool].sort(() => next() - 0.5).slice(0, 7);
      return reply(key(i + 10), `${words.join(' ')} filler${String.fromCharCode(97 + i)}word https://spam.example/${i}`);
    });
    expect(replyFloodIds(replies).size).toBe(replies.length);
  });

  it('leaves a busy inbox of ordinary chatty replies alone', () => {
    // Shaped like a real inbox that used to fold: many authors, every one of
    // them leaning on the same function words, no shared topic vocabulary.
    const replies = [
      'If this is how we start the bull run, I\'m okay to be a sacrifice for it.',
      'So? Endpoints look normal and open. What\'s the real issue here?',
      'It\'s almost on the system now and I\'ll test if it works for me.',
      'Not really, what I like about it is that it is a native app and not a web app.',
      'Well well well, it seems like you are not only on my side but doing a crusade.',
      'Communities are still referenced on my dashboard and here is where in the code I think it is.',
      'The signer flow is always wanting you to open the app to approve, but it should not.',
      'In my client it actually flashes for just a split second, it is one little thing and done.',
      'I have very small needs so it already fulfills the chatting needs with my partner and I.',
      'Thanks, I am deleting this poll and reposting it in the new one with more options.',
      'Is it the name or the actual color that you are talking about here?',
      'It works now, there is nothing anymore that I can find wrong with it.',
      'Hi, not sure what you can do about it but the image upload is failing for me on that server.',
      'Only took me days to be able to load your comment, thanks man for speaking from the heart.',
      'I wonder about starting something like that in my town, it would be a good thing to do.',
      'Look in the channel in the community, I have written quite some things there recently.',
      'Tagging people is hard when you try to scroll the list of people that it is searching.',
      'Can you tell me what tools you used to make this video? I need better video tooling too.',
      'I like to help with testing, just prefer to create an issue for tracking it there.',
      'We found it! We left a note in the box and put it back in its spot for the next one.',
      'Checked and confirmed that it is gone now, the policy names the relay and the nip for it.',
      'What do you think about adding screen sharing to the app at some point in the future?',
    ].map((content, i) => reply(key(i + 40), content));
    expect(replyFloodIds(replies, { self: SELF })).toEqual(new Set());
  });
});
