/**
 * NIP-49 password-encrypted secret keys (`ncryptsec1…`). The wire format is
 * nostr-tools' `nip49`; this re-implements it over `scryptAsync`, because the
 * synchronous scrypt there freezes the page for as long as the KDF runs (about
 * a second at log_n 16, and an imported key may name far more).
 */

import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { concatBytes, randomBytes } from '@noble/hashes/utils.js';
import { bech32 } from '@scure/base';

const PREFIX = 'ncryptsec';
const VERSION = 0x02;
const BECH32_LIMIT = 5000;
/** NIP-49's suggested floor; ~64 MiB of scrypt memory. */
export const DEFAULT_LOG_N = 16;
/** A file or paste can name any log_n; past this it's ~16 GiB and would just crash the tab. */
const MAX_LOG_N = 22;
/** Key security byte: 0x02 = "client does not track this data". */
const KSB_UNKNOWN = 0x02;

const NCRYPTSEC_RE = /^ncryptsec1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/;

export function looksLikeNcryptsec(input: string): boolean {
  return NCRYPTSEC_RE.test(input);
}

export class NcryptsecError extends Error {
  constructor(readonly reason: 'malformed' | 'password') {
    super(reason === 'password' ? 'Wrong password' : 'Malformed ncryptsec');
    this.name = 'NcryptsecError';
  }
}

const kdf = (password: string, salt: Uint8Array, logN: number) =>
  // NIP-49 §"Password Unicode Normalization".
  scryptAsync(password.normalize('NFKC'), salt, { N: 2 ** logN, r: 8, p: 1, dkLen: 32, maxmem: 2 ** (logN + 11) });

export async function encryptNcryptsec(sk: Uint8Array, password: string, logN = DEFAULT_LOG_N): Promise<string> {
  const salt = randomBytes(16);
  const nonce = randomBytes(24);
  const aad = Uint8Array.of(KSB_UNKNOWN);
  const key = await kdf(password, salt, logN);
  let ciphertext: Uint8Array;
  try {
    ciphertext = xchacha20poly1305(key, nonce, aad).encrypt(sk);
  } finally {
    // NIP-49: the symmetric key is zeroed after use.
    key.fill(0);
  }
  const payload = concatBytes(Uint8Array.of(VERSION, logN), salt, nonce, aad, ciphertext);
  return bech32.encode(PREFIX, bech32.toWords(payload), BECH32_LIMIT);
}

/** Throws {@link NcryptsecError}: `'password'` when the AEAD rejects, else `'malformed'`. */
export async function decryptNcryptsec(ncryptsec: string, password: string): Promise<Uint8Array> {
  let bytes: Uint8Array;
  try {
    const { prefix, words } = bech32.decode(ncryptsec as `${string}1${string}`, BECH32_LIMIT);
    if (prefix !== PREFIX) throw new Error();
    bytes = bech32.fromWords(words);
  } catch {
    throw new NcryptsecError('malformed');
  }
  // version, log_n, salt(16), nonce(24), ksb, ciphertext(32 + 16 tag)
  if (bytes.length !== 91 || bytes[0] !== VERSION || bytes[1] > MAX_LOG_N) {
    throw new NcryptsecError('malformed');
  }
  const logN = bytes[1];
  const salt = bytes.subarray(2, 18);
  const nonce = bytes.subarray(18, 42);
  const aad = bytes.subarray(42, 43);
  const ciphertext = bytes.subarray(43);
  const key = await kdf(password, salt, logN);
  try {
    return xchacha20poly1305(key, nonce, aad).decrypt(ciphertext);
  } catch {
    throw new NcryptsecError('password');
  } finally {
    key.fill(0);
  }
}
