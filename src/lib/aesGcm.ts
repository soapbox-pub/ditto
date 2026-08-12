import { hexToBytes } from '@noble/hashes/utils';

/**
 * AES-GCM primitives shared by the features that fetch ciphertext from a media
 * server and decrypt it in the browser (NIP-94 encrypted files, Concord
 * community images).
 */

/** Copy into a fresh ArrayBuffer-backed view — WebCrypto wants a BufferSource. */
export function toBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const ab = new ArrayBuffer(bytes.byteLength);
  const view = new Uint8Array(ab);
  view.set(bytes);
  return view;
}

/** Decode a base64 (or base64url) string into bytes. */
function base64ToBytes(value: string): Uint8Array | undefined {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return undefined;
  }
}

/**
 * Decode a key or nonce supplied as an event tag value.
 *
 * Neither NIP-17 nor the NIP-94 encryption extension pins an encoding for
 * `decryption-key` / `decryption-nonce`, and implementations in the wild use
 * both hex and base64, so accept either. An all-hex string of even length is
 * read as hex; anything else is tried as base64.
 */
export function decodeKeyMaterial(value: string): Uint8Array | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^[0-9a-f]+$/i.test(trimmed) && trimmed.length % 2 === 0) {
    try {
      return hexToBytes(trimmed.toLowerCase());
    } catch {
      return undefined;
    }
  }
  return base64ToBytes(trimmed);
}

/**
 * Decrypt AES-GCM ciphertext (with the authentication tag appended, as
 * WebCrypto produces it). Throws if the key/nonce are malformed or the tag
 * doesn't verify.
 */
export async function aesGcmDecrypt(
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toBufferSource(key),
    'AES-GCM',
    false,
    ['decrypt'],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toBufferSource(nonce) },
    cryptoKey,
    toBufferSource(ciphertext),
  );
  return new Uint8Array(plaintext);
}
