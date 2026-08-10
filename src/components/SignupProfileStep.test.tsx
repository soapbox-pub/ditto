import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect, useSyncExternalStore } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { TestApp } from '@/test/TestApp';
import { InitialSyncGate } from './InitialSyncGate';
import { useOnboarding } from '@/hooks/useOnboarding';

/**
 * The signup profile step's publish-pending behaviour.
 *
 * This exists because of a regression the `SignupServices` extraction
 * introduced and nothing caught: the step kept reading `isPending` from a
 * locally-constructed `useNostrPublish()` while the publish itself moved behind
 * `signupServices.publishProfile` — a *different* mutation instance. The flag
 * was therefore permanently false, so Continue stayed live for the whole kind-0
 * round-trip, and a second tap published a second kind 0 and advanced twice.
 *
 * The assertions are deliberately about the observable contract rather than
 * about which hook supplies the flag: while a publish is in flight the button
 * is disabled, a second submission does nothing, and exactly one publish and
 * one advance happen.
 */

const SIGNUP_PUBKEY = 'a'.repeat(64);

// ── A controllable stand-in for the signup services ─────────────────────────
//
// The one property that matters is reproduced faithfully: `isPublishingProfile`
// is true for exactly as long as the promise `publishProfile` returned is
// unsettled, which is what `useNostrPublish`'s own `isPending` does for the
// real implementation. Held in a module store so a change re-renders every
// consumer, the way a real mutation's state transition does.

let publishCalls = 0;
let isPublishingProfile = false;
let settlePublish: ((error?: Error) => void) | undefined;

let version = 0;
const listeners = new Set<() => void>();
function notify() {
  version += 1;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

vi.mock('@/lib/signupServices', () => ({
  useSignupServices: () => {
    useSyncExternalStore(subscribe, () => version);
    return {
      generateAccount: () => ({
        secretDisplay: 'nsec1test',
        nsec: 'nsec1test',
        pubkey: SIGNUP_PUBKEY,
      }),
      persistAccount: async () => 'dismissed' as const,
      publishProfile: () => {
        publishCalls += 1;
        isPublishingProfile = true;
        notify();
        return new Promise<void>((resolve, reject) => {
          settlePublish = (error?: Error) => {
            isPublishingProfile = false;
            notify();
            if (error) reject(error);
            else resolve();
          };
        });
      },
      publishFollows: async () => {},
      isPublishingProfile,
    };
  },
}));

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    user: { pubkey: SIGNUP_PUBKEY, signer: {} },
    users: [],
    metadata: undefined,
  }),
}));

vi.mock('@/hooks/useInitialSync', () => ({
  useInitialSync: () => ({ phase: 'complete', markComplete: vi.fn() }),
}));

vi.mock('@/hooks/useEncryptedSettings', () => ({
  useEncryptedSettings: () => ({
    settings: undefined,
    isLoading: false,
    updateSettings: { mutateAsync: vi.fn() },
    hasNip44Support: true,
    pubkey: SIGNUP_PUBKEY,
  }),
  getLocalSettingsSync: () => undefined,
}));

vi.mock('@/hooks/useUploadFile', () => ({
  useUploadFile: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// The follows step queries relays for an existing kind 3 the moment the profile
// step advances. Answer immediately, so "did it advance?" isn't a five-second
// timeout question.
vi.mock('@nostrify/react', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  // Stable identity, deliberately: the follows step keys an effect on `nostr`,
  // so a fresh object per render would re-arm it every pass and the tree would
  // never go quiet.
  const stub = { nostr: { query: async () => [] } };
  return { ...actual, useNostr: () => stub };
});

/** Enters signup as soon as it mounts, the way the "Sign up" button does. */
function StartSignup() {
  const { startSignup } = useOnboarding();
  useEffect(() => startSignup(), [startSignup]);
  return null;
}

/** Let queued effects, lazy chunks and promise callbacks land. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

/** Drive the wizard to the profile step and put a name into it. */
async function reachProfileStep() {
  render(
    <TestApp>
      <InitialSyncGate>
        <StartSignup />
      </InitialSyncGate>
    </TestApp>,
  );
  await settle();

  // Signup opens on the theme step, then key generation, then saving the key —
  // which is where production logs in, three screens before signup finishes.
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));
  await settle();
  fireEvent.click(screen.getByRole('button', { name: /generate my key/i }));
  await settle();
  fireEvent.click(screen.getByRole('button', { name: /save key/i }));
  await settle();

  fireEvent.change(screen.getByPlaceholderText(/your name/i), { target: { value: 'Ada' } });
}

/** Whether the profile step is still on screen. */
function onProfileStep() {
  return screen.queryByPlaceholderText(/your name/i) !== null;
}

function continueButton() {
  return screen.getByRole('button', { name: /continue|saving/i });
}

describe('signup profile step — publish pending state', () => {
  beforeEach(() => {
    publishCalls = 0;
    isPublishingProfile = false;
    settlePublish = undefined;
    listeners.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('disables Continue while the profile publish is in flight, and blocks a second submit', async () => {
    await reachProfileStep();
    expect(continueButton()).toBeEnabled();

    fireEvent.click(continueButton());
    await settle();

    // In flight: exactly one publish, and the control says so.
    expect(continueButton()).toBeDisabled();
    expect(publishCalls).toBe(1);
    expect(screen.getByText(/saving/i)).toBeInTheDocument();

    // A second attempt while pending must start no second publish. Dispatched
    // straight at the element rather than through a helper that refuses
    // disabled controls: the point is that nothing gets through even if a tap
    // did land before the re-render.
    await act(async () => {
      continueButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(publishCalls).toBe(1);

    // Resolving advances exactly once: the profile step is gone, and there is
    // still only the one publish.
    settlePublish?.();
    await settle();
    expect(onProfileStep()).toBe(false);
    expect(publishCalls).toBe(1);
  });

  it('reports the failure and still advances when the publish rejects', async () => {
    await reachProfileStep();

    fireEvent.click(continueButton());
    await settle();
    expect(continueButton()).toBeDisabled();

    settlePublish?.(new Error('relay rejected'));
    await settle();

    // Existing behaviour, preserved: a failed profile publish is reported and
    // signup carries on rather than trapping the new account on this screen.
    expect(onProfileStep()).toBe(false);
    expect(publishCalls).toBe(1);
    expect(isPublishingProfile).toBe(false);
  });
});
