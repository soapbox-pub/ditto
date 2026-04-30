---
name: nostr-encryption
description: Encrypt and decrypt content for Nostr direct messages, gift wraps, or any feature that needs NIP-44 (or legacy NIP-04) ciphertext, using the logged-in user's signer.
---

# Nostr Encryption and Decryption

The logged-in user exposes a `signer` object that matches the NIP-07 signer interface. The signer handles all cryptographic operations internally — including ECDH, conversation-key derivation, and AEAD — so your code never touches a private key.

**Always use the signer interface for encryption. Never ask the user for their private key, and never derive a shared secret yourself.**

## NIP-44 (preferred)

NIP-44 is the modern, authenticated encryption scheme used for DMs (NIP-17), gift wraps (NIP-59), and most new encrypted payloads.

```ts
import { useCurrentUser } from "@/hooks/useCurrentUser";

function useEncryptedNote() {
  const { user } = useCurrentUser();

  if (!user) throw new Error("Must be logged in");

  // Guard: older signers may not support NIP-44 yet.
  if (!user.signer.nip44) {
    throw new Error(
      "Please upgrade your signer extension to a version that supports NIP-44 encryption",
    );
  }

  // Encrypt a message to a recipient (use your own pubkey to encrypt to self).
  const ciphertext = await user.signer.nip44.encrypt(
    recipientPubkey,
    "hello world",
  );

  // Decrypt a message from a sender (use the *other party's* pubkey).
  const plaintext = await user.signer.nip44.decrypt(senderPubkey, ciphertext);

  return plaintext;
}
```

### Key points

- `encrypt(peerPubkey, plaintext)` — `peerPubkey` is the **other party's** hex public key. For self-encryption (notes, backups), pass `user.pubkey`.
- `decrypt(peerPubkey, ciphertext)` — `peerPubkey` is the author of the ciphertext you're decrypting (for an incoming DM, this is the sender's pubkey).
- Both methods are async and may throw if the signer rejects the request or the ciphertext is malformed. Wrap calls in `try/catch`.
- The signer handles conversation-key caching; repeated calls for the same peer are cheap.

## NIP-04 (legacy)

NIP-04 is only needed when interacting with older clients that haven't adopted NIP-44. The API mirrors NIP-44:

```ts
if (!user.signer.nip04) {
  throw new Error("Signer does not support NIP-04");
}

const ciphertext = await user.signer.nip04.encrypt(peerPubkey, plaintext);
const plaintext = await user.signer.nip04.decrypt(peerPubkey, ciphertext);
```

Prefer NIP-44 for anything new. Only fall back to NIP-04 when a spec or peer explicitly requires it.

## Patterns

### Encrypt-to-self (drafts, private notes)

```ts
const ciphertext = await user.signer.nip44.encrypt(user.pubkey, draft);
createEvent({ kind: 30078, content: ciphertext, tags: [["d", "my-draft"]] });
```

### Decrypt an incoming DM (NIP-17 / NIP-59)

For gift-wrapped DMs, you'll typically decrypt the outer wrap, then the inner seal, then read the rumor's content. Each decryption uses the *sender* of that specific layer as the peer pubkey.

### Guarding the UI

Always check `user.signer.nip44` (or `nip04`) before calling encryption methods. Remote signers and older browser extensions may not implement every interface, and catching the missing-capability case lets you show a useful message ("Please upgrade your signer") instead of an unhandled promise rejection.
