import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NSecSigner, type NostrEvent } from '@nostrify/nostrify';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import type { ReactNode } from 'react';

import { useEncryptedSettings, type EncryptedSettings } from './useEncryptedSettings';

const secretKey = generateSecretKey();
const PUBKEY = getPublicKey(secretKey);
const signer = new NSecSigner(secretKey);

// Control what the relay race returns per-test.
const query = vi.fn<(...args: unknown[]) => Promise<NostrEvent[]>>();
const publish = vi.fn<(event: NostrEvent) => Promise<void>>(() => Promise.resolve());
vi.mock('@nostrify/react', () => ({
  useNostr: () => ({ nostr: { query, event: publish } }),
}));

// Control the IndexedDB-backed event store per-test.
const storeQuery = vi.fn<(...args: unknown[]) => Promise<NostrEvent[]>>(() => Promise.resolve([]));
vi.mock('@/hooks/useNostrStorage', () => ({
  useNostrStorage: () => ({ store: { query: storeQuery } }),
}));

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { pubkey: PUBKEY, signer } }),
}));

vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => ({ config: { appId: 'ditto', appName: 'Ditto' } }),
}));

async function makeSettingsEvent(settings: EncryptedSettings, createdAt: number): Promise<NostrEvent> {
  return signer.signEvent({
    kind: 30078,
    content: await signer.nip44.encrypt(PUBKEY, JSON.stringify(settings)),
    tags: [['d', 'ditto/metadata']],
    created_at: createdAt,
  });
}

async function decryptSettings(event: NostrEvent): Promise<EncryptedSettings> {
  return JSON.parse(await signer.nip44.decrypt(PUBKEY, event.content));
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * Regression: settings live on dozens of relays that hold different versions,
 * and the pool resolves 300ms after the first relay's EOSE. When a relay with a
 * months-old snapshot answers first, the app used to read that snapshot and —
 * worse — rebuild its next write on top of it, republishing the old theme,
 * feed settings, and sidebar layout as the newest version everywhere.
 */
describe('useEncryptedSettings with relays holding stale snapshots', () => {
  let stale: NostrEvent;
  let fresh: NostrEvent;

  beforeEach(async () => {
    query.mockReset();
    publish.mockClear();
    storeQuery.mockReset();

    stale = await makeSettingsEvent({ theme: 'dark', sidebarOrder: ['old'], lastSync: 1_000_000 }, 1000);
    fresh = await makeSettingsEvent({ theme: 'light', sidebarOrder: ['new'], lastSync: 2_000_000 }, 2000);

    // The relay race returns the stale copy; the local cache saw the fresh one.
    query.mockResolvedValue([stale]);
    storeQuery.mockResolvedValue([fresh]);
  });

  it('reads the newest snapshot known locally, not the stale relay copy', async () => {
    const { result } = renderHook(() => useEncryptedSettings(), { wrapper });

    await waitFor(() => expect(result.current.settings).toBeTruthy());
    expect(result.current.settings?.theme).toBe('light');
    expect(result.current.settings?.sidebarOrder).toEqual(['new']);
  });

  it('builds a write on the newest snapshot, not the stale relay copy', async () => {
    const { result } = renderHook(() => useEncryptedSettings(), { wrapper });

    await result.current.updateSettings.mutateAsync({ notificationsCursor: 42 });

    expect(publish).toHaveBeenCalledTimes(1);
    const published = await decryptSettings(publish.mock.calls[0][0]);
    expect(published.theme).toBe('light');
    expect(published.sidebarOrder).toEqual(['new']);
    expect(published.notificationsCursor).toBe(42);
  });

  it('refuses to write when the existing snapshot cannot be decrypted', async () => {
    const unreadable = { ...fresh, content: 'not-ciphertext', created_at: 3000 };
    query.mockResolvedValue([unreadable]);
    storeQuery.mockResolvedValue([]);

    const { result } = renderHook(() => useEncryptedSettings(), { wrapper });

    await expect(
      result.current.updateSettings.mutateAsync({ notificationsCursor: 42 }),
    ).rejects.toThrow();
    // Publishing `{ notificationsCursor }` alone would wipe every other setting.
    expect(publish).not.toHaveBeenCalled();
  });
});
