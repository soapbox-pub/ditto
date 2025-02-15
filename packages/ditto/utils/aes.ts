/** Encrypt data with AES-GCM and a secret key. */
export async function aesEncrypt(sk: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  const secretKey = await crypto.subtle.importKey('raw', sk, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, secretKey, plaintext);

  return new Uint8Array([...iv, ...new Uint8Array(buffer)]);
}

/** Decrypt data with AES-GCM and a secret key. */
export async function aesDecrypt(sk: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array> {
  const secretKey = await crypto.subtle.importKey('raw', sk, { name: 'AES-GCM' }, false, ['decrypt']);
  const iv = ciphertext.slice(0, 12);
  const buffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, secretKey, ciphertext.slice(12));

  return new Uint8Array(buffer);
}
