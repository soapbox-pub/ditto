import { getPow } from 'nostr-tools/nip13';
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent } from 'nostr-tools/pure';
import { afterEach, describe, expect, it } from 'vitest';

import { NSecSignerBtc, hasBtcSigning } from '@/lib/bitcoin-signers';
import { minePow, powDifficulty, setPowDifficulty, signerWithPow } from '@/lib/pow';

const sk = generateSecretKey();
const pubkey = getPublicKey(sk);
const template = (kind = 1, tags: string[][] = [['p', 'ab'.repeat(32)]]) => ({
  kind,
  content: 'hello "world" ✓',
  tags,
  created_at: 1_700_000_000,
});

afterEach(() => {
  setPowDifficulty(undefined);
});

describe('minePow', () => {
  it('adds a nonce tag that gives the signed id the target difficulty', async () => {
    const mined = await minePow(template(), pubkey, 10);
    const event = finalizeEvent(mined, sk);
    expect(verifyEvent(event)).toBe(true);
    expect(getPow(event.id)).toBeGreaterThanOrEqual(10);
    expect(event.tags.at(-1)).toEqual(['nonce', expect.stringMatching(/^\d+$/), '10']);
    expect(event.tags.slice(0, -1)).toEqual(template().tags);
    expect(event.created_at).toBe(template().created_at);
  });

  it('replaces a nonce tag the template already carries', async () => {
    const mined = await minePow(template(1, [['nonce', 'x', '30'], ['t', 'a']]), pubkey, 4);
    expect(mined.tags.filter(([name]) => name === 'nonce')).toHaveLength(1);
    expect(mined.tags[0]).toEqual(['t', 'a']);
  });

  it('leaves the template alone when off', async () => {
    const t = template();
    expect(await minePow(t, pubkey)).toBe(t);
  });
});

describe('difficulty', () => {
  it('is off unless set, and clamps what it is given', () => {
    expect(powDifficulty()).toBe(0);
    setPowDifficulty(12);
    expect(powDifficulty()).toBe(12);
    setPowDifficulty(99);
    expect(powDifficulty()).toBe(32);
    setPowDifficulty(-1);
    expect(powDifficulty()).toBe(0);
  });
});

describe('signerWithPow', () => {
  it('mines published kinds and leaves seals and credentials alone', async () => {
    setPowDifficulty(6);
    const signer = signerWithPow(new NSecSignerBtc(sk), pubkey);
    const note = await signer.signEvent(template(1));
    expect(verifyEvent(note)).toBe(true);
    expect(getPow(note.id)).toBeGreaterThanOrEqual(6);
    for (const kind of [13, 22242, 24242, 27235, 9734]) {
      const event = await signer.signEvent(template(kind));
      expect(event.tags.some(([name]) => name === 'nonce'), `kind ${kind}`).toBe(false);
    }
  });

  it('keeps the rest of the signer working', async () => {
    const signer = signerWithPow(new NSecSignerBtc(sk), pubkey);
    await expect(signer.getPublicKey()).resolves.toBe(pubkey);
    const ct = await signer.nip44!.encrypt(pubkey, 'hi');
    await expect(signer.nip44!.decrypt(pubkey, ct)).resolves.toBe('hi');
    expect(hasBtcSigning(signer)).toBe(true);
  });
});
