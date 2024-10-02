import { bech32 } from '@scure/base';
import { generateSecretKey } from 'nostr-tools';

/**
 * Generate an auth token for the API.
 *
 * Returns a bech32 encoded API token and the SHA-256 hash of the bytes.
 * The token should be presented to the user, but only the hash should be stored in the database.
 */
export async function generateToken(sk = generateSecretKey()): Promise<{ token: `token1${string}`; hash: Uint8Array }> {
  const words = bech32.toWords(sk);
  const token = bech32.encode('token', words);

  const buffer = await crypto.subtle.digest('SHA-256', sk);
  const hash = new Uint8Array(buffer);

  return { token, hash };
}

/**
 * Get the SHA-256 hash of an API token.
 * First decodes from bech32 then hashes the bytes.
 * Used to identify the user in the database by the hash of their token.
 */
export async function getTokenHash(token: `token1${string}`): Promise<Uint8Array> {
  const { bytes: sk } = bech32.decodeToBytes(token);
  const buffer = await crypto.subtle.digest('SHA-256', sk);

  return new Uint8Array(buffer);
}

/**
 * Encrypt a secret key with AES-GCM.
 * This function is used to store the secret key in the database.
 */
export async function encryptSecretKey(sk: Uint8Array, decrypted: Uint8Array): Promise<Uint8Array> {
  const secretKey = await crypto.subtle.importKey('raw', sk, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, secretKey, decrypted);

  return new Uint8Array([...iv, ...new Uint8Array(buffer)]);
}

/**
 * Decrypt a secret key with AES-GCM.
 * This function is used to retrieve the secret key from the database.
 */
export async function decryptSecretKey(sk: Uint8Array, encrypted: Uint8Array): Promise<Uint8Array> {
  const secretKey = await crypto.subtle.importKey('raw', sk, { name: 'AES-GCM' }, false, ['decrypt']);
  const iv = encrypted.slice(0, 12);
  const buffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, secretKey, encrypted.slice(12));

  return new Uint8Array(buffer);
}
