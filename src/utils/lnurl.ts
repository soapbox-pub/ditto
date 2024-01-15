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

/** Get an LNURL from a lud06 or lud16. */
function getLnurl({ lud06, lud16 }: { lud06?: string; lud16?: string }): string | undefined {
  if (lud06) return lud06;
  if (lud16) {
    const [name, host] = lud16.split('@');
    if (name && host) {
      const url = new URL(`/.well-known/lnurlp/${name}`, `https://${host}`).toString();
      return lnurlEncode(url);
    }
  }
}

export { getLnurl, lnurlDecode, lnurlEncode };
