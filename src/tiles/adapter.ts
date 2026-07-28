import type { FetchResult, RuntimeAdapter, NotifyVariant } from '@soapbox.pub/nostr-canvas';
import type { NostrEvent, UnsignedEvent } from 'nostr-tools';
import { proxyUrl } from '@/lib/proxyUrl';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

export interface CanvasAdapter extends RuntimeAdapter {
  notify?: (message: string, variant: NotifyVariant) => void;
}

/**
 * Host-owned services that Canvas may use on behalf of an installed tile.
 * The adapter must remain the only bridge between a tile and Ditto services.
 */
export interface CanvasAdapterServices {
  subscribe: RuntimeAdapter['subscribe'];
  user?: { pubkey: string };
  getPublicKey?: NonNullable<RuntimeAdapter['getPublicKey']>;
  getContacts?: NonNullable<RuntimeAdapter['getContacts']>;
  publishEvent?: (draft: UnsignedEvent) => Promise<NostrEvent>;
  getProfile?: NonNullable<RuntimeAdapter['getProfile']>;
  nip44Encrypt?: NonNullable<RuntimeAdapter['nip44Encrypt']>;
  nip44Decrypt?: NonNullable<RuntimeAdapter['nip44Decrypt']>;
  fetch?: typeof globalThis.fetch;
  corsProxy?: () => string;
  notify?: (message: string, variant: NotifyVariant) => void;
  uploadImage?: NonNullable<RuntimeAdapter['uploadImage']>;
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
  if (services.uploadImage) adapter.uploadImage = services.uploadImage;

  adapter.navigate = async () => ({ ok: false, reason: 'not_implemented' });
  if (services.fetch) adapter.fetch = createSafeFetch(services.fetch, services.corsProxy);

  return adapter;
}

function createSafeFetch(fetcher: typeof globalThis.fetch, getCorsProxy?: () => string): NonNullable<RuntimeAdapter['fetch']> {
  return async (request, options): Promise<FetchResult> => {
    const url = sanitizeUrl(request.url);
    if (!url) return { ok: false, error: 'Only HTTPS URLs are allowed.' };

    let endpoint: string;
    try {
      endpoint = sanitizeUrl(proxyUrl({ template: getCorsProxy?.() ?? '', url })) ?? '';
    } catch {
      endpoint = '';
    }
    if (!endpoint) return { ok: false, error: 'A secure CORS proxy is required for tile requests.' };

    const headers = Object.fromEntries(
      Object.entries(request.headers ?? {}).filter(([name]) => {
        const lowerName = name.toLowerCase();
        return !['authorization', 'cookie', 'proxy-authorization', 'x-csrf-token'].includes(lowerName) && !lowerName.startsWith('sec-') && !lowerName.startsWith('proxy-');
      }),
    );

    try {
      const response = await fetcher.call(globalThis, endpoint, {
        method: request.method,
        headers,
        body: request.body,
        credentials: 'omit',
        mode: 'cors',
        redirect: 'follow',
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
