import { LNURL } from '@/deps.ts';

/** Get an LNURL from a lud06 or lud16. */
function getLnurl({ lud06, lud16 }: { lud06?: string; lud16?: string }, limit?: number): string | undefined {
  if (lud06) return lud06;
  if (lud16) {
    const [name, host] = lud16.split('@');
    if (name && host) {
      const url = new URL(`/.well-known/lnurlp/${name}`, `https://${host}`);
      return LNURL.encode(url, limit);
    }
  }
}

export { getLnurl };
