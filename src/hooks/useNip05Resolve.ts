import { useQuery } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';

/**
 * Fetches a NIP-05 nostr.json URL. Tries direct first, falls back to CORS proxy.
 */
async function fetchNostrJson(url: string, corsProxy: string, signal: AbortSignal): Promise<Record<string, unknown> | null> {
  // Try direct fetch first (works when server has proper CORS headers)
  try {
    const response = await fetch(url, { signal });
    if (response.ok) {
      return await response.json();
    }
  } catch {
    // CORS or network error — fall through to proxy
  }

  // Fallback: CORS proxy
  try {
    const response = await fetch(corsProxy.replace('{href}', encodeURIComponent(url)), { signal });
    if (response.ok) {
      return await response.json();
    }
  } catch {
    // Both failed
  }

  return null;
}

/**
 * Resolves a NIP-05 identifier to a pubkey by fetching the domain's
 * .well-known/nostr.json endpoint.
 * 
 * Accepts formats:
 * - `user@domain.com` → looks up `user` at `domain.com`
 * - `domain.com` (no @) → looks up `_` (default user) at `domain.com`
 */
export function useNip05Resolve(identifier: string | undefined) {
  const { config } = useAppContext();
  return useQuery<string | null>({
    queryKey: ['nip05-resolve', identifier],
    queryFn: async ({ signal }) => {
      if (!identifier) return null;

      let name: string;
      let domain: string;

      // Strip leading @ (e.g. "@chad@chadwick.site" from URLs like /@chad@chadwick.site)
      const cleaned = identifier.startsWith('@') ? identifier.slice(1) : identifier;

      if (cleaned.includes('@')) {
        const atIndex = cleaned.indexOf('@');
        name = cleaned.slice(0, atIndex).toLowerCase();
        domain = cleaned.slice(atIndex + 1);
      } else {
        // No @ means it's just a domain, look up the default user (_)
        name = '_';
        domain = cleaned;
      }

      if (!domain) return null;

      const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`;
      const fetchSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);

      const data = await fetchNostrJson(url, config.corsProxy, fetchSignal);
      if (!data) return null;

      const names = data.names;
      if (!names || typeof names !== 'object') return null;

      // Look up by lowercase name; fall back to case-insensitive search
      // in case the server returns names in non-standard casing
      const namesRecord = names as Record<string, string>;
      let pubkey: string | undefined = namesRecord[name];
      if (typeof pubkey !== 'string') {
        const entry = Object.entries(namesRecord).find(([k]) => k.toLowerCase() === name);
        pubkey = entry?.[1];
      }
      if (typeof pubkey !== 'string') return null;

      return pubkey;
    },
    enabled: !!identifier,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}
