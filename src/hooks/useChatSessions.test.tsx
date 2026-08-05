import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useChatSessions, defaultProviderId } from './useChatSessions';
import type { ChatSession } from './useChatSessions';
import type { AIProviderProfile } from '@/hooks/useAIProviders';
import type { PersistedTab } from '@/lib/chatTabsStorage';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// useChatSessions persists to localStorage, so tests must not leak tabs into
// each other's bootstrap state.
beforeEach(() => {
  localStorage.clear();
});

// ─── Fixtures ───────────────────────────────────────────────────────────────
function makeProfile(overrides: Partial<AIProviderProfile> = {}): AIProviderProfile {
  return {
    id: crypto.randomUUID(),
    kind: 'openrouter',
    name: 'Provider',
    baseURL: 'https://api.example.com/v1',
    apiKey: 'sk-test',
    models: [],
    syncEnabled: false,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────
describe('useChatSessions', () => {
  it('bootstraps exactly one default session on first use', () => {
    const { result } = renderHook(() => useChatSessions());

    const { sessions, activeSessionId, activeSession } = result.current;

    expect(sessions).toHaveLength(1);
    expect(activeSessionId).toBe(sessions[0].id);
    expect(activeSession).toBe(sessions[0]);

    expect(sessions[0].abilities).toEqual([]);
    expect(sessions[0].providerId).toBe('shakespeare');
    expect(sessions[0].modelId).toBe('');
    expect(sessions[0].createdAt).toBeInstanceOf(Date);
  });

  it('does not persist anything when no pubkey (logged out) is provided', () => {
    const { result } = renderHook(() => useChatSessions());

    expect(result.current.sessions).toHaveLength(1);
    // No 'anon'-scoped tab may be written: the logged-out page has no UI that
    // could ever reach it, so a persisted record would just be orphaned.
    expect(localStorage.length).toBe(0);

    // createSession also stays in memory only while logged out.
    act(() => {
      result.current.createSession({ abilities: [], providerId: 'shakespeare', modelId: 'm' });
    });
    expect(result.current.sessions).toHaveLength(2);
    expect(localStorage.length).toBe(0);
  });

  it('persists exactly one bootstrap tab under the pubkey scope on mount, matching the active session', () => {
    const pubkey = 'cc'.repeat(32);
    const { result } = renderHook(() => useChatSessions(pubkey));

    expect(result.current.sessions).toHaveLength(1);
    const key = `ditto.ai-chat.tab.v1.${pubkey}.${result.current.activeSessionId}`;
    const stored = JSON.parse(localStorage.getItem(key)!) as { id: string; createdAt: number };
    // The persisted record is the very session the UI holds: metadata patches
    // must land under the same id.
    expect(stored.id).toBe(result.current.activeSessionId);
    expect(stored.createdAt).toBe(result.current.sessions[0].createdAt.getTime());
    // The bootstrap write must run exactly once: no other record in scope.
    expect(localStorage.length).toBe(1);
    expect(localStorage.key(0)).toBe(key);
  });

  it('metadata patches to the bootstrapped session land in storage under the same id', () => {
    const pubkey = 'dd'.repeat(32);
    const { result } = renderHook(() => useChatSessions(pubkey));
    const id = result.current.activeSessionId;

    act(() => {
      result.current.updateSession(id, { title: 'Renamed' });
    });

    const stored = JSON.parse(localStorage.getItem(`ditto.ai-chat.tab.v1.${pubkey}.${id}`)!) as { title: string };
    expect(stored.title).toBe('Renamed');
  });

  it('bootstraps to the first configured provider profile when one exists', () => {
    const profiles = [
      makeProfile({ id: 'provider-a', name: 'My OpenRouter' }),
      makeProfile({ id: 'provider-b', kind: 'deepseek', name: 'DeepSeek' }),
    ];
    const { result } = renderHook(() => useChatSessions(undefined, profiles));

    const { sessions, activeSessionId, activeSession } = result.current;

    expect(sessions).toHaveLength(1);
    expect(activeSessionId).toBe(sessions[0].id);
    expect(activeSession).toBe(sessions[0]);
    expect(sessions[0].providerId).toBe('provider-a');
    expect(sessions[0].modelId).toBe('');
  });

  it('defaultProviderId prefers the first configured profile, else shakespeare', () => {
    const profiles = [
      makeProfile({ id: 'provider-a', name: 'My OpenRouter' }),
      makeProfile({ id: 'provider-b', name: 'DeepSeek' }),
    ];
    expect(defaultProviderId(profiles)).toBe('provider-a');
    expect(defaultProviderId([])).toBe('shakespeare');
    expect(defaultProviderId()).toBe('shakespeare');
  });

  it('createSession appends a fresh-UUID session, makes it active, and returns it', () => {
    const { result } = renderHook(() => useChatSessions());
    const bootstrapId = result.current.activeSessionId;

    let created: ChatSession | undefined;
    act(() => {
      created = result.current.createSession({
        abilities: ['nostr-lookup'],
        providerId: 'shakespeare',
        modelId: 'x',
      });
    });

    expect(created).toBeDefined();
    expect(created!.id).toMatch(UUID_RE);
    expect(created!.id).not.toBe(bootstrapId);
    expect(created!.abilities).toEqual(['nostr-lookup']);
    expect(created!.providerId).toBe('shakespeare');
    expect(created!.modelId).toBe('x');
    expect(created!.createdAt).toBeInstanceOf(Date);

    // The created session is appended and immediately becomes active.
    expect(result.current.sessions).toHaveLength(2);
    expect(result.current.sessions[1]).toBe(created);
    expect(result.current.activeSessionId).toBe(created!.id);
    expect(result.current.activeSession).toBe(created);
  });

  it('updateSession patches only the requested fields and merges into the session', () => {
    const { result } = renderHook(() => useChatSessions());
    const id = result.current.activeSessionId;

    act(() => {
      result.current.updateSession(id, { providerId: 'openrouter', modelId: 'model-x' });
    });

    const session = result.current.sessions.find((s) => s.id === id);
    expect(session?.providerId).toBe('openrouter');
    expect(session?.modelId).toBe('model-x');
    // Fields outside the patch are preserved by the merge.
    expect(session?.abilities).toEqual([]);
    expect(session?.title).toBe('');
  });

  it('updateSession patches only the targeted session, leaving others untouched', () => {
    const { result } = renderHook(() => useChatSessions());
    const firstId = result.current.activeSessionId;

    let second: ChatSession | undefined;
    act(() => {
      second = result.current.createSession({
        abilities: ['nostr-lookup'],
        providerId: 'shakespeare',
        modelId: 'm2',
      });
    });

    act(() => {
      result.current.updateSession(second!.id, { title: 'Renamed', modelId: 'new-model' });
    });

    const first = result.current.sessions.find((s) => s.id === firstId);
    const secondSession = result.current.sessions.find((s) => s.id === second!.id);
    expect(secondSession?.title).toBe('Renamed');
    expect(secondSession?.modelId).toBe('new-model');
    // Updating the second session must not touch the first session at all.
    expect(first?.title).toBe('');
    expect(first?.modelId).toBe('');
  });

  it('closeSession on a non-active session removes it and leaves the active session alone', () => {
    const { result } = renderHook(() => useChatSessions());
    const activeId = result.current.activeSessionId;

    let second: ChatSession | undefined;
    act(() => {
      second = result.current.createSession({
        abilities: [],
        providerId: 'shakespeare',
        modelId: 'm',
      });
    });
    expect(result.current.activeSessionId).toBe(second!.id);

    act(() => {
      result.current.closeSession(activeId);
    });

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].id).toBe(second!.id);
    expect(result.current.activeSessionId).toBe(second!.id);
  });

  it('closeSession on the active session activates the previous session in array order', () => {
    const { result } = renderHook(() => useChatSessions());
    const firstId = result.current.activeSessionId;

    let second: ChatSession | undefined;
    let third: ChatSession | undefined;
    act(() => {
      second = result.current.createSession({
        abilities: [],
        providerId: 'shakespeare',
        modelId: 'm1',
      });
    });
    act(() => {
      third = result.current.createSession({
        abilities: ['nostr-lookup'],
        providerId: 'shakespeare',
        modelId: 'm2',
      });
    });
    expect(result.current.activeSessionId).toBe(third!.id);

    act(() => {
      result.current.closeSession(third!.id);
    });

    expect(result.current.sessions.map((s) => s.id)).toEqual([firstId, second!.id]);
    expect(result.current.activeSessionId).toBe(second!.id);
    // The new active id must still be present in the sessions array.
    expect(result.current.sessions.some((s) => s.id === result.current.activeSessionId)).toBe(true);
  });

  it('closeSession on the active session at index 0 activates the first remaining session', () => {
    const { result } = renderHook(() => useChatSessions());
    const firstId = result.current.activeSessionId;

    let second: ChatSession | undefined;
    act(() => {
      second = result.current.createSession({
        abilities: [],
        providerId: 'shakespeare',
        modelId: 'm1',
      });
    });

    act(() => {
      result.current.closeSession(firstId);
    });

    expect(result.current.sessions.map((s) => s.id)).toEqual([second!.id]);
    expect(result.current.activeSessionId).toBe(second!.id);
    expect(result.current.sessions.some((s) => s.id === result.current.activeSessionId)).toBe(true);
  });

  it('closeSession on the only remaining session is a no-op', () => {
    const { result } = renderHook(() => useChatSessions());
    const onlyId = result.current.activeSessionId;

    act(() => {
      result.current.closeSession(onlyId);
    });

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].id).toBe(onlyId);
    expect(result.current.activeSessionId).toBe(onlyId);
  });

  it('deletes storage only for sessions the state updater actually removes (two closes in one tick)', () => {
    const pubkey = 'ee'.repeat(32);
    const { result } = renderHook(() => useChatSessions(pubkey));
    const firstId = result.current.activeSessionId;

    let second: ChatSession | undefined;
    act(() => {
      second = result.current.createSession({ abilities: [], providerId: 'shakespeare', modelId: 'm' });
    });

    // Two closes land in one tick. The updater refuses to remove the last
    // remaining session, so the second tab must survive both memory and
    // storage — a reload would otherwise lose it.
    act(() => {
      result.current.closeSession(firstId);
      result.current.closeSession(second!.id);
    });

    expect(result.current.sessions.map((s) => s.id)).toEqual([second!.id]);
    expect(localStorage.getItem(`ditto.ai-chat.tab.v1.${pubkey}.${firstId}`)).toBeNull();
    expect(localStorage.getItem(`ditto.ai-chat.tab.v1.${pubkey}.${second!.id}`)).not.toBeNull();
  });

  it('keeps the storage record when closing the last remaining session', () => {
    const pubkey = 'ff'.repeat(32);
    const { result } = renderHook(() => useChatSessions(pubkey));
    const onlyId = result.current.activeSessionId;

    act(() => {
      result.current.closeSession(onlyId);
    });

    expect(result.current.sessions.map((s) => s.id)).toEqual([onlyId]);
    expect(localStorage.getItem(`ditto.ai-chat.tab.v1.${pubkey}.${onlyId}`)).not.toBeNull();
  });

  it('repeated createSession calls produce distinct ids that all coexist', () => {
    const { result } = renderHook(() => useChatSessions());

    const ids = [result.current.activeSessionId];
    for (let i = 0; i < 3; i += 1) {
      let created: ChatSession | undefined;
      act(() => {
        created = result.current.createSession({
          abilities: [],
          providerId: 'shakespeare',
          modelId: `m${i}`,
        });
      });
      ids.push(created!.id);
    }

    expect(new Set(ids).size).toBe(4);
    expect(result.current.sessions).toHaveLength(4);
    expect(result.current.sessions.map((s) => s.id)).toEqual(ids);
    // The bootstrap session is still there — nothing was silently replaced.
    expect(result.current.sessions.every((s, index) => s.id === ids[index])).toBe(true);
  });

  it('reloads stored tabs for the new pubkey when the account switches', () => {
    const pubkeyA = 'aa'.repeat(32);
    const pubkeyB = 'bb'.repeat(32);
    const seeded: PersistedTab = {
      id: 'seeded-1',
      title: 'Seeded A tab',
      abilities: ['nostr-lookup'],
      providerId: 'shakespeare',
      modelId: 'm',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      agent: { messages: [{ role: 'user', content: 'from A' }], pendingInput: null, pendingToolCalls: [] },
    };
    localStorage.setItem(`ditto.ai-chat.tab.v1.${pubkeyA}.seeded-1`, JSON.stringify(seeded));

    const { result, rerender } = renderHook(({ pubkey }: { pubkey?: string }) => useChatSessions(pubkey), {
      initialProps: { pubkey: pubkeyA },
    });
    expect(result.current.sessions.map((s) => s.id)).toEqual(['seeded-1']);

    // Switching to account B must not leak A's tab into B's session list.
    rerender({ pubkey: pubkeyB });
    expect(result.current.sessions.map((s) => s.id)).toEqual([result.current.activeSessionId]);
    expect(result.current.sessions[0].id).not.toBe('seeded-1');
    expect(result.current.sessions[0].title).toBe('');

    // B's bootstrap session is persisted under B's scoped key, not A's.
    const stored = localStorage.getItem(`ditto.ai-chat.tab.v1.${pubkeyB}.${result.current.sessions[0].id}`);
    expect(stored).not.toBeNull();
    expect(localStorage.getItem(`ditto.ai-chat.tab.v1.${pubkeyA}.seeded-1`)).not.toBeNull();
  });
});
