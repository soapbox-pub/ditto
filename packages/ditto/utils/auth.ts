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
