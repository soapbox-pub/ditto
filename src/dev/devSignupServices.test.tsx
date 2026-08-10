import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useDevSignupServices } from './devSignupServices';
import {
  DEV_SIGNUP_PUBKEY,
  endDevSignupSession,
  readDevSignupSession,
  readDevSignupViolations,
  resetDevSignupViolations,
  startDevSignupInteractive,
} from './devSignupArrival';

/**
 * The rehearsal's central promise: the real signup screens run, and **nothing
 * leaves the machine**.
 *
 * Zero keys, zero accounts, zero signer calls, zero publishes, zero settings
 * writes. The signer half of that is enforced by `devSignupUser` (every method
 * throws) and covered in `devSignupArrival.test.ts`; this covers the services
 * half — the four operations signup would otherwise perform itself.
 */
describe('useDevSignupServices — the rehearsal has no effects', () => {
  beforeEach(() => {
    endDevSignupSession();
    resetDevSignupViolations();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  function services() {
    return renderHook(() => useDevSignupServices()).result.current;
  }

  it('generates an identity with no usable key', () => {
    const account = services().generateAccount();

    expect(account.pubkey).toBe(DEV_SIGNUP_PUBKEY);
    expect(account.nsec).toBeUndefined();
    // Displayed on the key screen, and unmistakably not a key: it never decodes,
    // never signs, and is never handed to the credential manager.
    expect(account.secretDisplay).toContain('DEV-FAKE');
    expect(account.secretDisplay).not.toMatch(/^nsec1[a-z0-9]{20,}$/);
  });

  it('makes the account available at the key step, without touching the real login store', async () => {
    startDevSignupInteractive();
    expect(readDevSignupSession().active).toBe(false);

    // This is the ordering the arrival handoff depends on: production logs in
    // here, three screens before signup finishes.
    const result = await services().persistAccount(
      { secretDisplay: 'x', pubkey: DEV_SIGNUP_PUBKEY },
      'Ditto',
    );

    expect(result).toBe('dismissed');
    expect(readDevSignupSession().active).toBe(true);
    expect(readDevSignupSession().stage).toBe('signup-pending');
    expect(readDevSignupViolations().accountChanges).toBe(0);
  });

  it('absorbs the profile and follow publishes and records what production would have sent', async () => {
    const dev = services();

    // Deliberately resolving rather than throwing: the screens must behave
    // exactly as they do in production, and a rejection here would surface a
    // "Profile failed" toast that says nothing true about the code under review.
    await expect(dev.publishProfile({ name: 'Ada', about: '' })).resolves.toBeUndefined();
    await expect(
      dev.publishFollows({ content: '', tags: [['p', 'a'.repeat(64)], ['p', 'b'.repeat(64)]] }),
    ).resolves.toBeUndefined();

    const { intercepted, relayPublishes, signerCalls, settingsWrites } = readDevSignupViolations();
    expect(relayPublishes).toBe(0);
    expect(signerCalls).toBe(0);
    expect(settingsWrites).toBe(0);
    expect(intercepted).toEqual([
      'kind 0 not sent — fields: name, about',
      'kind 3 not sent — 2 follows',
    ]);
  });

  it('reports no publish in flight, because none of them reach the network', () => {
    // The seam requires a pending flag; the fake resolves within the same
    // microtask, so there is no in-flight window to report. Inventing one would
    // make the rehearsal test a delay this tool made up.
    expect(services().isPublishingProfile).toBe(false);
  });

  it("is identity-stable, so signup's callbacks do not churn", () => {
    const { result, rerender } = renderHook(() => useDevSignupServices());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
