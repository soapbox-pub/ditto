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
const toast = vi.fn();
vi.mock('./useToast', () => ({ useToast: () => ({ toast }) }));

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

// Module-level, not per-describe: the fake settings store, the publish stub and
// the spies are all module state, so a suite that inherited them from the one
// before would be testing whatever the previous test happened to leave behind.
beforeEach(() => {
  settings = undefined;
  listeners.clear();
  mutateAsync.mockClear();
  publishSpy.mockClear();
  toast.mockClear();
  publish = async () => claimEvent();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('useBadgeClaim', () => {
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

/**
 * Ditto knows one thing when a claim succeeds: the event went out. It does not
 * know the badge was awarded, that the user owns it, that the issuer is even
 * running, or that anybody will be told when it is.
 *
 * A success toast used to claim three of those four. It is gone — the reward
 * surface already says the true thing — and these keep it gone.
 */
describe('useBadgeClaim — what success is allowed to say', () => {
  /** Anything a client that cannot observe the issuer must never assert. */
  const FORBIDDEN = [/awarded/i, /you'll be notified/i, /you’ll be notified/i, /badge claimed/i];

  it('says nothing at all when the claim is published', async () => {
    seed(COMPLETED);
    const { result } = renderHook(() => useBadgeClaim());

    await act(async () => {
      await result.current.claim();
    });

    expect(stored()?.badgeClaim?.status).toBe('claimed');
    expect(toast).not.toHaveBeenCalled();
  });

  it('makes no award or notification claim in any toast it does raise', async () => {
    seed(COMPLETED);
    publish = async () => { throw new Error('relay unreachable'); };
    const { result } = renderHook(() => useBadgeClaim());

    await act(async () => {
      await result.current.claim();
    });

    // The failure toast survives — its wording asserts nothing untrue.
    expect(toast).toHaveBeenCalledTimes(1);
    for (const [payload] of toast.mock.calls) {
      const words = `${payload.title ?? ''} ${payload.description ?? ''}`;
      for (const forbidden of FORBIDDEN) expect(words).not.toMatch(forbidden);
    }
  });
});

describe('useBadgeClaim — outcomes', () => {
  it('reports a newly published claim, with its event id', async () => {
    seed(COMPLETED);
    const { result } = renderHook(() => useBadgeClaim());

    let outcome: Awaited<ReturnType<typeof result.current.claim>> | undefined;
    await act(async () => {
      outcome = await result.current.claim();
    });

    expect(outcome).toEqual({ status: 'claimed', claimEventId: 'e'.repeat(64) });
  });

  it('distinguishes an existing claim from a failure', async () => {
    // The difference that matters: one means "nothing left to do", the other
    // means "offer a retry". Both used to be a silent return.
    seed({
      ...COMPLETED,
      badgeClaim: {
        badge: 'ditto-explorer',
        status: 'claimed',
        claimEventId: 'f'.repeat(64),
        claimedAt: 6_000,
      },
    });
    const { result } = renderHook(() => useBadgeClaim());
    await waitFor(() => expect(result.current.isClaimed).toBe(true));

    let outcome: Awaited<ReturnType<typeof result.current.claim>> | undefined;
    await act(async () => {
      outcome = await result.current.claim();
    });

    expect(outcome).toEqual({ status: 'already-claimed', claimEventId: 'f'.repeat(64) });
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it('still reports an existing claim once the reward has been revealed', async () => {
    seed({
      ...COMPLETED,
      badgeClaim: {
        badge: 'ditto-explorer',
        status: 'claimed',
        claimEventId: 'f'.repeat(64),
        claimedAt: 6_000,
        revealedAt: 7_000,
      },
    });
    const { result } = renderHook(() => useBadgeClaim());
    await waitFor(() => expect(result.current.rewardView).toBe('revealed'));

    let outcome: Awaited<ReturnType<typeof result.current.claim>> | undefined;
    await act(async () => {
      outcome = await result.current.claim();
    });

    expect(outcome?.status).toBe('already-claimed');
    // A revealed reward is still a claimed one.
    expect(result.current.isClaimed).toBe(true);
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it('reports a failure with the error that caused it', async () => {
    seed(COMPLETED);
    const boom = new Error('relay unreachable');
    publish = async () => { throw boom; };
    const { result } = renderHook(() => useBadgeClaim());

    let outcome: Awaited<ReturnType<typeof result.current.claim>> | undefined;
    await act(async () => {
      outcome = await result.current.claim();
    });

    expect(outcome).toEqual({ status: 'failed', error: boom });
    expect(stored()?.badgeClaim?.status).toBe('failed');
  });

  it('reports a double-tap as in flight, not as a failure', async () => {
    seed(COMPLETED);
    let releasePublish: (event: NostrEvent) => void = () => {};
    const published = new Promise<NostrEvent>((resolve) => { releasePublish = resolve; });
    publish = () => published;

    const { result } = renderHook(() => useBadgeClaim());

    let first: Awaited<ReturnType<typeof result.current.claim>> | undefined;
    let second: Awaited<ReturnType<typeof result.current.claim>> | undefined;
    await act(async () => {
      const a = result.current.claim();
      const b = result.current.claim();
      await waitFor(() => expect(publishSpy).toHaveBeenCalledTimes(1));
      releasePublish(claimEvent());
      [first, second] = await Promise.all([a, b]);
    });

    expect(first?.status).toBe('claimed');
    // The second tap did nothing, and saying "failed" would have offered a
    // retry for a claim that was on its way to succeeding.
    expect(second).toEqual({ status: 'in-flight' });
  });

  it('reports a state that cannot be claimed from at all', async () => {
    seed(); // active, nothing done
    const { result } = renderHook(() => useBadgeClaim());

    let outcome: Awaited<ReturnType<typeof result.current.claim>> | undefined;
    await act(async () => {
      outcome = await result.current.claim();
    });

    expect(outcome).toEqual({ status: 'ineligible', rewardView: 'locked' });
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it('persists the claim and the reveal in one write when asked to', async () => {
    seed(COMPLETED);
    const { result } = renderHook(() => useBadgeClaim());

    await act(async () => {
      await result.current.claim({ revealedAt: 9_000 });
    });

    expect(stored()?.badgeClaim?.status).toBe('claimed');
    expect(stored()?.badgeClaim?.revealedAt).toBe(9_000);
    await waitFor(() => expect(result.current.rewardView).toBe('revealed'));
    // begin + complete. Nothing extra to stamp the reveal separately.
    expect(mutateAsync).toHaveBeenCalledTimes(2);
  });

  it('reveals an already-claimed reward without publishing again', async () => {
    seed({
      ...COMPLETED,
      badgeClaim: {
        badge: 'ditto-explorer',
        status: 'claimed',
        claimEventId: 'f'.repeat(64),
        claimedAt: 6_000,
      },
    });
    const { result } = renderHook(() => useBadgeClaim());
    await waitFor(() => expect(result.current.rewardView).toBe('claimed'));

    await act(async () => {
      await result.current.markRewardRevealed();
    });

    await waitFor(() => expect(result.current.isRevealed).toBe(true));
    expect(publishSpy).not.toHaveBeenCalled();
    expect(stored()?.badgeClaim?.claimEventId).toBe('f'.repeat(64));
  });
});
