import { getPublicKey, nip19 } from 'nostr-tools';
import * as nip49 from 'nostr-tools/nip49';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { NostrLoginProvider, useNostrLogin } from '@nostrify/react/login';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AutoLock } from '@/components/AutoLock';
import { LogoutCleanup } from '@/components/LogoutCleanup';
import {
  forgetKeyLock,
  lockedNcryptsec,
  openLoginList,
  sealLoginList,
  SEALED_LOGIN_TYPE,
  setKeyLock,
  useUnlockRequest,
  type UnlockRequest,
} from '@/lib/keyLock';
import { LOGIN_STORAGE_KEY, loginStorage } from '@/lib/secureStorage';

vi.mock('@/hooks/useAppContext', () => ({ useAppContext: () => ({ config: { appId: 'test' } }) }));

const account = (fill: number, password: string) => {
  const sk = new Uint8Array(32).fill(fill);
  const pubkey = getPublicKey(sk);
  return {
    pubkey,
    nsec: nip19.nsecEncode(sk),
    ncryptsec: nip49.encrypt(sk, password, 4),
    login: { id: `nsec:${pubkey}`, type: 'nsec', pubkey, createdAt: '2026-01-01', data: { nsec: nip19.nsecEncode(sk) } },
  };
};

let currentRequest: () => UnlockRequest | null = () => null;

beforeEach(() => {
  localStorage.clear();
  const hook = renderHook(() => useUnlockRequest());
  currentRequest = () => hook.result.current;
});

async function nextRequest(previous: UnlockRequest | undefined): Promise<UnlockRequest> {
  let found: UnlockRequest | null = null;
  await waitFor(() => {
    found = currentRequest();
    expect(found && found !== previous).toBe(true);
  });
  return found!;
}

/** Answer each unlock request in turn; `'forget'` drops that account. */
async function openWith(stored: string, answers: string[]): Promise<{ result: string | null; asked: UnlockRequest[] }> {
  const asked: UnlockRequest[] = [];
  const pending = openLoginList(stored);
  let answered: UnlockRequest | undefined;
  for (const answer of answers) {
    const request = await nextRequest(answered);
    if (!asked.includes(request)) asked.push(request);
    if (answer === 'forget') {
      act(() => request.forget());
      answered = request;
    } else if ((await act(() => request.unlock(answer))) === 'ok') {
      answered = request;
    }
  }
  return { result: await pending, asked };
}

describe('keyLock', () => {
  it("writes a locked account's login as its ncryptsec only", () => {
    const a = account(1, 'pw-a');
    const b = account(2, 'pw-b');
    setKeyLock(a.pubkey, a.ncryptsec);
    const sealed = sealLoginList(JSON.stringify([a.login, b.login]));
    expect(sealed).not.toContain(a.nsec);
    expect(sealed).toContain(b.nsec);
    expect(JSON.parse(sealed)[0]).toMatchObject({ type: SEALED_LOGIN_TYPE, pubkey: a.pubkey, data: { ncryptsec: a.ncryptsec } });
  });

  it('leaves a list with nothing locked untouched', async () => {
    const value = JSON.stringify([account(1, 'pw').login]);
    expect(sealLoginList(value)).toBe(value);
    expect(await openLoginList(value)).toBe(value);
  });

  it('opens a sealed login once its password is given', async () => {
    const a = account(1, 'pw-a');
    setKeyLock(a.pubkey, a.ncryptsec);
    const stored = sealLoginList(JSON.stringify([a.login]));
    const { result } = await openWith(stored, ['wrong', 'pw-a']);
    expect(JSON.parse(result!)).toEqual([a.login]);
  });

  it('asks once for accounts sharing a password', async () => {
    const a = account(1, 'shared');
    const b = account(2, 'shared');
    setKeyLock(a.pubkey, a.ncryptsec);
    setKeyLock(b.pubkey, b.ncryptsec);
    const stored = sealLoginList(JSON.stringify([a.login, b.login]));
    const { result, asked } = await openWith(stored, ['shared']);
    expect(asked).toHaveLength(1);
    expect(JSON.parse(result!)).toEqual([a.login, b.login]);
  });

  it('drops a forgotten account and its lock', async () => {
    const a = account(1, 'pw-a');
    const b = account(2, 'pw-b');
    setKeyLock(a.pubkey, a.ncryptsec);
    const stored = sealLoginList(JSON.stringify([a.login, b.login]));
    const { result } = await openWith(stored, ['forget']);
    expect(JSON.parse(result!)).toEqual([b.login]);
    expect(lockedNcryptsec(a.pubkey)).toBeNull();
  });

  it('restores the lock flag from the store when localStorage lost it', async () => {
    const a = account(1, 'pw-a');
    setKeyLock(a.pubkey, a.ncryptsec);
    const stored = sealLoginList(JSON.stringify([a.login]));
    localStorage.clear();
    await openWith(stored, ['pw-a']);
    expect(lockedNcryptsec(a.pubkey)).toBe(a.ncryptsec);
  });

  it('leaves out a locked account logged out elsewhere, until it logs in again', () => {
    const a = account(1, 'pw-a');
    const b = account(2, 'pw-b');
    setKeyLock(a.pubkey, a.ncryptsec);
    forgetKeyLock(a.pubkey);
    const written = sealLoginList(JSON.stringify([a.login, b.login]));
    expect(written).not.toContain(a.pubkey);
    expect(JSON.parse(written)).toEqual([b.login]);

    setKeyLock(a.pubkey, null);
    expect(sealLoginList(JSON.stringify([a.login]))).toContain(a.nsec);
  });

  it("doesn't mark a plain account forgotten", () => {
    const a = account(1, 'pw-a');
    forgetKeyLock(a.pubkey);
    expect(sealLoginList(JSON.stringify([a.login]))).toContain(a.nsec);
  });
});

describe('keyLock across tabs', () => {
  type Api = ReturnType<typeof useNostrLogin>;
  let reload: ReturnType<typeof vi.fn>;
  const realLocation = window.location;

  beforeEach(() => {
    reload = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, reload } });
  });
  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  });

  function Expose({ onApi }: { onApi: (api: Api) => void }) {
    onApi(useNostrLogin());
    return null;
  }
  let prompt: UnlockRequest | null = null;
  function Prompt() {
    prompt = useUnlockRequest();
    return null;
  }

  /** One tab: its own login provider, with its own in-memory list, over the shared storage. */
  async function openTab(password: string): Promise<() => Api> {
    let api: Api | undefined;
    prompt = null;
    render(
      <NostrLoginProvider storageKey={LOGIN_STORAGE_KEY} storage={loginStorage} fallback={<Prompt />}>
        <LogoutCleanup />
        <AutoLock />
        <Expose onApi={(next) => { api = next; }} />
      </NostrLoginProvider>,
    );
    await waitFor(() => expect(prompt).not.toBeNull());
    await act(async () => { expect(await prompt!.unlock(password)).toBe('ok'); });
    await waitFor(() => expect(api).toBeDefined());
    return () => api!;
  }

  it("never writes a locked account's nsec to disk after another tab logs it out", async () => {
    const a = account(1, 'pw-a');
    const b = account(2, 'pw-b');
    setKeyLock(a.pubkey, a.ncryptsec);
    await loginStorage.setItem(LOGIN_STORAGE_KEY, JSON.stringify([a.login, b.login]));
    const stored = () => localStorage.getItem(LOGIN_STORAGE_KEY)!;

    const tabA = await openTab('pw-a');
    const tabB = await openTab('pw-a');

    act(() => tabA().removeLogin(a.login.id));
    await waitFor(() => expect(lockedNcryptsec(a.pubkey)).toBeNull());

    // Tab B still holds the key open: it reloads to drop it...
    await waitFor(() => expect(reload).toHaveBeenCalled());
    // ...and a write it makes first leaves the account out.
    act(() => tabB().setLogin(b.login.id));
    await waitFor(() => expect(JSON.parse(stored())).toEqual([b.login]));
    expect(stored()).not.toContain(a.nsec);
  });
});
