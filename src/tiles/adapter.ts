import type { FetchResult, NostrAdapter, NotifyVariant } from '@soapbox.pub/nostr-canvas';
import type { NostrEvent, UnsignedEvent } from 'nostr-tools';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

export interface CanvasAdapter extends NostrAdapter {
  notify?: (message: string, variant: NotifyVariant) => void;
}

/**
 * Host-owned services that Canvas may use on behalf of an installed tile.
 * The adapter must remain the only bridge between a tile and Ditto services.
 */
export interface CanvasAdapterServices {
  subscribe: NostrAdapter['subscribe'];
  user?: { pubkey: string };
  getPublicKey?: NonNullable<NostrAdapter['getPublicKey']>;
  getContacts?: NonNullable<NostrAdapter['getContacts']>;
  publishEvent?: (draft: UnsignedEvent) => Promise<NostrEvent>;
  getProfile?: NonNullable<NostrAdapter['getProfile']>;
  nip44Encrypt?: NonNullable<NostrAdapter['nip44Encrypt']>;
  nip44Decrypt?: NonNullable<NostrAdapter['nip44Decrypt']>;
  fetch?: typeof globalThis.fetch;
  notify?: (message: string, variant: NotifyVariant) => void;
}

/** Creates the Canvas adapter from Ditto-owned services. */
export function createCanvasAdapter(services: CanvasAdapterServices): CanvasAdapter {
  const adapter: CanvasAdapter = {
    subscribe: services.subscribe,
  };

  if (services.user && services.publishEvent) {
    adapter.publishEvent = (draft) => services.publishEvent!(draft);
  }
  if (services.getPublicKey) adapter.getPublicKey = services.getPublicKey;
  if (services.getContacts) adapter.getContacts = services.getContacts;
  if (services.getProfile) adapter.getProfile = services.getProfile;
  if (services.nip44Encrypt) adapter.nip44Encrypt = services.nip44Encrypt;
  if (services.nip44Decrypt) adapter.nip44Decrypt = services.nip44Decrypt;
  if (services.notify) adapter.notify = services.notify;

  adapter.navigate = async () => ({ ok: false, reason: 'not_implemented' });
  if (services.fetch) adapter.fetch = createSafeFetch(services.fetch);

  return adapter;
}

function createSafeFetch(fetcher: typeof globalThis.fetch): NonNullable<NostrAdapter['fetch']> {
  return async (request, options): Promise<FetchResult> => {
    const url = sanitizeUrl(request.url);
    if (!url) return { ok: false, error: 'Only HTTPS URLs are allowed.' };

    const headers = Object.fromEntries(
      Object.entries(request.headers ?? {}).filter(([name]) => !['authorization', 'cookie', 'proxy-authorization'].includes(name.toLowerCase())),
    );

    try {
      const response = await fetcher(url, {
        method: request.method,
        headers,
        body: request.body,
        credentials: 'omit',
        signal: options?.signal,
      });
      return {
        ok: response.ok,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: await response.text(),
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Request failed.' };
    }
  };
}
