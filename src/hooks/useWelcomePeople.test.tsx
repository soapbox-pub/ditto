import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useWelcomePeople } from '@/hooks/useWelcomePeople';

const query = vi.fn(() => Promise.reject(new Error('relay timed out')));

vi.mock('@nostrify/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nostrify/react')>()),
  useNostr: () => ({ nostr: { query, relay: () => ({ query }), group: () => ({ query }) } }),
}));

vi.mock('@/hooks/useDiscoverAuthors', () => ({
  useDiscoverAuthors: () => ({ authors: [], key: 'empty' }),
}));

describe('useWelcomePeople', () => {
  it('stops loading when discovery fails', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useWelcomePeople(), { wrapper });

    await waitFor(() => expect(query).toHaveBeenCalled());
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.isError).toBe(true);
  });
});
