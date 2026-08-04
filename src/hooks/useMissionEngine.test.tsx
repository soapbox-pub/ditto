import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSyncExternalStore, type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useMissionEngine } from './useMissionEngine';
import {
  createInitialGuideState,
  type PostOnboardingGuideState,
} from '@/lib/postOnboardingGuide';
import type { EncryptedSettings } from './useEncryptedSettings';

const PUBKEY = 'a'.repeat(64);
const STARTED_AT = 1_700_000_000_000;

// ── Test doubles ────────────────────────────────────────────────────────────
//
// The engine is the one place that decides "is this task actually done", so
// every input it reads is faked here and driven per-test: the identity, the
// settings store, the follow list, the profile, the theme, the relay, and the
// current route.

let settings: EncryptedSettings | undefined;
let settingsLoading = false;
let hasNip44Support = true;
let writeCount = 0;

const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const mutateAsync = vi.fn(async (patch: Partial<EncryptedSettings>) => {
  writeCount += 1;
  settings = { ...settings, ...patch };
  for (const listener of listeners) listener();
  return { updatedSettings: settings };
});

let user: { pubkey: string } | null = { pubkey: PUBKEY };
let followPubkeys: string[] | undefined;
let authorData: { event?: NostrEvent; metadata?: Record<string, unknown> } | undefined;
let theme = 'dark';
let customTheme: unknown;
let pathname = '/';
let relayEvents: NostrEvent[] = [];

vi.mock('./useEncryptedSettings', () => ({
  useEncryptedSettings: () => ({
    settings: useSyncExternalStore(subscribe, () => settings),
    isLoading: settingsLoading,
    updateSettings: { mutateAsync, isPending: false },
    hasNip44Support,
  }),
}));
vi.mock('./useCurrentUser', () => ({ useCurrentUser: () => ({ user }) }));
vi.mock('./useFollowActions', () => ({
  useFollowList: () => ({
    data: followPubkeys === undefined ? undefined : { event: null, pubkeys: followPubkeys },
  }),
}));
vi.mock('./useAuthor', () => ({ useAuthor: () => ({ data: authorData }) }));
vi.mock('./useAppContext', () => ({
  useAppContext: () => ({ config: { theme, customTheme } }),
}));
vi.mock('@nostrify/react', () => ({
  useNostr: () => ({ nostr: { query: async () => relayEvents } }),
}));
vi.mock('react-router-dom', () => ({ useLocation: () => ({ pathname }) }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function reset() {
  settings = undefined;
  settingsLoading = false;
  hasNip44Support = true;
  writeCount = 0;
  listeners.clear();
  mutateAsync.mockClear();
  user = { pubkey: PUBKEY };
  followPubkeys = undefined;
  authorData = undefined;
  theme = 'dark';
  customTheme = undefined;
  pathname = '/';
  relayEvents = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
}

function stored(): PostOnboardingGuideState | undefined {
  return settings?.postOnboardingGuide;
}

function seed(state: Partial<PostOnboardingGuideState> = {}) {
  settings = {
    postOnboardingGuide: { ...createInitialGuideState(STARTED_AT), ...state },
  } as EncryptedSettings;
}

function note(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: 'f'.repeat(64),
    pubkey: PUBKEY,
    kind: 1,
    created_at: Math.floor(STARTED_AT / 1000) + 60,
    content: 'hi',
    tags: [],
    sig: 'c'.repeat(128),
    ...overrides,
  };
}

// ── Initialization ──────────────────────────────────────────────────────────

describe('useMissionEngine — initialization', () => {
  beforeEach(reset);

  it('creates the mission for an authenticated existing user', async () => {
    renderHook(() => useMissionEngine(), { wrapper });
    await waitFor(() => expect(stored()?.status).toBe('active'));
  });

  it('waits for the pubkey before writing anything', async () => {
    user = null;
    const { rerender } = renderHook(() => useMissionEngine(), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(writeCount).toBe(0);

    // The account resolves; only now may the mission be created — otherwise it
    // could be written against the wrong identity.
    user = { pubkey: PUBKEY };
    rerender();
    await waitFor(() => expect(stored()?.status).toBe('active'));
  });

  it('waits for settings to finish loading', async () => {
    settingsLoading = true;
    const { rerender } = renderHook(() => useMissionEngine(), { wrapper });

    // "No mission yet" is indistinguishable from "not loaded yet" until the
    // load completes, so writing here could clobber real progress.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(writeCount).toBe(0);

    settingsLoading = false;
    rerender();
    await waitFor(() => expect(stored()?.status).toBe('active'));
  });

  it('does nothing for a signer that cannot encrypt', async () => {
    hasNip44Support = false;
    renderHook(() => useMissionEngine(), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(writeCount).toBe(0);
    expect(stored()).toBeUndefined();
  });

  it('initializes exactly once despite re-renders', async () => {
    const { rerender } = renderHook(() => useMissionEngine(), { wrapper });
    await waitFor(() => expect(stored()?.status).toBe('active'));

    const afterInit = writeCount;
    rerender();
    rerender();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(writeCount).toBe(afterInit);
  });

  it('does not re-create a dismissed mission', async () => {
    seed({ status: 'skipped', skippedAt: 1 });
    renderHook(() => useMissionEngine(), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stored()?.status).toBe('skipped');
    expect(writeCount).toBe(0);
  });

  it('requires no signup signal of any kind', async () => {
    // Nothing in the engine's inputs describes how the account was created —
    // an ordinary logged-in user is sufficient and is all that's provided here.
    renderHook(() => useMissionEngine(), { wrapper });
    await waitFor(() => expect(stored()).toBeDefined());
    expect(stored()).not.toHaveProperty('source');
  });
});

// ── Real-state completion detection ─────────────────────────────────────────

describe('useMissionEngine — find-people detection', () => {
  beforeEach(reset);

  it('records the follow count as a baseline without completing anything', async () => {
    seed();
    followPubkeys = ['b'.repeat(64), 'c'.repeat(64)];
    renderHook(() => useMissionEngine(), { wrapper });

    await waitFor(() => expect(stored()?.baselines?.follows).toBe(2));
    expect(stored()?.paths['find-people']).toBe('not_started');
  });

  it('completes only once the follow list actually grows', async () => {
    seed({ baselines: { follows: 2 } });
    followPubkeys = ['b'.repeat(64), 'c'.repeat(64)];
    const { rerender } = renderHook(() => useMissionEngine(), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stored()?.paths['find-people']).toBe('not_started');

    followPubkeys = [...followPubkeys, 'd'.repeat(64)];
    rerender();
    await waitFor(() => expect(stored()?.paths['find-people']).toBe('completed'));
  });

  it('does not complete when the user unfollows someone', async () => {
    seed({ baselines: { follows: 3 } });
    followPubkeys = ['b'.repeat(64)];
    renderHook(() => useMissionEngine(), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stored()?.paths['find-people']).toBe('not_started');
  });

  it('ignores an unresolved follow list rather than baselining zero', async () => {
    // Baselining a not-yet-loaded list at 0 would let any existing follow
    // instantly "complete" the task.
    seed();
    followPubkeys = undefined;
    renderHook(() => useMissionEngine(), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stored()?.baselines?.follows).toBeUndefined();
    expect(stored()?.paths['find-people']).toBe('not_started');
  });
});

describe('useMissionEngine — post-small detection', () => {
  beforeEach(reset);

  it('completes on a qualifying root kind-1 note', async () => {
    seed();
    relayEvents = [note()];
    renderHook(() => useMissionEngine(), { wrapper });

    await waitFor(() => expect(stored()?.paths['post-small']).toBe('completed'));
  });

  it('does not complete on a reply', async () => {
    seed();
    relayEvents = [note({ tags: [['e', 'd'.repeat(64), '', 'root']] })];
    renderHook(() => useMissionEngine(), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(stored()?.paths['post-small']).toBe('not_started');
  });

  it('does not complete on a note that predates the mission', async () => {
    seed();
    relayEvents = [note({ created_at: Math.floor((STARTED_AT - 86_400_000) / 1000) })];
    renderHook(() => useMissionEngine(), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(stored()?.paths['post-small']).toBe('not_started');
  });

  it('does not complete when the user has published nothing', async () => {
    seed();
    relayEvents = [];
    renderHook(() => useMissionEngine(), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(stored()?.paths['post-small']).toBe('not_started');
  });

  it('re-detects a completion that a concurrent write lost', async () => {
    // The self-healing property of state detection: even if a task completion
    // is clobbered by another tab, the next pass simply finds it again.
    seed();
    relayEvents = [note()];
    const first = renderHook(() => useMissionEngine(), { wrapper });
    await waitFor(() => expect(stored()?.paths['post-small']).toBe('completed'));
    first.unmount();

    seed(); // simulate the completion being lost
    renderHook(() => useMissionEngine(), { wrapper });
    await waitFor(() => expect(stored()?.paths['post-small']).toBe('completed'));
  });
});

describe('useMissionEngine — customize detection', () => {
  beforeEach(reset);

  it('completes the profile substep on a profile saved since the mission started', async () => {
    seed();
    authorData = {
      event: note({ kind: 0, created_at: Math.floor(STARTED_AT / 1000) + 30 }),
      metadata: { name: 'Alice' },
    };
    renderHook(() => useMissionEngine(), { wrapper });

    await waitFor(() => expect(stored()?.customize?.profileCompleted).toBe(true));
    // One substep is not the whole task.
    expect(stored()?.paths.customize).toBe('active');
  });

  it('does not auto-complete from a pre-existing profile', async () => {
    seed();
    authorData = {
      event: note({ kind: 0, created_at: Math.floor((STARTED_AT - 86_400_000) / 1000) }),
      metadata: { name: 'Alice' },
    };
    renderHook(() => useMissionEngine(), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(stored()?.customize?.profileCompleted).toBeUndefined();
  });

  it('does not complete for a profile saved with no meaningful fields', async () => {
    seed();
    authorData = {
      event: note({ kind: 0, created_at: Math.floor(STARTED_AT / 1000) + 30 }),
      metadata: {},
    };
    renderHook(() => useMissionEngine(), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(stored()?.customize?.profileCompleted).toBeUndefined();
  });

  it('baselines the theme without completing the theme substep', async () => {
    seed();
    theme = 'dark';
    renderHook(() => useMissionEngine(), { wrapper });

    await waitFor(() => expect(stored()?.baselines?.theme).toBe('builtin:dark'));
    expect(stored()?.customize?.themeCompleted).toBeUndefined();
  });

  it('completes the theme substep when the active theme changes', async () => {
    seed({ baselines: { theme: 'builtin:dark' } });
    theme = 'light';
    renderHook(() => useMissionEngine(), { wrapper });

    await waitFor(() => expect(stored()?.customize?.themeCompleted).toBe(true));
  });

  it('completes the customize task once both substeps land', async () => {
    seed({ baselines: { theme: 'builtin:dark' }, customize: { profileCompleted: true } });
    theme = 'light';
    renderHook(() => useMissionEngine(), { wrapper });

    await waitFor(() => expect(stored()?.paths.customize).toBe('completed'));
  });

  it('treats an edited custom palette as a theme change', async () => {
    seed({ baselines: { theme: 'custom:{"colors":{"background":"#000"}}' } });
    theme = 'custom';
    customTheme = { colors: { background: '#111' } };
    renderHook(() => useMissionEngine(), { wrapper });

    await waitFor(() => expect(stored()?.customize?.themeCompleted).toBe(true));
  });
});

describe('useMissionEngine — explore detection', () => {
  beforeEach(reset);

  it('does not complete merely because the mission is active', async () => {
    seed();
    pathname = '/';
    renderHook(() => useMissionEngine(), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(stored()?.paths.explore).toBe('not_started');
  });

  it('completes on genuine arrival at Trends', async () => {
    seed();
    pathname = '/trends';
    renderHook(() => useMissionEngine(), { wrapper });

    await waitFor(() => expect(stored()?.paths.explore).toBe('completed'));
  });
});

describe('useMissionEngine — detection is gated on an active mission', () => {
  beforeEach(reset);

  it('detects nothing for a dismissed mission', async () => {
    seed({ status: 'skipped' });
    relayEvents = [note()];
    followPubkeys = ['b'.repeat(64)];
    pathname = '/trends';
    renderHook(() => useMissionEngine(), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(writeCount).toBe(0);
    expect(stored()?.paths.explore).toBe('not_started');
  });

  it('completes the whole mission when the last task is detected', async () => {
    seed({
      paths: {
        'find-people': 'completed',
        'post-small': 'completed',
        customize: 'completed',
        explore: 'not_started',
      },
    });
    pathname = '/trends';
    renderHook(() => useMissionEngine(), { wrapper });

    await waitFor(() => expect(stored()?.status).toBe('completed'));
    expect(typeof stored()?.completedAt).toBe('number');
  });
});
