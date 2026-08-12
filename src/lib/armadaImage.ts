import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { aesGcmDecrypt, toBufferSource } from '@/lib/aesGcm';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import type { ArmadaImagePointer } from '@/lib/armadaInvite';

/**
 * Concord encrypted community images (CORD-02 §6). An icon never touches a
 * media server in plaintext: it's AES-256-GCM encrypted under a fresh random
 * key and uploaded as an ordinary blob; the bundle carries only the pointer
 * `{ url, key, nonce, hash }`. We fetch the ciphertext, decrypt, and verify
 * the plaintext SHA-256 so a swapped blob fails closed.
 */

/** Best-effort mime from magic bytes (display only). */
function sniffImageMime(bytes: Uint8Array): string {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp';
  }
  if (bytes.length >= 5 && bytes[0] === 0x3c) return 'image/svg+xml'; // '<' — svg-ish
  return 'application/octet-stream';
}

/**
 * Fetch + decrypt an encrypted community image pointer to an object URL.
 * Verifies the plaintext SHA-256 against `pointer.hash`; the caller must
 * revoke the returned URL on unmount. Returns undefined on any failure
 * (bad URL, fetch error, decrypt error, integrity mismatch).
 */
export async function decryptArmadaImage(
  pointer: ArmadaImagePointer,
  signal?: AbortSignal,
): Promise<string | undefined> {
  // The blob URL comes from untrusted event data — only fetch well-formed HTTPS.
  const url = sanitizeUrl(pointer.url);
  if (!url) return undefined;

  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return undefined;
    const ciphertext = new Uint8Array(await res.arrayBuffer());

    const plaintext = await aesGcmDecrypt(
      ciphertext,
      hexToBytes(pointer.key),
      hexToBytes(pointer.nonce),
    );

    if (bytesToHex(sha256(plaintext)) !== pointer.hash.toLowerCase()) {
      return undefined; // integrity check failed — a swapped blob
    }
    const mime = sniffImageMime(plaintext);
    return URL.createObjectURL(new Blob([toBufferSource(plaintext)], { type: mime }));
  } catch {
    return undefined;
  }
}
