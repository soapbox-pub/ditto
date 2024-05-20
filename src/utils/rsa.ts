import * as secp from '@noble/secp256k1';
import { LRUCache } from 'lru-cache';

import { Conf } from '@/config.ts';
import { generateSeededRsa, publicKeyToPem } from '@/deps.ts';

const opts = {
  bits: 2048,
};

const rsaCache = new LRUCache<string, Promise<string>>({ max: 1000 });

async function buildSeed(pubkey: string): Promise<string> {
  const key = await Conf.cryptoKey;
  const data = new TextEncoder().encode(pubkey);
  const signature = await window.crypto.subtle.sign('HMAC', key, data);
  return secp.etc.bytesToHex(new Uint8Array(signature));
}

async function getPublicKeyPem(pubkey: string): Promise<string> {
  const cached = await rsaCache.get(pubkey);
  if (cached) return cached;

  const seed = await buildSeed(pubkey);
  const { publicKey } = await generateSeededRsa(seed, opts);
  const promise = publicKeyToPem(publicKey);

  rsaCache.set(pubkey, promise);
  return promise;
}

export { getPublicKeyPem };
