import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useNostrLogin } from '@nostrify/react/login';
import { getPublicKey, nip19 } from 'nostr-tools';
import * as nip49 from 'nostr-tools/nip49';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AutoLock } from '@/components/AutoLock';
import { KeySafetyDialog } from '@/components/auth/KeySafetyDialog';
import LoginDialog from '@/components/auth/LoginDialog';
import { LogoutCleanup } from '@/components/LogoutCleanup';
import { useLoginActions } from '@/hooks/useLoginActions';
import { markNewKey } from '@/lib/keyBackup';
import { lockedNcryptsec, lockNow, recordedNcryptsec, recordNcryptsec, setAutoLockMinutes, setKeyLock } from '@/lib/keyLock';
import { BackupKeySection } from '@/pages/ProfileSettings';
import { TestApp } from '@/test/TestApp';

vi.mock('@/lib/keyLock', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/keyLock')>()),
  lockNow: vi.fn(),
}));

const account = (fill: number, password = 'correct horse battery') => {
  const sk = new Uint8Array(32).fill(fill);
  return {
    pubkey: getPublicKey(sk),
    nsec: nip19.nsecEncode(sk),
    password,
    ncryptsec: nip49.encrypt(sk, password, 4),
  };
};

const a = account(1);
const b = account(2);

function useHarness() {
  return { actions: useLoginActions(), login: useNostrLogin() };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(lockNow).mockClear();
});

describe('key safety', () => {
  it('forgets the ncryptsec and lock flag when the account logs out', async () => {
    const { result } = renderHook(() => useHarness(), {
      wrapper: ({ children }) => <TestApp><LogoutCleanup />{children}</TestApp>,
    });
    await waitFor(() => expect(result.current).not.toBeNull());

    act(() => result.current.actions.nsec(a.nsec));
    recordNcryptsec(a.pubkey, a.ncryptsec);
    setKeyLock(a.pubkey, a.ncryptsec);

    act(() => result.current.login.removeLogin(result.current.login.logins[0].id));

    await waitFor(() => {
      expect(recordedNcryptsec(a.pubkey)).toBeNull();
      expect(lockedNcryptsec(a.pubkey)).toBeNull();
    });
  });

  it("doesn't carry a revealed key over to the next account", async () => {
    recordNcryptsec(a.pubkey, a.ncryptsec);
    recordNcryptsec(b.pubkey, b.ncryptsec);
    let harness: ReturnType<typeof useHarness> | undefined;
    function Capture() {
      harness = useHarness();
      return null;
    }
    render(<TestApp><Capture /><BackupKeySection /></TestApp>);
    await waitFor(() => expect(harness).toBeDefined());
    act(() => harness!.actions.nsec(b.nsec));
    act(() => harness!.actions.nsec(a.nsec));

    fireEvent.click(await screen.findByRole('button', { name: 'Reveal' }));
    fireEvent.change(screen.getByLabelText("Your backup's password"), { target: { value: a.password } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Reveal' }).at(-1)!);
    await waitFor(() => expect(screen.getByDisplayValue(a.nsec)).toBeInTheDocument());

    act(() => harness!.login.setLogin(`nsec:${b.pubkey}`));

    await waitFor(() => expect(screen.queryByDisplayValue(a.nsec)).not.toBeInTheDocument());
    expect(screen.queryByDisplayValue(b.nsec)).not.toBeInTheDocument();
  });

  it.each([
    ['reminder', undefined],
    ['logout warning', () => {}],
  ])("keeps a password-protected key's plain nsec out of the %s", async (_, onLogout) => {
    markNewKey(a.pubkey, false);
    recordNcryptsec(a.pubkey, a.ncryptsec);
    render(
      <TestApp>
        <KeySafetyDialog open onOpenChange={() => {}} nsec={a.nsec} pubkey={a.pubkey} onLogout={onLogout} />
      </TestApp>,
    );
    await screen.findByRole('dialog');
    expect(screen.queryByDisplayValue(a.nsec)).not.toBeInTheDocument();
    expect(screen.getByDisplayValue(a.ncryptsec)).toBeInTheDocument();
  });

  it('keeps the lock when a locked account logs in again with its plain nsec', async () => {
    setKeyLock(a.pubkey, a.ncryptsec);
    render(<TestApp><LoginDialog isOpen onClose={() => {}} onLogin={() => {}} /></TestApp>);
    fireEvent.change(await screen.findByPlaceholderText('nsec, ncryptsec or bunker://'), { target: { value: a.nsec } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(localStorage.getItem('test-login')).toContain(a.pubkey));
    expect(lockedNcryptsec(a.pubkey)).toBe(a.ncryptsec);
  });

  it('auto-locks when a locked account is logged in but not active', async () => {
    let harness: ReturnType<typeof useHarness> | undefined;
    function Capture() {
      harness = useHarness();
      return null;
    }
    render(<TestApp><Capture /><AutoLock /></TestApp>);
    await waitFor(() => expect(harness).toBeDefined());
    vi.useFakeTimers();
    setAutoLockMinutes(1);
    act(() => harness!.actions.nsec(b.nsec));
    act(() => harness!.actions.nsec(a.nsec));
    act(() => setKeyLock(b.pubkey, b.ncryptsec));

    await act(() => vi.advanceTimersByTimeAsync(2 * 60_000));
    expect(lockNow).toHaveBeenCalled();
  });
});
