import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { AIProviderProfile } from './useAIProviders';
import { useAIProviders } from './useAIProviders';

const STORAGE_KEY = 'ditto:ai-providers';
const PUBKEY_A = 'aa'.repeat(32);
const PUBKEY_B = 'bb'.repeat(32);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Mocks ─────────────────────────────────────────────────────────────────
// The hook under test must never touch real Nostr relays: the encrypted-
// settings hook is replaced with a controllable spy. This mirrors the
// `vi.mock('@nostrify/react')` pattern from useAuthor.test.tsx — the mock
// factory is evaluated lazily, so referencing the spies declared above is safe.
const updateSettingsSpy = vi.fn<(patch: unknown) => Promise<unknown>>(async () => ({}));
const syncSettingsSpy = vi.fn<(patch: unknown) => Promise<unknown>>(async () => ({}));
const initializeSettingsSpy = vi.fn<() => Promise<unknown>>(async () => {});
const mockUseEncryptedSettings = vi.fn<() => MockEncryptedSettings>();

vi.mock('@/hooks/useEncryptedSettings', () => ({
  useEncryptedSettings: () => mockUseEncryptedSettings(),
  getLocalSettingsSync: () => 0,
  setLocalSettingsSync: () => {},
}));

// The hook sources the signed-in pubkey from useCurrentUser; the mock is
// switched between accounts in the isolation tests below.
const mockUseCurrentUser = vi.fn<() => { user: { pubkey: string } | undefined }>();

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}));

interface MockUpdateSettings {
  mutate: typeof updateSettingsSpy;
  mutateAsync: typeof updateSettingsSpy;
  isPending: boolean;
}

interface MockEncryptedSettings {
  settings?: { aiProviderProfiles?: AIProviderProfile[] };
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  updateSettings: MockUpdateSettings;
  syncSettings: MockUpdateSettings;
  initializeSettings: typeof initializeSettingsSpy;
  hasNip44Support: boolean;
  lastSync: number | undefined;
  recentlyWritten: () => boolean;
}

function defaultEncryptedSettings(
  overrides: Partial<MockEncryptedSettings> = {},
): MockEncryptedSettings {
  return {
    settings: undefined,
    isLoading: false,
    isError: false,
    error: null,
    updateSettings: { mutate: updateSettingsSpy, mutateAsync: updateSettingsSpy, isPending: false },
    syncSettings: { mutate: syncSettingsSpy, mutateAsync: syncSettingsSpy, isPending: false },
    initializeSettings: initializeSettingsSpy,
    hasNip44Support: true,
    lastSync: undefined,
    recentlyWritten: () => false,
    ...overrides,
  };
}

// ─── Fixtures ───────────────────────────────────────────────────────────────
type ProfileInput = Omit<AIProviderProfile, 'id'>;

function makeInput(overrides: Partial<ProfileInput> = {}): ProfileInput {
  return {
    kind: 'openrouter',
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: 'sk-test',
    models: [{ id: 'model-1', name: 'Model 1', contextWindow: 128000 }],
    syncEnabled: false,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<AIProviderProfile> = {}): AIProviderProfile {
  return { ...makeInput(), id: crypto.randomUUID(), ...overrides };
}

function seedLocalStorage(profiles: AIProviderProfile[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

function readLocalStorage(): AIProviderProfile[] {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as AIProviderProfile[];
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// ─── Tests ──────────────────────────────────────────────────────────────────
describe('useAIProviders', () => {
  beforeEach(() => {
    localStorage.clear();
    updateSettingsSpy.mockReset();
    updateSettingsSpy.mockResolvedValue({});
    syncSettingsSpy.mockReset();
    syncSettingsSpy.mockResolvedValue({});
    initializeSettingsSpy.mockReset();
    initializeSettingsSpy.mockResolvedValue(undefined);
    mockUseEncryptedSettings.mockReset();
    mockUseEncryptedSettings.mockReturnValue(defaultEncryptedSettings());
    mockUseCurrentUser.mockReset();
    mockUseCurrentUser.mockReturnValue({ user: undefined });
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('addProfile generates a UUID id, persists to localStorage, and appears in profiles', () => {
    const { result } = renderHook(() => useAIProviders(), { wrapper });

    const input: ProfileInput = makeInput({
      kind: 'deepseek',
      name: 'DeepSeek',
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: 'sk-deepseek',
      models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }],
    });

    let created: AIProviderProfile | undefined;
    act(() => {
      created = result.current.addProfile(input);
    });

    expect(created?.id).toMatch(UUID_RE);
    expect(created).toMatchObject(input);
    expect(result.current.profiles).toEqual([created]);
    expect(readLocalStorage()).toEqual([created]);
    expect(result.current.isLoading).toBe(false);

    // A second add must get a distinct id.
    let second: AIProviderProfile | undefined;
    act(() => {
      second = result.current.addProfile(makeInput({ name: 'Another' }));
    });
    expect(second?.id).not.toBe(created?.id);
    expect(result.current.profiles).toHaveLength(2);
  });

  it('updateProfile patches an existing profile by id and persists without changing the id', async () => {
    const original = makeProfile({ name: 'Old Name', apiKey: 'sk-old' });
    seedLocalStorage([original]);

    const { result } = renderHook(() => useAIProviders(), { wrapper });
    await waitFor(() => expect(result.current.profiles).toHaveLength(1));

    act(() => {
      result.current.updateProfile(original.id, { name: 'New Name' });
    });

    expect(result.current.profiles[0]).toEqual({ ...original, name: 'New Name' });
    expect(result.current.profiles[0].id).toBe(original.id);
    expect(readLocalStorage()[0]).toEqual({ ...original, name: 'New Name' });
  });

  it('deleteProfile removes a profile from profiles and from localStorage', async () => {
    const a = makeProfile({ name: 'A' });
    const b = makeProfile({ name: 'B' });
    seedLocalStorage([a, b]);

    const { result } = renderHook(() => useAIProviders(), { wrapper });
    await waitFor(() => expect(result.current.profiles).toHaveLength(2));

    act(() => {
      result.current.deleteProfile(a.id);
    });

    expect(result.current.profiles.map((p) => p.id)).toEqual([b.id]);
    expect(readLocalStorage().map((p) => p.id)).toEqual([b.id]);
  });

  it('deleteProfile with syncEnabled true pushes the remaining synced profiles to the blob without the deleted id', async () => {
    const synced = makeProfile({ name: 'Synced', syncEnabled: true });
    const other = makeProfile({ name: 'Other', syncEnabled: true });
    seedLocalStorage([synced, other]);

    const { result } = renderHook(() => useAIProviders(), { wrapper });
    await waitFor(() => expect(result.current.profiles).toHaveLength(2));
    syncSettingsSpy.mockClear();

    act(() => {
      result.current.deleteProfile(synced.id);
    });

    await waitFor(() => expect(syncSettingsSpy).toHaveBeenCalled());
    const calls = syncSettingsSpy.mock.calls.map(
      (call) => call[0] as { aiProviderProfiles?: AIProviderProfile[] },
    );
    expect(
      calls.every((patch) => !patch.aiProviderProfiles?.some((p) => p.id === synced.id)),
    ).toBe(true);
    // The blob is told about the remaining synced profile.
    expect(calls[calls.length - 1].aiProviderProfiles?.map((p) => p.id)).toEqual([other.id]);
    expect(readLocalStorage().map((p) => p.id)).toEqual([other.id]);
  });

  it('duplicateProfile clones with a new id, the caller-supplied name, and syncEnabled forced false', async () => {
    const original = makeProfile({
      kind: 'openai-compatible',
      name: 'My Provider',
      baseURL: 'https://llm.example.com/v1',
      apiKey: 'sk-abc',
      models: [
        { id: 'gpt-4o-mini', name: 'GPT-4o mini', contextWindow: 128000 },
        { id: 'gpt-4o', name: 'GPT-4o' },
      ],
      syncEnabled: true,
    });
    seedLocalStorage([original]);

    const { result } = renderHook(() => useAIProviders(), { wrapper });
    await waitFor(() => expect(result.current.profiles).toHaveLength(1));

    act(() => {
      result.current.duplicateProfile(original.id, 'My Provider (copy)');
    });

    expect(result.current.profiles).toHaveLength(2);
    const copy = result.current.profiles.find((p) => p.id !== original.id);
    expect(copy).toBeDefined();
    expect(copy!.id).toMatch(UUID_RE);
    expect(copy!.id).not.toBe(original.id);
    expect(copy!.name).toBe('My Provider (copy)');
    expect(copy!.kind).toBe(original.kind);
    expect(copy!.baseURL).toBe(original.baseURL);
    expect(copy!.apiKey).toBe(original.apiKey);
    expect(copy!.models).toEqual(original.models);
    expect(copy!.syncEnabled).toBe(false);

    // The original profile is untouched.
    const storedOriginal = readLocalStorage().find((p) => p.id === original.id);
    expect(storedOriginal?.syncEnabled).toBe(true);
    expect(storedOriginal?.name).toBe('My Provider');
  });

  it('addProfile with syncEnabled true sends exactly that profile to the encrypted blob', async () => {
    const { result } = renderHook(() => useAIProviders(), { wrapper });

    let created: AIProviderProfile | undefined;
    act(() => {
      created = result.current.addProfile(makeInput({ name: 'Synced', syncEnabled: true }));
    });

    await waitFor(() => expect(syncSettingsSpy).toHaveBeenCalled());
    const patch = syncSettingsSpy.mock.calls[0][0] as { aiProviderProfiles?: AIProviderProfile[] };
    expect(patch.aiProviderProfiles).toEqual([created]);
  });

  it('never sends a non-syncEnabled profile to the encrypted blob', async () => {
    const { result } = renderHook(() => useAIProviders(), { wrapper });

    let created: AIProviderProfile | undefined;
    act(() => {
      created = result.current.addProfile(makeInput({ name: 'Local Only', syncEnabled: false }));
    });
    await waitFor(() => expect(result.current.profiles).toHaveLength(1));

    const calls = syncSettingsSpy.mock.calls.map(
      (call) => call[0] as { aiProviderProfiles?: AIProviderProfile[] },
    );
    expect(
      calls.every((patch) => !patch.aiProviderProfiles?.some((p) => p.id === created!.id)),
    ).toBe(true);
  });

  it('toggles a profile into the blob when syncEnabled flips to true via updateProfile', async () => {
    const local = makeProfile({ name: 'Local Only', syncEnabled: false });
    seedLocalStorage([local]);

    const { result } = renderHook(() => useAIProviders(), { wrapper });
    await waitFor(() => expect(result.current.profiles).toHaveLength(1));
    syncSettingsSpy.mockClear();

    act(() => {
      result.current.updateProfile(local.id, { syncEnabled: true });
    });

    await waitFor(() => expect(syncSettingsSpy).toHaveBeenCalled());
    const patch = syncSettingsSpy.mock.calls[0][0] as { aiProviderProfiles?: AIProviderProfile[] };
    expect(patch.aiProviderProfiles).toHaveLength(1);
    expect(patch.aiProviderProfiles?.[0]).toEqual(
      expect.objectContaining({ id: local.id, syncEnabled: true }),
    );
  });

  it('toggles a profile out of the blob when syncEnabled flips to false via updateProfile', async () => {
    const synced = makeProfile({ name: 'Synced', syncEnabled: true });
    seedLocalStorage([synced]);

    const { result } = renderHook(() => useAIProviders(), { wrapper });
    await waitFor(() => expect(result.current.profiles).toHaveLength(1));
    syncSettingsSpy.mockClear();

    act(() => {
      result.current.updateProfile(synced.id, { syncEnabled: false });
    });
    await waitFor(() => expect(result.current.profiles[0].syncEnabled).toBe(false));

    // Flipping sync off must push the profile out of the encrypted blob, or
    // the merge-on-load effect would resurrect it (with its old API key).
    await waitFor(() => expect(syncSettingsSpy).toHaveBeenCalled());
    const calls = syncSettingsSpy.mock.calls.map(
      (call) => call[0] as { aiProviderProfiles?: AIProviderProfile[] },
    );
    const finalPatch = calls[calls.length - 1];
    expect(finalPatch.aiProviderProfiles?.map((p) => p.id) ?? []).not.toContain(synced.id);
    // The blob payload matches local state: the profile is no longer synced.
    expect(finalPatch.aiProviderProfiles).toEqual([]);
    expect(readLocalStorage()[0].syncEnabled).toBe(false);
  });

  it('flips syncEnabled on then off and keeps the final blob payload in sync with local state', async () => {
    const local = makeProfile({ name: 'Local Only', syncEnabled: false });
    seedLocalStorage([local]);

    const { result } = renderHook(() => useAIProviders(), { wrapper });
    await waitFor(() => expect(result.current.profiles).toHaveLength(1));
    syncSettingsSpy.mockClear();

    act(() => {
      result.current.updateProfile(local.id, { syncEnabled: true });
    });
    await waitFor(() => expect(syncSettingsSpy).toHaveBeenCalled());
    syncSettingsSpy.mockClear();

    act(() => {
      result.current.updateProfile(local.id, { syncEnabled: false });
    });
    await waitFor(() => expect(syncSettingsSpy).toHaveBeenCalled());

    const calls = syncSettingsSpy.mock.calls.map(
      (call) => call[0] as { aiProviderProfiles?: AIProviderProfile[] },
    );
    const finalPatch = calls[calls.length - 1];
    // Local state has the profile with sync off; the final blob payload must
    // reflect that the profile is not part of the synced set.
    expect(finalPatch.aiProviderProfiles?.map((p) => p.id) ?? []).not.toContain(local.id);
    expect(readLocalStorage()[0]).toMatchObject({ id: local.id, syncEnabled: false });
  });

  it('does not resurrect a stale blob entry over a local profile whose sync is off', async () => {
    const local = makeProfile({
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Local Name',
      baseURL: 'http://local.example',
      apiKey: 'sk-local',
      syncEnabled: false,
    });
    seedLocalStorage([local]);

    // The blob still holds a stale copy of the same profile from before the
    // user turned sync off (e.g. the removal failed to publish). The local
    // off-toggle must win: the stale entry must not overwrite the local
    // profile, restore the old API key, or flip sync back on.
    const staleBlob: AIProviderProfile = {
      ...local,
      name: 'Stale Blob Name',
      apiKey: 'sk-stale',
      syncEnabled: true,
    };
    mockUseEncryptedSettings.mockReturnValue(
      defaultEncryptedSettings({ settings: { aiProviderProfiles: [staleBlob] } }),
    );

    const { result } = renderHook(() => useAIProviders(), { wrapper });

    await waitFor(() => expect(result.current.profiles).toHaveLength(1));
    expect(result.current.profiles[0]).toMatchObject({
      id: local.id,
      name: 'Local Name',
      apiKey: 'sk-local',
      syncEnabled: false,
    });
    expect(readLocalStorage()[0]).toMatchObject({
      id: local.id,
      name: 'Local Name',
      apiKey: 'sk-local',
      syncEnabled: false,
    });
  });

  it('lets the encrypted-blob version win for a profile id that also exists locally', async () => {
    const local = makeProfile({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Local Name',
      baseURL: 'http://local.example',
      apiKey: 'sk-local',
      syncEnabled: true,
    });
    seedLocalStorage([local]);

    const remote: AIProviderProfile = {
      ...local,
      name: 'Remote Name',
      baseURL: 'http://remote.example',
      apiKey: 'sk-remote',
    };
    mockUseEncryptedSettings.mockReturnValue(
      defaultEncryptedSettings({ settings: { aiProviderProfiles: [remote] } }),
    );

    const { result } = renderHook(() => useAIProviders(), { wrapper });

    await waitFor(() => expect(result.current.profiles[0].name).toBe('Remote Name'));
    expect(result.current.profiles[0].baseURL).toBe('http://remote.example');
    expect(result.current.profiles[0].apiKey).toBe('sk-remote');
    expect(result.current.profiles[0].id).toBe(local.id);
    // The merged blob version is persisted back into localStorage.
    expect(readLocalStorage()).toEqual([remote]);
  });

  it('merges blob-only profiles in and leaves non-synced local profiles untouched', async () => {
    const localOnly = makeProfile({ name: 'Local Only', syncEnabled: false });
    seedLocalStorage([localOnly]);

    const blobOnly = makeProfile({ name: 'From Blob', syncEnabled: true });
    mockUseEncryptedSettings.mockReturnValue(
      defaultEncryptedSettings({ settings: { aiProviderProfiles: [blobOnly] } }),
    );

    const { result } = renderHook(() => useAIProviders(), { wrapper });

    await waitFor(() => expect(result.current.profiles).toHaveLength(2));
    expect(result.current.profiles.map((p) => p.name).sort()).toEqual(['From Blob', 'Local Only']);
    expect(readLocalStorage().map((p) => p.name).sort()).toEqual(['From Blob', 'Local Only']);
  });

  it('propagates a blob deletion: a present-but-empty blob removes sync-enabled local profiles', async () => {
    const synced = makeProfile({ name: 'Synced', syncEnabled: true });
    seedLocalStorage([synced]);

    // Device A deleted every synced profile and the empty list synced to the
    // blob. Device B must drop its stale sync-enabled local profile instead
    // of treating the empty array as "nothing to merge".
    mockUseEncryptedSettings.mockReturnValue(
      defaultEncryptedSettings({ settings: { aiProviderProfiles: [] } }),
    );

    const { result } = renderHook(() => useAIProviders(), { wrapper });

    await waitFor(() => expect(result.current.profiles).toEqual([]));
    expect(readLocalStorage()).toEqual([]);
  });

  it('keeps non-synced local profiles when the blob is empty', async () => {
    const localOnly = makeProfile({ name: 'Local Only', syncEnabled: false });
    seedLocalStorage([localOnly]);

    mockUseEncryptedSettings.mockReturnValue(
      defaultEncryptedSettings({ settings: { aiProviderProfiles: [] } }),
    );

    const { result } = renderHook(() => useAIProviders(), { wrapper });

    await waitFor(() => expect(result.current.profiles.map((p) => p.name)).toEqual(['Local Only']));
    expect(readLocalStorage().map((p) => p.name)).toEqual(['Local Only']);
  });

  it('works purely from localStorage when hasNip44Support is false', async () => {
    mockUseEncryptedSettings.mockReturnValue(defaultEncryptedSettings({ hasNip44Support: false }));

    const { result } = renderHook(() => useAIProviders(), { wrapper });

    let created: AIProviderProfile | undefined;
    expect(() => {
      act(() => {
        created = result.current.addProfile(makeInput({ syncEnabled: true }));
      });
    }).not.toThrow();
    expect(created?.syncEnabled).toBe(true);
    expect(readLocalStorage()).toEqual([created]);

    expect(() => {
      act(() => {
        result.current.updateProfile(created!.id, { name: 'Renamed' });
      });
    }).not.toThrow();
    expect(readLocalStorage()[0].name).toBe('Renamed');

    expect(() => {
      act(() => {
        result.current.deleteProfile(created!.id);
      });
    }).not.toThrow();
    expect(readLocalStorage()).toEqual([]);
    expect(result.current.profiles).toEqual([]);
  });

  it('scopes provider profiles to the signed-in pubkey and reloads on account switch', async () => {
    mockUseCurrentUser.mockReturnValue({ user: { pubkey: PUBKEY_A } });
    const { result, rerender } = renderHook(() => useAIProviders(), { wrapper });

    act(() => {
      result.current.addProfile(makeInput({ name: 'Account A Secret', apiKey: 'sk-a' }));
    });
    expect(result.current.profiles.map((p) => p.name)).toEqual(['Account A Secret']);

    // Switching to account B must not expose A's profile.
    mockUseCurrentUser.mockReturnValue({ user: { pubkey: PUBKEY_B } });
    rerender();
    await waitFor(() => expect(result.current.profiles).toEqual([]));

    // B saves its own profile; A's data stays untouched underneath.
    act(() => {
      result.current.addProfile(makeInput({ name: 'Account B Secret', apiKey: 'sk-b' }));
    });
    expect(result.current.profiles.map((p) => p.name)).toEqual(['Account B Secret']);

    // Switching back to A restores A's profile and hides B's.
    mockUseCurrentUser.mockReturnValue({ user: { pubkey: PUBKEY_A } });
    rerender();
    await waitFor(() => expect(result.current.profiles.map((p) => p.name)).toEqual(['Account A Secret']));
    expect(result.current.profiles[0].apiKey).toBe('sk-a');
  });

  it('stores profiles under the per-pubkey key, never the shared unscoped key', async () => {
    mockUseCurrentUser.mockReturnValue({ user: { pubkey: PUBKEY_A } });
    const { result } = renderHook(() => useAIProviders(), { wrapper });

    act(() => {
      result.current.addProfile(makeInput({ name: 'Secret A', apiKey: 'sk-a' }));
    });

    const scopedA = JSON.parse(localStorage.getItem(`ditto:ai-providers-${PUBKEY_A}`) ?? '[]') as AIProviderProfile[];
    expect(scopedA.map((p) => p.name)).toEqual(['Secret A']);
    // The unscoped key must stay empty; nothing may be written there anymore.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
