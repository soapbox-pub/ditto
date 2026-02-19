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

      if (identifier.includes('@')) {
        const atIndex = identifier.indexOf('@');
        name = identifier.slice(0, atIndex);
        domain = identifier.slice(atIndex + 1);
      } else {
        // No @ means it's just a domain, look up the default user (_)
        name = '_';
        domain = identifier;
      }

      if (!domain) return null;

      const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`;
      const fetchSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);

      const data = await fetchNostrJson(url, config.corsProxy, fetchSignal);
      if (!data) return null;

      const names = data.names;
      if (!names || typeof names !== 'object') return null;

      const pubkey = (names as Record<string, string>)[name];
      if (typeof pubkey !== 'string') return null;

      return pubkey;
    },
    enabled: !!identifier,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}
