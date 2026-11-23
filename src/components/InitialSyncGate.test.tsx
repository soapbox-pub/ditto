import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InitialSyncGate } from '@/components/InitialSyncGate';
import { TestApp } from '@/test/TestApp';

const prefetch = vi.fn();
const follows = vi.hoisted(() => ({ pubkeys: ['a'.repeat(64)] }));

vi.mock('@/hooks/useWelcomePeople', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useWelcomePeople')>()),
  usePrefetchWelcomePeople: (enabled?: boolean) => prefetch(enabled),
}));
vi.mock('@/hooks/useInitialSync', () => ({ useInitialSync: () => ({ phase: 'not-found', markComplete: () => {} }) }));
vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: { pubkey: 'f'.repeat(64), signer: {} } }) }));
vi.mock('@/hooks/useFollowActions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useFollowActions')>()),
  useFollowList: () => ({ data: follows }),
}));

describe('InitialSyncGate', () => {
  it("doesn't prefetch people to meet for a login that already follows people", async () => {
    render(<TestApp><InitialSyncGate><p>app</p></InitialSyncGate></TestApp>);
    await waitFor(() => expect(prefetch).toHaveBeenCalled());
    expect(prefetch.mock.calls.every(([enabled]) => enabled === false)).toBe(true);
  });
});
