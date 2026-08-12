import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

import { aesGcmDecrypt, decodeKeyMaterial, toBufferSource } from '@/lib/aesGcm';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/**
 * Encrypted file attachments, as proposed for NIP-94 in
 * https://github.com/nostr-protocol/nips/pull/2437 (the same properties NIP-17
 * already defines for kind 15 file messages, lifted into NIP-94 so they work in
 * `imeta` too).
 *
 * The blob on the media server is ciphertext, so the key travels in the event:
 * this buys privacy from the server operator, not from anyone who can read the
 * event. We fetch the ciphertext, decrypt it in the browser, and hand the
 * renderer an object URL.
 *
 * When a file is encrypted, `m` is the MIME type *before* encryption, `x` is
 * the hash of the ciphertext, and `ox` is the hash of the plaintext.
 */
export interface FileEncryption {
  /** `encryption-algorithm` — only `aes-gcm` is specified so far. */
  algorithm: string;
  /** `decryption-key`, hex or base64. */
  key: string;
  /** `decryption-nonce`, hex or base64. */
  nonce: string;
  /** `ox` — SHA-256 of the plaintext. Verified after decryption when present. */
  hash?: string;
  /** `m` — MIME type of the plaintext. */
  mime?: string;
  /** `fallback` sources, encrypted under the same key and nonce. */
  fallbacks?: string[];
}

/** Fields as they appear in an `imeta` tag or in flat NIP-94 tags. */
export interface FileEncryptionFields {
  algorithm?: string;
  key?: string;
  nonce?: string;
  hash?: string;
  mime?: string;
  fallbacks?: string[];
}

/**
 * Build a {@link FileEncryption} from raw tag values, or undefined when the
 * file isn't encrypted. An unsupported algorithm still produces a value —
 * callers must render a placeholder rather than the ciphertext, so they need to
 * tell "not encrypted" apart from "encrypted, but we can't read it".
 */
export function parseFileEncryption(fields: FileEncryptionFields): FileEncryption | undefined {
  const { algorithm, key, nonce } = fields;
  if (!algorithm || !key || !nonce) return undefined;
  return {
    algorithm,
    key,
    nonce,
    hash: fields.hash,
    mime: fields.mime,
    fallbacks: fields.fallbacks?.length ? fields.fallbacks : undefined,
  };
}

/** Whether we can actually decrypt this file. */
export function isSupportedEncryption(encryption: FileEncryption): boolean {
  return encryption.algorithm.toLowerCase() === 'aes-gcm';
}

/**
 * Encryption params for a companion source — a `thumb` or `image` preview.
 *
 * Those are encrypted under the same key and nonce as the file itself, but they
 * are different blobs, so the file's `ox` hash and `m` MIME type don't describe
 * them and must be dropped or verification fails on a perfectly good preview.
 */
export function companionEncryption(encryption: FileEncryption): FileEncryption {
  const { algorithm, key, nonce } = encryption;
  return { algorithm, key, nonce };
}

/** Best-effort MIME from magic bytes, for when the `m` tag is missing. */
function sniffMime(bytes: Uint8Array): string {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x47, 0x49, 0x46)) return 'image/gif';
  if (starts(0x52, 0x49, 0x46, 0x46)) {
    // RIFF container — WEBP or WAV, distinguished by the form type at offset 8.
    if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42) return 'image/webp';
    if (bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56) return 'audio/wav';
  }
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return 'video/mp4';
  if (starts(0x1a, 0x45, 0xdf, 0xa3)) return 'video/webm';
  if (starts(0x4f, 0x67, 0x67, 0x53)) return 'audio/ogg';
  if (starts(0x49, 0x44, 0x33) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (starts(0x25, 0x50, 0x44, 0x46)) return 'application/pdf';
  return 'application/octet-stream';
}

export interface DecryptedFile {
  bytes: Uint8Array;
  /** The plaintext MIME type — the `m` tag when given, else sniffed. */
  mime: string;
}

/**
 * Fetch an encrypted blob and decrypt it.
 *
 * `url` and every entry of `fallbackUrls` are tried in order until one fetch
 * succeeds; they all address the same ciphertext, so a single key works for
 * all of them. Verifies the plaintext SHA-256 against `ox` when the event
 * supplies it, so a swapped blob fails closed rather than rendering.
 *
 * Throws on any failure — bad URL, no reachable source, unsupported algorithm,
 * malformed key material, failed authentication tag, or hash mismatch.
 */
export async function fetchDecryptedFile(
  url: string,
  encryption: FileEncryption,
  opts: { signal?: AbortSignal; fallbackUrls?: string[] } = {},
): Promise<DecryptedFile> {
  if (!isSupportedEncryption(encryption)) {
    throw new Error(`Unsupported encryption algorithm: ${encryption.algorithm}`);
  }

  const key = decodeKeyMaterial(encryption.key);
  const nonce = decodeKeyMaterial(encryption.nonce);
  if (!key || !nonce) throw new Error('Malformed decryption key or nonce');

  // Blob URLs come from untrusted event data — only fetch well-formed HTTPS.
  const candidates = [url, ...(encryption.fallbacks ?? []), ...(opts.fallbackUrls ?? [])]
    .map((candidate) => sanitizeUrl(candidate))
    .filter((candidate): candidate is string => !!candidate);
  if (candidates.length === 0) throw new Error('No fetchable source for encrypted file');

  let ciphertext: Uint8Array | undefined;
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, { signal: opts.signal });
      if (!res.ok) continue;
      ciphertext = new Uint8Array(await res.arrayBuffer());
      break;
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      // Try the next source: a dead host, or a media server without CORS.
    }
  }
  if (!ciphertext) throw new Error('Could not fetch encrypted file');

  const bytes = await aesGcmDecrypt(ciphertext, key, nonce);

  if (encryption.hash && bytesToHex(sha256(bytes)) !== encryption.hash.toLowerCase()) {
    throw new Error('Decrypted file does not match its `ox` hash');
  }

  return { bytes, mime: encryption.mime || sniffMime(bytes) };
}

/**
 * Decrypt a file to an object URL suitable for `<img>` / `<video>` / `<audio>`.
 * The caller owns the URL and must revoke it.
 */
export async function decryptFileToObjectUrl(
  url: string,
  encryption: FileEncryption,
  opts: { signal?: AbortSignal; fallbackUrls?: string[] } = {},
): Promise<{ objectUrl: string; mime: string }> {
  const { bytes, mime } = await fetchDecryptedFile(url, encryption, opts);
  return {
    objectUrl: URL.createObjectURL(new Blob([toBufferSource(bytes)], { type: mime })),
    mime,
  };
}
