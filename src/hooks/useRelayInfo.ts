import { useQuery } from '@tanstack/react-query';

export interface RelayInfoDocument {
  name?: string;
  description?: string;
  icon?: string;
  banner?: string;
  pubkey?: string;
  contact?: string;
  software?: string;
  version?: string;
  supported_nips?: number[];
  auth_required?: boolean;
  payment_required?: boolean;
  limitation?: {
    auth_required?: boolean;
    payment_required?: boolean;
    restricted_writes?: boolean;
  };
  fees?: {
    admission?: { amount: number; unit: string }[];
    subscription?: { amount: number; unit: string; period?: number }[];
  };
}

/** Convert relay websocket URL to HTTP URL for NIP-11 requests. */
function relayToHttpUrl(relayUrl: string): string | null {
  try {
    const parsed = new URL(relayUrl);
    if (parsed.protocol === 'wss:') parsed.protocol = 'https:';
    if (parsed.protocol === 'ws:') parsed.protocol = 'http:';

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function useRelayInfo(relayUrl: string) {
  const httpUrl = relayToHttpUrl(relayUrl);

  return useQuery<RelayInfoDocument>({
    queryKey: ['relay-info', relayUrl],
    queryFn: async ({ signal }) => {
      if (!httpUrl) {
        throw new Error('Invalid relay URL');
      }

      const response = await fetch(httpUrl, {
        headers: { Accept: 'application/nostr+json' },
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid NIP-11 response');
      }

      return payload as RelayInfoDocument;
    },
    enabled: !!httpUrl,
    staleTime: 12 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
}
