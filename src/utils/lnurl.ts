import { bech32 } from '@/deps.ts';

/** Encode a URL to LNURL format. */
function lnurlEncode(url: string): `lnurl1${string}` {
  const data = new TextEncoder().encode(url);
  const words = bech32.toWords(data);
  return bech32.encode('lnurl', words);
}

/** Decode a LNURL into a URL. */
function lnurlDecode(lnurl: string): string {
  const { prefix, words } = bech32.decode(lnurl);
  if (prefix !== 'lnurl') throw new Error('Invalid LNURL');
  const data = new Uint8Array(bech32.fromWords(words));
  return new TextDecoder().decode(data);
}

export { lnurlDecode, lnurlEncode };
