import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { AppConfig } from '@/contexts/AppContext';
import type { EncryptedSettings } from '@/hooks/useEncryptedSettings';
import { setLocalSettingsSync } from '@/hooks/useEncryptedSettings';
import { NostrSync } from './NostrSync';

const PUBKEY = 'a'.repeat(64);

vi.mock('@nostrify/react', () => ({
  useNostr: () => ({ nostr: { query: () => Promise.resolve([]) } }),
}));

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { pubkey: PUBKEY } }),
}));

vi.mock('@/hooks/useBlockedRelays', () => ({
  useBlockedRelays: () => ({}),
}));

vi.mock('@/hooks/useStreakSync', () => ({
  useStreakSync: () => {},
}));

const config = {
  appId: 'ditto',
  theme: 'light',
  autoShareTheme: false,
  sidebarOrder: ['new'],
  relayMetadata: { relays: [], updatedAt: 0 },
  blossomServerMetadata: { servers: [], updatedAt: 0 },
} as unknown as AppConfig;

const updateConfig = vi.fn<(updater: (current: AppConfig) => AppConfig) => void>();
vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => ({ config, updateConfig }),
}));

let remoteSettings: EncryptedSettings;
vi.mock('@/hooks/useEncryptedSettings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useEncryptedSettings')>()),
  useEncryptedSettings: () => ({
    settings: remoteSettings,
    isLoading: false,
    recentlyWritten: () => false,
    updateSettings: { mutateAsync: () => Promise.resolve() },
    hasNip44Support: false,
  }),
}));

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Apply every `updateConfig` call to `config`, as AppProvider would. */
function appliedConfig(): AppConfig {
  return updateConfig.mock.calls.reduce((current, [updater]) => updater(current), config);
}

/**
 * Regression: on page load NostrSync applied whatever settings snapshot the
 * relay race returned, even when this device had already applied (or written)
 * a newer one — reverting the theme, feed settings, and sidebar layout.
 */
describe('NostrSync encrypted settings', () => {
  beforeEach(() => {
    localStorage.clear();
    updateConfig.mockClear();
  });

  it('does not apply a snapshot older than the one this device already has', () => {
    setLocalSettingsSync(PUBKEY, 2_000_000);
    remoteSettings = { theme: 'dark', sidebarOrder: ['old'], lastSync: 1_000_000 };

    render(<NostrSync />, { wrapper: Wrapper });

    expect(appliedConfig().theme).toBe('light');
    expect(appliedConfig().sidebarOrder).toEqual(['new']);
  });

  it('applies a snapshot newer than the one this device has', () => {
    setLocalSettingsSync(PUBKEY, 1_000_000);
    remoteSettings = { theme: 'dark', sidebarOrder: ['other'], lastSync: 2_000_000 };

    render(<NostrSync />, { wrapper: Wrapper });

    expect(appliedConfig().theme).toBe('dark');
    expect(appliedConfig().sidebarOrder).toEqual(['other']);
  });
});
