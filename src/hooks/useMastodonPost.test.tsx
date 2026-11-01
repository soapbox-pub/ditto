import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useMastodonPost } from './useMastodonPost';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useMastodonPost', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('drops non-https URLs returned by the instance', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      id: '123',
      created_at: '2026-01-01T00:00:00Z',
      content: '<p>hi</p>',
      url: 'javascript:alert(1)',
      account: {
        display_name: 'Mallory',
        username: 'mallory',
        acct: 'mallory',
        avatar: 'http://192.168.1.1/avatar.png',
        url: 'javascript:alert(2)',
      },
      media_attachments: [
        { type: 'image', url: 'data:image/png;base64,AAAA', preview_url: null, description: null },
      ],
      card: { title: 'Card', image: 'http://tracker.example/pixel.png' },
      favourites_count: 0,
      reblogs_count: 0,
      replies_count: 0,
    })));

    const { result } = renderHook(
      () => useMastodonPost('https://mastodon.social/@mallory/123'),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const post = result.current.data!;
    expect(post.postUrl).toBe('https://mastodon.social/@mallory/123');
    expect(post.profileUrl).toBe('https://mastodon.social/@mallory');
    expect(post.avatar).toBeUndefined();
    expect(post.images).toBeUndefined();
    expect(post.external).toEqual({ title: 'Card', thumb: undefined });
  });
});
