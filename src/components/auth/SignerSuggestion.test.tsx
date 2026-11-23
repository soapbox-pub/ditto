import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SignerSuggestion } from '@/components/auth/SignerSuggestion';
import { TestApp } from '@/test/TestApp';

const CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as { nostr?: unknown }).nostr;
});

describe('SignerSuggestion', () => {
  it('suggests the extension to a Chrome user without a signer', async () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: CHROME, maxTouchPoints: 0 });
    render(<TestApp><SignerSuggestion /></TestApp>);
    expect(await screen.findByText('Get the Ditto Extension')).toBeInTheDocument();
  });

  it('suggests nothing when a NIP-07 signer is already loaded', async () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: CHROME, maxTouchPoints: 0 });
    (window as { nostr?: unknown }).nostr = { getPublicKey: async () => 'a'.repeat(64) };
    const { container } = render(<TestApp><p>ready</p><SignerSuggestion /></TestApp>);
    await screen.findByText('ready');
    expect(container.querySelector('button')).toBeNull();
  });
});
