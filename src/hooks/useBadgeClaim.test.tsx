import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSyncExternalStore } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useBadgeClaim } from './useBadgeClaim';
import { BADGE_CLAIM_KIND, DITTO_EXPLORER_BADGE_DTAG } from '@/lib/badgeClaim';
import {
  createInitialGuideState,
  type PostOnboardingGuideState,
} from '@/lib/postOnboardingGuide';
import type { EncryptedSettings } from './useEncryptedSettings';

const PUBKEY = 'a'.repeat(64);

let settings: EncryptedSettings | undefined;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const mutateAsync = vi.fn(async (patch: Partial<EncryptedSettings>) => {
  settings = { ...settings, ...patch };
  for (const listener of listeners) listener();
  return { updatedSettings: settings };
});

/** Publishes the claim. Tests swap in failures to exercise the retry path. */
let publish: (template: unknown) => Promise<NostrEvent>;
const publishSpy = vi.fn((template: unknown) => publish(template));

vi.mock('./useEncryptedSettings', () => ({
  useEncryptedSettings: () => ({
    settings: useSyncExternalStore(subscribe, () => settings),
    isLoading: false,
    updateSettings: { mutateAsync, isPending: false },
    hasNip44Support: true,
  }),
}));
vi.mock('./useCurrentUser', () => ({ useCurrentUser: () => ({ user: { pubkey: PUBKEY } }) }));
vi.mock('./useNostrPublish', () => ({
  useNostrPublish: () => ({ mutateAsync: publishSpy }),
}));
vi.mock('./useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

function claimEvent(id = 'e'.repeat(64)): NostrEvent {
  return {
    id,
    pubkey: PUBKEY,
    kind: BADGE_CLAIM_KIND,
    created_at: 1,
    content: '',
    tags: [],
    sig: 'c'.repeat(128),
  };
}

function stored(): PostOnboardingGuideState | undefined {
  return settings?.postOnboardingGuide;
}

const COMPLETED: Partial<PostOnboardingGuideState> = {
  status: 'completed',
  completedAt: 5_000,
  paths: {
    'find-people': 'completed',
    'post-small': 'completed',
    customize: 'completed',
    interact: 'completed',
  },
};

function seed(overrides: Partial<PostOnboardingGuideState> = {}) {
  settings = {
    postOnboardingGuide: { ...createInitialGuideState(1_000), ...overrides },
  } as EncryptedSettings;
}

describe('useBadgeClaim', () => {
  beforeEach(() => {
    settings = undefined;
    listeners.clear();
    mutateAsync.mockClear();
    publishSpy.mockClear();
    publish = async () => claimEvent();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('publishes a well-formed addressable claim', async () => {
    seed(COMPLETED);
    const { result } = renderHook(() => useBadgeClaim());

    await act(async () => {
      await result.current.claim();
    });

    expect(publishSpy).toHaveBeenCalledTimes(1);
    const template = publishSpy.mock.calls[0][0] as { kind: number; tags: string[][] };
    expect(template.kind).toBe(BADGE_CLAIM_KIND);
    // The `d` tag is what makes the claim addressable — and therefore
    // self-replacing rather than duplicating across devices.
    expect(template.tags).toContainEqual(['d', DITTO_EXPLORER_BADGE_DTAG]);
    // One `path` tag per completed task.
    expect(template.tags.filter(([name]) => name === 'path')).toHaveLength(4);
  });

  it('records the claim so it survives a reload without republishing', async () => {
    seed(COMPLETED);
    const first = renderHook(() => useBadgeClaim());
    await act(async () => {
      await first.result.current.claim();
    });
    expect(stored()?.badgeClaim?.status).toBe('claimed');
    first.unmount();

    const second = renderHook(() => useBadgeClaim());
    await waitFor(() => expect(second.result.current.isClaimed).toBe(true));
    await act(async () => {
      await second.result.current.claim();
    });

    expect(publishSpy).toHaveBeenCalledTimes(1);
  });

  it('does not publish twice on a double-tap', async () => {
    seed(COMPLETED);
    // A publish that stays pending until we release it, so both taps overlap
    // in flight — the case a naive guard would let through.
    let releasePublish: (event: NostrEvent) => void = () => {};
    const published = new Promise<NostrEvent>((resolve) => { releasePublish = resolve; });
    publish = () => published;

    const { result } = renderHook(() => useBadgeClaim());

    await act(async () => {
      const first = result.current.claim();
      const second = result.current.claim();
      // Let the first attempt reach the (pending) publish before releasing it.
      await waitFor(() => expect(publishSpy).toHaveBeenCalledTimes(1));
      releasePublish(claimEvent());
      await Promise.all([first, second]);
    });

    expect(publishSpy).toHaveBeenCalledTimes(1);
    expect(stored()?.badgeClaim?.status).toBe('claimed');
  });

  it('does not publish before the mission is complete', async () => {
    seed(); // active, nothing done
    const { result } = renderHook(() => useBadgeClaim());

    await act(async () => {
      await result.current.claim();
    });

    expect(publishSpy).not.toHaveBeenCalled();
    expect(result.current.rewardView).toBe('locked');
  });

  it('does not publish for a mission dismissed before claiming', async () => {
    seed({ ...COMPLETED, status: 'skipped', skippedAt: 6_000 });
    const { result } = renderHook(() => useBadgeClaim());

    await act(async () => {
      await result.current.claim();
    });

    expect(publishSpy).not.toHaveBeenCalled();
    expect(result.current.rewardView).toBe('dismissed');
  });

  it('surfaces a failure as retryable, then succeeds on retry', async () => {
    seed(COMPLETED);
    publish = async () => { throw new Error('relay unreachable'); };
    const { result } = renderHook(() => useBadgeClaim());

    await act(async () => {
      await result.current.claim();
    });

    await waitFor(() => expect(result.current.rewardView).toBe('failed'));
    expect(result.current.isClaimed).toBe(false);
    expect(stored()?.badgeClaim?.status).toBe('failed');

    publish = async () => claimEvent('d'.repeat(64));
    await act(async () => {
      await result.current.claim();
    });

    await waitFor(() => expect(result.current.isClaimed).toBe(true));
    expect(publishSpy).toHaveBeenCalledTimes(2);
    expect(stored()?.badgeClaim?.claimEventId).toBe('d'.repeat(64));
  });

  it('lets a claim that died mid-publish be retried', async () => {
    // Persisted `claiming` from a session that crashed before recording an
    // outcome. Without recovery the user would be locked out forever.
    seed({
      ...COMPLETED,
      badgeClaim: {
        badge: 'ditto-explorer',
        status: 'claiming',
        claimingStartedAt: Date.now() - 10 * 60_000,
      },
    });
    const { result } = renderHook(() => useBadgeClaim());

    await waitFor(() => expect(result.current.rewardView).toBe('failed'));
    await act(async () => {
      await result.current.claim();
    });

    expect(publishSpy).toHaveBeenCalledTimes(1);
    expect(stored()?.badgeClaim?.status).toBe('claimed');
  });

  it('reports claimed as an award still pending, never as awarded', async () => {
    // The claim is a request; the NIP-58 award is issued later by the issuer.
    seed(COMPLETED);
    const { result } = renderHook(() => useBadgeClaim());

    await act(async () => {
      await result.current.claim();
    });

    expect(result.current.rewardView).toBe('claimed');
    expect(stored()?.badgeClaim?.claimEventId).toBe('e'.repeat(64));
    // Nothing here awards a badge — no kind 8 is ever published by the client.
    for (const call of publishSpy.mock.calls) {
      expect((call[0] as { kind: number }).kind).toBe(BADGE_CLAIM_KIND);
    }
  });
});
