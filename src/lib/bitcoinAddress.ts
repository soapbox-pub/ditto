/**
 * Lightweight Bitcoin address validation.
 *
 * Mirrors the address forms accepted by `@scure/btc-signer`'s
 * `Address(NETWORK).decode` for mainnet — P2PKH (`1…`), P2SH (`3…`),
 * P2WPKH/P2WSH (`bc1q…`, segwit v0), and P2TR (`bc1p…`, segwit v1) — but is
 * built on `@scure/base` + `@noble/hashes` only, both of which are already
 * in the entry bundle via `nostr-tools`. This keeps address validation off
 * the heavy ~150 kB `@scure/btc-signer` signing stack so initial-load code
 * (campaign parsing, payment-target validation) stays light.
 *
 * Validation-only: a rare false positive would surface as a caught error at
 * transaction-build time (the heavy stack re-decodes the address before any
 * funds move); a false negative would block a valid address. The rules below
 * follow BIP173/BIP350 exactly, same as `@scure/btc-signer`.
 *
 * `@/lib/bitcoin` re-exports {@link validateBitcoinAddress} so wallet code
 * can keep importing from one place.
 */
import { base58check as createBase58check, bech32, bech32m } from '@scure/base';
import { sha256 } from '@noble/hashes/sha256';

const base58check = createBase58check(sha256);

/** Mainnet base58 version bytes (matches `@scure/btc-signer` NETWORK). */
const P2PKH_VERSION = 0x00;
const P2SH_VERSION = 0x05;

/** Mainnet bech32 HRP. */
const HRP = 'bc';

/** Validate a bech32/bech32m segwit address (v0 or v1/taproot, mainnet). */
function validateSegwitAddress(address: string): boolean {
  // BIP173: address is 14–74 chars, program 2–40 bytes; the specific forms
  // we accept (like @scure/btc-signer) are v0 with 20- or 32-byte programs
  // and v1 (taproot) with a 32-byte program.
  type Bech32String = `${Lowercase<string>}1${string}`;

  // Witness v0 uses bech32; v1+ uses bech32m (BIP350). Try both and let the
  // decoded version decide which checksum variant was required.
  for (const [codec, validVersion] of [[bech32, 0], [bech32m, 1]] as const) {
    try {
      const { prefix, words } = codec.decode(address as Bech32String, 90);
      if (prefix !== HRP) continue;
      const version = words[0];
      if (version !== validVersion) continue;
      const program = codec.fromWords(words.slice(1));
      if (version === 0) return program.length === 20 || program.length === 32;
      return program.length === 32; // taproot
    } catch {
      // Wrong checksum variant or malformed — try the other codec.
    }
  }
  return false;
}

/** Validate a legacy base58check address (P2PKH / P2SH, mainnet). */
function validateBase58Address(address: string): boolean {
  try {
    const data = base58check.decode(address);
    if (data.length !== 21) return false;
    return data[0] === P2PKH_VERSION || data[0] === P2SH_VERSION;
  } catch {
    return false;
  }
}

/**
 * Validate a Bitcoin address (mainnet). Returns `true` if the address has a
 * valid format and checksum, `false` otherwise.
 */
export function validateBitcoinAddress(address: string): boolean {
  if (typeof address !== 'string' || !address) return false;

  // No trimming — like the heavy decoder, reject addresses with stray
  // whitespace. Callers trim user input before validating.
  const lower = address.toLowerCase();
  if (lower.startsWith(`${HRP}1`)) {
    return validateSegwitAddress(address);
  }
  return validateBase58Address(address);
}
