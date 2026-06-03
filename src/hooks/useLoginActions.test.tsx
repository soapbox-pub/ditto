import { describe, it, expect } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { generateSecretKey, nip19, getPublicKey } from 'nostr-tools';
import { useNostrLogin } from '@nostrify/react/login';

import { TestApp } from '@/test/TestApp';
import { useLoginActions } from './useLoginActions';

/**
 * Regression test: adding a second login while one is already logged in
 * must switch the current user to the new login (logins[0]). Without the
 * fix, addLogin appends the new login to the end of the array and
 * logins[0] remains the previously-logged-in user — leading to the
 * destructive bug where the signup profile step signs kind 0 metadata
 * with the *original* user's signer, overwriting their profile.
 */
describe('useLoginActions auto-switch', () => {
  it('promotes the newly added nsec login to logins[0]', async () => {
    const nsec1 = nip19.nsecEncode(generateSecretKey());
    const sk2 = generateSecretKey();
    const nsec2 = nip19.nsecEncode(sk2);
    const pubkey2 = getPublicKey(sk2);

    const { result } = renderHook(
      () => ({
        actions: useLoginActions(),
        login: useNostrLogin(),
      }),
      { wrapper: TestApp },
    );

    // NostrLoginProvider renders null while it reads logins from storage,
    // so wait for the provider to mount.
    await waitFor(() => expect(result.current).not.toBeNull());

    act(() => {
      result.current.actions.nsec(nsec1);
    });

    expect(result.current.login.logins).toHaveLength(1);

    act(() => {
      result.current.actions.nsec(nsec2);
    });

    expect(result.current.login.logins).toHaveLength(2);
    // The newly added login MUST be at index 0 (current user).
    expect(result.current.login.logins[0].pubkey).toBe(pubkey2);
  });
});
