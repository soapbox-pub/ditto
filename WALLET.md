# Nostr-to-Bitcoin Wallet

This document explains how the application derives a Bitcoin Taproot address from a Nostr public key, enabling every Nostr identity to function as a Bitcoin wallet.

## Why This Works

Nostr and Bitcoin Taproot (BIP-341) share the exact same cryptographic primitives:

| Property | Nostr | Bitcoin Taproot |
|---|---|---|
| Curve | secp256k1 | secp256k1 |
| Signature scheme | Schnorr (BIP-340) | Schnorr (BIP-340) |
| Public key format | 32-byte x-only | 32-byte x-only |

Because the key formats are byte-for-byte identical, a Nostr public key can be used **directly** as a Taproot internal key with no mathematical conversion, hashing, or derivation.

## Derivation Algorithm

### Step 1 -- Parse the Public Key

A Nostr pubkey is a 64-character hex string representing 32 bytes. Convert it to a byte buffer:

```
pubkey (hex): e7a2e3b5f1c8d4a6...  (64 hex chars = 32 bytes)
              ↓
pubkeyBuffer: <Buffer e7 a2 e3 b5 f1 c8 d4 a6 ...>
```

### Step 2 -- Compute the Taproot Output Key

Bitcoin Taproot (BIP-341) defines a "tweaking" process for the internal key:

```
t       = taggedHash("TapTweak", internalPubkey)
Q       = P + t*G          (where P = internal key, G = generator point)
```

When there is no script tree (key-path-only spend), only the internal key participates in the tweak. The result `Q` is the **output key** that appears on-chain.

This step is handled internally by `bitcoinjs-lib`'s `payments.p2tr()`.

### Step 3 -- Encode as a bech32m Address

The 32-byte output key `Q` is encoded with:

- Witness version: **1** (Taproot)
- Encoding: **bech32m** (BIP-350)
- Human-readable prefix: `bc` (mainnet)

The resulting address always starts with `bc1p`.

### Implementation

```typescript
import * as bitcoin from 'bitcoinjs-lib';

function nostrPubkeyToBitcoinAddress(pubkeyHex: string): string {
  const pubkeyBuffer = Buffer.from(pubkeyHex, 'hex');

  const { address } = bitcoin.payments.p2tr({
    internalPubkey: pubkeyBuffer,
    network: bitcoin.networks.bitcoin,
  });

  return address; // "bc1p..."
}
```

### Example

```
Nostr pubkey (hex):  82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2
Bitcoin address:     bc1pw0qkazw9twl4snwxal6v90djv3c8cph4s0w7rvtyp3k95rll3cqqhv4cn8
```

## Dependencies

| Package | Role |
|---|---|
| `bitcoinjs-lib` | P2TR address generation, PSBT construction |
| `@bitcoinerlab/secp256k1` | secp256k1 ECC operations (Schnorr, key tweaking) |
| `buffer` | Node.js Buffer polyfill for the browser |

The ECC library must be initialized once at startup:

```typescript
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
bitcoin.initEccLib(ecc);
```

## Balance API

Balance data is fetched from the public Blockstream Esplora API:

```
GET https://blockstream.info/api/address/{address}
```

Returns confirmed and mempool stats (funded/spent sums, transaction counts). The wallet page polls this endpoint every 30 seconds.

## Security Considerations

- The same private key (nsec in Nostr) controls both the Nostr identity and the Bitcoin funds at the derived address.
- Extension and bunker logins do not expose the raw private key, so spending Bitcoin from those login types requires exporting the key or using a compatible wallet application.
- This is a **single-key** Taproot address with no HD derivation (no BIP-32/BIP-44 path). Every Nostr keypair maps to exactly one Bitcoin address.
- Users should ensure they have secure backups of their Nostr private key before receiving Bitcoin at the derived address.

## References

- [BIP-340: Schnorr Signatures for secp256k1](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki)
- [BIP-341: Taproot (SegWit v1)](https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki)
- [BIP-350: Bech32m](https://github.com/bitcoin/bips/blob/master/bip-0350.mediawiki)
- [NIP-01: Basic Protocol](https://github.com/nostr-protocol/nips/blob/master/01.md) (defines secp256k1 x-only keys for Nostr)
