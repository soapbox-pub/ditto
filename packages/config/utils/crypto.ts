/**
 * Convert an ECDSA private key into a public key.
 * https://stackoverflow.com/a/72153942
 */
export async function getEcdsaPublicKey(
  privateKey: CryptoKey,
  extractable: boolean,
): Promise<CryptoKey> {
  if (privateKey.type !== 'private') {
    throw new Error('Expected a private key.');
  }
  if (privateKey.algorithm.name !== 'ECDSA') {
    throw new Error('Expected a private key with the ECDSA algorithm.');
  }

  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  const keyUsages: KeyUsage[] = ['verify'];

  // Remove the private property from the JWK.
  delete jwk.d;
  jwk.key_ops = keyUsages;
  jwk.ext = extractable;

  return crypto.subtle.importKey('jwk', jwk, privateKey.algorithm, extractable, keyUsages);
}
