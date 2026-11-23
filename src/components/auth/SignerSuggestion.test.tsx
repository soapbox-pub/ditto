import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SignerSuggestion } from '@/components/auth/SignerSuggestion';

const CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const state = vi.hoisted(() => ({
  platform: 'web',
  logins: [] as { type: string }[],
  signerApps: [] as { packageName: string; name: string }[],
  canOpen: [] as string[],
}));

vi.mock('@capacitor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@capacitor/core')>();
  return {
    ...actual,
    Capacitor: { ...actual.Capacitor, getPlatform: () => state.platform, isNativePlatform: () => state.platform !== 'web' },
  };
});
vi.mock('@capacitor/app-launcher', () => ({
  AppLauncher: { canOpenUrl: async ({ url }: { url: string }) => ({ value: state.canOpen.includes(url) }) },
}));
vi.mock('@/lib/androidNativeSigner', () => ({
  AndroidNativeSigner: { getSignerApps: async () => state.signerApps },
}));
vi.mock('@nostrify/react/login', () => ({ useNostrLogin: () => ({ logins: state.logins }) }));
vi.mock('@/hooks/useAppContext', () => ({ useAppContext: () => ({ config: { appName: 'Ditto' } }) }));

function renderSuggestion() {
  return render(<IntlProvider locale="en"><p>ready</p><SignerSuggestion /></IntlProvider>);
}

/** Let any platform probe settle, then report whether a suggestion is showing. */
async function suggestionShown(): Promise<boolean> {
  await screen.findByText('ready');
  await new Promise((r) => setTimeout(r, 0));
  return screen.queryByRole('button') !== null;
}

beforeEach(() => {
  state.platform = 'web';
  state.logins = [];
  state.signerApps = [];
  state.canOpen = [];
  vi.stubGlobal('navigator', { ...navigator, userAgent: CHROME, maxTouchPoints: 0 });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as { nostr?: unknown }).nostr;
});

describe('SignerSuggestion', () => {
  it('suggests the extension to a Chrome user without a signer', async () => {
    renderSuggestion();
    expect(await screen.findByText('Get the Ditto Extension')).toBeInTheDocument();
  });

  it('suggests nothing when a NIP-07 signer is already loaded', async () => {
    (window as { nostr?: unknown }).nostr = { getPublicKey: async () => 'a'.repeat(64) };
    renderSuggestion();
    expect(await suggestionShown()).toBe(false);
  });

  it.each(['extension', 'bunker'])('suggests nothing to someone already logged in with a signer (%s)', async (type) => {
    state.logins = [{ type: 'nsec' }, { type }];
    renderSuggestion();
    expect(await suggestionShown()).toBe(false);
  });

  it('suggests Amber in the Android app when no signer app is installed', async () => {
    state.platform = 'android';
    renderSuggestion();
    expect(await screen.findByText('Get Amber')).toBeInTheDocument();
  });

  it('suggests nothing in the Android app when a signer app is installed', async () => {
    state.platform = 'android';
    state.signerApps = [{ packageName: 'com.greenart7c3.nostrsigner', name: 'Amber' }];
    renderSuggestion();
    expect(await suggestionShown()).toBe(false);
  });

  it('suggests Clave in the iOS app when no signer app is installed', async () => {
    state.platform = 'ios';
    renderSuggestion();
    expect(await screen.findByText('Get Clave')).toBeInTheDocument();
  });

  it.each(['clave://', 'aegis://'])('suggests nothing in the iOS app when %s opens', async (url) => {
    state.platform = 'ios';
    state.canOpen = [url];
    renderSuggestion();
    expect(await suggestionShown()).toBe(false);
  });
});
