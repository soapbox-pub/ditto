import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import * as nip49 from 'nostr-tools/nip49';
import { describe, expect, it, vi } from 'vitest';

import { decryptNcryptsec, encryptNcryptsec, looksLikeNcryptsec, NcryptsecError } from '@/lib/ncryptsec';

// The NIP-49 spec's decryption vector (log_n 16, password 'nostr').
const SPEC_NCRYPTSEC =
  'ncryptsec1qgg9947rlpvqu76pj5ecreduf9jxhselq2nae2kghhvd5g7dgjtcxfqtd67p9m0w57lspw8gsq6yphnm8623nsl8xn9j4jdzz84zm3frztj3z7s35vpzmqf6ksu8r89qk5z2zxfmu5gv8th8wclt0h4p';
const SPEC_SK = '3501454135014541350145413501453fefb02227e449e57cf4d3a3ce05378683';
const SK = hexToBytes('11'.repeat(32));

describe('ncryptsec', () => {
  it('decrypts the NIP-49 spec vector', async () => {
    expect(bytesToHex(await decryptNcryptsec(SPEC_NCRYPTSEC, 'nostr'))).toBe(SPEC_SK);
  });

  it('interoperates with nostr-tools in both directions', async () => {
    const ours = await encryptNcryptsec(SK, 'hunter2', 4);
    expect(bytesToHex(nip49.decrypt(ours, 'hunter2'))).toBe(bytesToHex(SK));
    const theirs = nip49.encrypt(SK, 'hunter2', 4);
    expect(bytesToHex(await decryptNcryptsec(theirs, 'hunter2'))).toBe(bytesToHex(SK));
  });

  it('normalizes the password to NFKC', async () => {
    const enc = await encryptNcryptsec(SK, '\u212B', 4); // ANGSTROM SIGN
    expect(bytesToHex(await decryptNcryptsec(enc, '\u00C5'))).toBe(bytesToHex(SK));
  });

  it('tells a wrong password from a malformed string', async () => {
    const enc = await encryptNcryptsec(SK, 'right', 4);
    await expect(decryptNcryptsec(enc, 'wrong')).rejects.toEqual(new NcryptsecError('password'));
    await expect(decryptNcryptsec(enc.slice(0, -4), 'right')).rejects.toEqual(new NcryptsecError('malformed'));
    await expect(decryptNcryptsec('nsec1abc', 'right')).rejects.toEqual(new NcryptsecError('malformed'));
  });

  it('refuses a work factor that would exhaust memory before running it', async () => {
    const enc = nip49.encrypt(SK, 'pw', 4);
    const { bech32 } = await import('@scure/base');
    const bytes = bech32.fromWords(bech32.decode(enc as `${string}1${string}`, 5000).words);
    bytes[1] = 30;
    const forged = bech32.encode('ncryptsec', bech32.toWords(bytes), 5000);
    await expect(decryptNcryptsec(forged, 'pw')).rejects.toEqual(new NcryptsecError('malformed'));
  });

  it('refuses log_n 21 (2 GiB of scrypt), which a phone WebView can\'t hold', async () => {
    const enc = nip49.encrypt(SK, 'pw', 4);
    const { bech32 } = await import('@scure/base');
    const bytes = bech32.fromWords(bech32.decode(enc as `${string}1${string}`, 5000).words);
    bytes[1] = 21;
    const forged = bech32.encode('ncryptsec', bech32.toWords(bytes), 5000);

    vi.resetModules();
    const scryptAsync = vi.fn(() => Promise.reject(new Error('ran scrypt')));
    vi.doMock('@noble/hashes/scrypt.js', () => ({ scryptAsync }));
    try {
      const fresh = await import('@/lib/ncryptsec');
      await expect(fresh.decryptNcryptsec(forged, 'pw')).rejects.toMatchObject({ reason: 'malformed' });
      expect(scryptAsync).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock('@noble/hashes/scrypt.js');
    }
  });

  it('recognizes the prefix', () => {
    expect(looksLikeNcryptsec(SPEC_NCRYPTSEC)).toBe(true);
    expect(looksLikeNcryptsec('nsec1qqq')).toBe(false);
  });
});
