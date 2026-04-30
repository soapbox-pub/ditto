# Bitcoin PSBT Signing for Nostr Signers

This document specifies how Nostr signers (NIP-07 browser extensions and NIP-46 remote signers) can support signing Bitcoin Partially Signed Bitcoin Transactions (PSBTs).

## Motivation

Nostr and Bitcoin Taproot (BIP-341) share identical cryptographic primitives: secp256k1 with 32-byte x-only public keys and BIP-340 Schnorr signatures. This means a Nostr private key can directly sign Bitcoin Taproot transactions without any key conversion. To enable this, Nostr signers need a method to sign PSBTs.

## `signPsbt` Method

### NIP-07 (Browser Extensions)

Extensions that support Bitcoin signing MUST expose a `signPsbt` method on the `window.nostr` object:

```typescript
window.nostr.signPsbt(psbtHex: string): Promise<string>
```

**Parameters:**

- `psbtHex` — Hex-encoded PSBT (BIP-174/BIP-370).

**Returns:**

- A hex-encoded PSBT with Taproot key-path signatures (`tapKeySig`) added to matching inputs.

### NIP-46 (Remote Signers)

Remote signers that support Bitcoin signing MUST handle the `sign_psbt` RPC method:

```
method: "sign_psbt"
params: ["<hex-encoded PSBT>"]
result: "<hex-encoded signed PSBT>"
```

The method follows the same NIP-46 request/response pattern as `sign_event`. If the signer does not support this method, it MUST return an error.

## Signer Behavior

When a signer receives a PSBT to sign, it MUST:

1. Decode the PSBT from hex.
2. For each input, check if `tapInternalKey` is present.
3. Compare the input's `tapInternalKey` against the signer's own 32-byte x-only public key.
4. For each matching input:
   a. Compute the BIP-341 tweak: `t = taggedHash("TapTweak", tapInternalKey)`.
   b. Tweak the private key: apply `t` to the secret key with y-parity correction (negate the key if the corresponding public key has an odd y-coordinate, then add the tweak scalar modulo the curve order).
   c. Compute the BIP-341 sighash for the input.
   d. Produce a BIP-340 Schnorr signature over the sighash using the tweaked key.
   e. Set `tapKeySig` on the input.
5. Return the PSBT with signatures added. The signer MUST NOT finalize or extract the transaction.

Inputs whose `tapInternalKey` does not match the signer's key MUST be left unchanged.

## Security Considerations

- Signers SHOULD display a confirmation dialog showing the transaction outputs, amounts, and fees before signing.
- Signers SHOULD reject PSBTs that do not contain any inputs matching the signer's key.
- The PSBT format (BIP-174) carries all information needed for the signer to verify what is being signed, including input amounts (`witnessUtxo`) and output destinations.

## Capability Detection

### NIP-07

Clients SHOULD check for the presence of `signPsbt` before calling it:

```typescript
if (typeof window.nostr?.signPsbt === 'function') {
  const signedHex = await window.nostr.signPsbt(unsignedPsbtHex);
}
```

### NIP-46

Clients SHOULD handle errors gracefully when the remote signer does not support `sign_psbt`. If the signer returns an error for an unknown method, the client should inform the user that their signer does not support Bitcoin signing.

## References

- [BIP-174: Partially Signed Bitcoin Transaction Format](https://github.com/bitcoin/bips/blob/master/bip-0174.mediawiki)
- [BIP-340: Schnorr Signatures for secp256k1](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki)
- [BIP-341: Taproot (SegWit v1 Spending Rules)](https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki)
- [BIP-370: PSBT Version 2](https://github.com/bitcoin/bips/blob/master/bip-0370.mediawiki)
- [NIP-07: `window.nostr` capability for web browsers](https://github.com/nostr-protocol/nips/blob/master/07.md)
- [NIP-46: Nostr Remote Signing](https://github.com/nostr-protocol/nips/blob/master/46.md)
