import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

import { decodeKeyMaterial } from '@/lib/aesGcm';
import {
  companionEncryption,
  fetchDecryptedFile,
  FileTooLargeError,
  isSupportedEncryption,
  MAX_DECRYPT_BYTES,
  parseFileEncryption,
  type FileEncryption,
} from '@/lib/encryptedFile';

const URL_A = 'https://blossom.example/abc';

/** Encrypt `plaintext` under a fresh key, as an uploader would. */
async function encrypt(plaintext: Uint8Array) {
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext),
  );
  return { keyBytes, nonce, ciphertext };
}

/** Stub `fetch` with a fixed body, optionally lying about Content-Length. */
function stubFetch(body: Uint8Array, opts: { contentLength?: string | null } = {}) {
  const declared = opts.contentLength === undefined ? String(body.byteLength) : opts.contentLength;
  const headers = new Headers(declared === null ? {} : { 'content-length': declared });

  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    headers,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        // Deliver in chunks so the reader path is exercised.
        for (let i = 0; i < body.byteLength; i += 8) {
          controller.enqueue(body.subarray(i, Math.min(i + 8, body.byteLength)));
        }
        controller.close();
      },
    }),
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('decodeKeyMaterial', () => {
  const bytes = Uint8Array.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0x11]);

  it('decodes hex', () => {
    expect(decodeKeyMaterial('deadbeef0011')).toEqual(bytes);
  });

  it('decodes hex case-insensitively', () => {
    expect(decodeKeyMaterial('DEADBEEF0011')).toEqual(bytes);
  });

  it('decodes base64', () => {
    expect(decodeKeyMaterial(btoa(String.fromCharCode(...bytes)))).toEqual(bytes);
  });

  it('decodes base64url', () => {
    // 0xfb 0xff encodes as "+/8" in standard base64, "-_8" in base64url.
    const raw = Uint8Array.from([0xfb, 0xff, 0xfc]);
    expect(decodeKeyMaterial('-_/8'.replace('/', '_'))).toEqual(raw);
  });

  it('ignores surrounding whitespace', () => {
    expect(decodeKeyMaterial('  deadbeef0011\n')).toEqual(bytes);
  });

  it('rejects empty input', () => {
    expect(decodeKeyMaterial('')).toBeUndefined();
    expect(decodeKeyMaterial('   ')).toBeUndefined();
  });

  it('treats an odd-length hex-looking string as base64, not hex', () => {
    // "abc" is hex-ish but can't be bytes; base64 is the only sane reading.
    expect(decodeKeyMaterial('abc')).toEqual(Uint8Array.from([0x69, 0xb7]));
  });

  it('round-trips a real 32-byte key through both encodings', () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    expect(decodeKeyMaterial(bytesToHex(key))).toEqual(key);
    expect(decodeKeyMaterial(btoa(String.fromCharCode(...key)))).toEqual(key);
  });
});

describe('parseFileEncryption', () => {
  it('returns undefined when the file is not encrypted', () => {
    expect(parseFileEncryption({})).toBeUndefined();
  });

  it('returns undefined when any of the three required fields is missing', () => {
    expect(parseFileEncryption({ algorithm: 'aes-gcm', key: 'aa' })).toBeUndefined();
    expect(parseFileEncryption({ algorithm: 'aes-gcm', nonce: 'bb' })).toBeUndefined();
    expect(parseFileEncryption({ key: 'aa', nonce: 'bb' })).toBeUndefined();
  });

  it('still returns a value for an unsupported algorithm', () => {
    // Callers must be able to tell "not encrypted" from "encrypted, unreadable"
    // — otherwise they'd render the ciphertext URL.
    const enc = parseFileEncryption({ algorithm: 'chacha20-poly1305', key: 'aa', nonce: 'bb' });
    expect(enc).toBeDefined();
    expect(isSupportedEncryption(enc!)).toBe(false);
  });

  it('accepts aes-gcm case-insensitively', () => {
    const enc = parseFileEncryption({ algorithm: 'AES-GCM', key: 'aa', nonce: 'bb' })!;
    expect(isSupportedEncryption(enc)).toBe(true);
  });

  it('drops an empty fallback list', () => {
    const enc = parseFileEncryption({ algorithm: 'aes-gcm', key: 'aa', nonce: 'bb', fallbacks: [] })!;
    expect(enc.fallbacks).toBeUndefined();
  });
});

describe('companionEncryption', () => {
  const full: FileEncryption = {
    algorithm: 'aes-gcm',
    key: 'aa',
    nonce: 'bb',
    hash: 'deadbeef',
    mime: 'video/mp4',
    fallbacks: ['https://other.example/abc'],
  };

  it('keeps the key and nonce', () => {
    const companion = companionEncryption(full);
    expect(companion.algorithm).toBe('aes-gcm');
    expect(companion.key).toBe('aa');
    expect(companion.nonce).toBe('bb');
  });

  it('drops ox and m, which describe the file and not its thumbnail', () => {
    const companion = companionEncryption(full);
    expect(companion.hash).toBeUndefined();
    expect(companion.mime).toBeUndefined();
  });

  it('drops fallbacks, which are sources for the file and not the thumbnail', () => {
    expect(companionEncryption(full).fallbacks).toBeUndefined();
  });
});

describe('fetchDecryptedFile', () => {
  const plaintext = new TextEncoder().encode('the quick brown fox '.repeat(20));

  it('decrypts and reports the declared MIME type', async () => {
    const { keyBytes, nonce, ciphertext } = await encrypt(plaintext);
    stubFetch(ciphertext);

    const result = await fetchDecryptedFile(URL_A, {
      algorithm: 'aes-gcm',
      key: bytesToHex(keyBytes),
      nonce: bytesToHex(nonce),
      mime: 'text/plain',
    });

    expect(result.bytes).toEqual(plaintext);
    expect(result.mime).toBe('text/plain');
  });

  it('accepts base64 key material', async () => {
    const { keyBytes, nonce, ciphertext } = await encrypt(plaintext);
    stubFetch(ciphertext);

    const result = await fetchDecryptedFile(URL_A, {
      algorithm: 'aes-gcm',
      key: btoa(String.fromCharCode(...keyBytes)),
      nonce: btoa(String.fromCharCode(...nonce)),
    });

    expect(result.bytes).toEqual(plaintext);
  });

  it('verifies the plaintext against ox', async () => {
    const { keyBytes, nonce, ciphertext } = await encrypt(plaintext);
    stubFetch(ciphertext);

    await expect(fetchDecryptedFile(URL_A, {
      algorithm: 'aes-gcm',
      key: bytesToHex(keyBytes),
      nonce: bytesToHex(nonce),
      hash: bytesToHex(sha256(plaintext)),
    })).resolves.toBeDefined();
  });

  it('fails closed when the plaintext does not match ox', async () => {
    const { keyBytes, nonce, ciphertext } = await encrypt(plaintext);
    stubFetch(ciphertext);

    await expect(fetchDecryptedFile(URL_A, {
      algorithm: 'aes-gcm',
      key: bytesToHex(keyBytes),
      nonce: bytesToHex(nonce),
      hash: 'ff'.repeat(32),
    })).rejects.toThrow(/ox/);
  });

  it('rejects tampered ciphertext via the GCM tag', async () => {
    const { keyBytes, nonce, ciphertext } = await encrypt(plaintext);
    ciphertext[4] ^= 1;
    stubFetch(ciphertext);

    await expect(fetchDecryptedFile(URL_A, {
      algorithm: 'aes-gcm',
      key: bytesToHex(keyBytes),
      nonce: bytesToHex(nonce),
    })).rejects.toThrow();
  });

  it('refuses an unsupported algorithm without fetching', async () => {
    stubFetch(new Uint8Array(4));

    await expect(fetchDecryptedFile(URL_A, {
      algorithm: 'chacha20-poly1305',
      key: 'aa',
      nonce: 'bb',
    })).rejects.toThrow(/Unsupported/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses malformed key material without fetching', async () => {
    stubFetch(new Uint8Array(4));

    await expect(fetchDecryptedFile(URL_A, {
      algorithm: 'aes-gcm',
      key: '',
      nonce: 'bb',
    })).rejects.toThrow(/Malformed|No fetchable/);
  });

  it('refuses a non-HTTPS source', async () => {
    stubFetch(new Uint8Array(4));

    await expect(fetchDecryptedFile('http://insecure.example/abc', {
      algorithm: 'aes-gcm',
      key: 'aa'.repeat(16),
      nonce: 'bb'.repeat(6),
    })).rejects.toThrow(/No fetchable source/);
    expect(fetch).not.toHaveBeenCalled();
  });

  describe('size cap', () => {
    it('rejects on Content-Length before reading the body', async () => {
      const { keyBytes, nonce, ciphertext } = await encrypt(plaintext);
      stubFetch(ciphertext, { contentLength: String(MAX_DECRYPT_BYTES + 1) });

      await expect(fetchDecryptedFile(URL_A, {
        algorithm: 'aes-gcm',
        key: bytesToHex(keyBytes),
        nonce: bytesToHex(nonce),
      })).rejects.toBeInstanceOf(FileTooLargeError);
    });

    it('reports the declared size on the error', async () => {
      const { keyBytes, nonce, ciphertext } = await encrypt(plaintext);
      stubFetch(ciphertext, { contentLength: '999999999' });

      await expect(fetchDecryptedFile(URL_A, {
        algorithm: 'aes-gcm',
        key: bytesToHex(keyBytes),
        nonce: bytesToHex(nonce),
      })).rejects.toMatchObject({ byteSize: 999999999 });
    });

    it('honours a caller-supplied maxBytes', async () => {
      const { keyBytes, nonce, ciphertext } = await encrypt(plaintext);
      stubFetch(ciphertext);

      await expect(fetchDecryptedFile(URL_A, {
        algorithm: 'aes-gcm',
        key: bytesToHex(keyBytes),
        nonce: bytesToHex(nonce),
      }, { maxBytes: 8 })).rejects.toBeInstanceOf(FileTooLargeError);
    });

    it('catches a server that lies about Content-Length', async () => {
      const { keyBytes, nonce, ciphertext } = await encrypt(plaintext);
      // Claims to be tiny, actually sends the whole body.
      stubFetch(ciphertext, { contentLength: '8' });

      await expect(fetchDecryptedFile(URL_A, {
        algorithm: 'aes-gcm',
        key: bytesToHex(keyBytes),
        nonce: bytesToHex(nonce),
      })).rejects.toBeInstanceOf(FileTooLargeError);
    });

    it('caps a body with no Content-Length at all', async () => {
      const { keyBytes, nonce, ciphertext } = await encrypt(plaintext);
      stubFetch(ciphertext, { contentLength: null });

      await expect(fetchDecryptedFile(URL_A, {
        algorithm: 'aes-gcm',
        key: bytesToHex(keyBytes),
        nonce: bytesToHex(nonce),
      }, { maxBytes: 8 })).rejects.toBeInstanceOf(FileTooLargeError);
    });

    it('decrypts a chunked body with no Content-Length', async () => {
      const { keyBytes, nonce, ciphertext } = await encrypt(plaintext);
      stubFetch(ciphertext, { contentLength: null });

      const result = await fetchDecryptedFile(URL_A, {
        algorithm: 'aes-gcm',
        key: bytesToHex(keyBytes),
        nonce: bytesToHex(nonce),
      });

      expect(result.bytes).toEqual(plaintext);
    });

    it('lets an explicit override through', async () => {
      const { keyBytes, nonce, ciphertext } = await encrypt(plaintext);
      stubFetch(ciphertext);

      const result = await fetchDecryptedFile(URL_A, {
        algorithm: 'aes-gcm',
        key: bytesToHex(keyBytes),
        nonce: bytesToHex(nonce),
      }, { maxBytes: Number.POSITIVE_INFINITY });

      expect(result.bytes).toEqual(plaintext);
    });
  });
});
