import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useChatSessions } from './useChatSessions';
import type { ChatSession, DisplayMessage } from './useChatSessions';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Fixtures ───────────────────────────────────────────────────────────────
function makeMessage(overrides: Partial<DisplayMessage> = {}): DisplayMessage {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content: 'hello',
    timestamp: new Date(),
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
    expect(sessions[0].messages).toEqual([]);
    expect(sessions[0].createdAt).toBeInstanceOf(Date);
    expect(sessions[0].seedCode).toBeUndefined();
  });

  it('createSession appends a fresh-UUID session, makes it active, and returns it', () => {
    const { result } = renderHook(() => useChatSessions());
    const bootstrapId = result.current.activeSessionId;

    let created: ChatSession | undefined;
    act(() => {
      created = result.current.createSession({
        abilities: ['tiles'],
        providerId: 'shakespeare',
        modelId: 'x',
      });
    });

    expect(created).toBeDefined();
    expect(created!.id).toMatch(UUID_RE);
    expect(created!.id).not.toBe(bootstrapId);
    expect(created!.abilities).toEqual(['tiles']);
    expect(created!.providerId).toBe('shakespeare');
    expect(created!.modelId).toBe('x');
    expect(created!.messages).toEqual([]);
    expect(created!.createdAt).toBeInstanceOf(Date);
    expect(created!.seedCode).toBeUndefined();

    // The created session is appended and immediately becomes active.
    expect(result.current.sessions).toHaveLength(2);
    expect(result.current.sessions[1]).toBe(created);
    expect(result.current.activeSessionId).toBe(created!.id);
    expect(result.current.activeSession).toBe(created);
  });

  it('createSession preserves the seedCode it was given', () => {
    const { result } = renderHook(() => useChatSessions());

    let created: ChatSession | undefined;
    act(() => {
      created = result.current.createSession({
        abilities: [],
        providerId: 'shakespeare',
        modelId: 'm',
        seedCode: 'some code',
      });
    });

    expect(created!.seedCode).toBe('some code');
    const inState = result.current.sessions.find((s) => s.id === created!.id);
    expect(inState?.seedCode).toBe('some code');
  });

  it('updateSession patches only the requested field and does not clear existing messages', () => {
    const { result } = renderHook(() => useChatSessions());
    const id = result.current.activeSessionId;

    const existing: DisplayMessage[] = [
      makeMessage({ id: 'm1', role: 'user', content: 'first' }),
      makeMessage({ id: 'm2', role: 'assistant', content: 'second' }),
    ];
    act(() => {
      result.current.updateSession(id, { messages: existing });
    });

    act(() => {
      result.current.updateSession(id, { modelId: 'new-model' });
    });

    const session = result.current.sessions.find((s) => s.id === id);
    expect(session?.modelId).toBe('new-model');
    // "Switching provider mid-session" must preserve the conversation history.
    expect(session?.messages).toEqual(existing);
    expect(session?.messages).toHaveLength(2);
    expect(session?.abilities).toEqual([]);
    expect(session?.providerId).toBe('shakespeare');
  });

  it('updateSession replaces messages for only the targeted session', () => {
    const { result } = renderHook(() => useChatSessions());
    const firstId = result.current.activeSessionId;

    let second: ChatSession | undefined;
    act(() => {
      second = result.current.createSession({
        abilities: ['tiles'],
        providerId: 'shakespeare',
        modelId: 'm2',
      });
    });

    const firstMessages = [makeMessage({ id: 'a1', content: 'for first' })];
    const secondMessages = [makeMessage({ id: 'b1', content: 'for second' })];
    act(() => {
      result.current.updateSession(firstId, { messages: firstMessages });
    });
    act(() => {
      result.current.updateSession(second!.id, { messages: secondMessages });
    });

    const first = result.current.sessions.find((s) => s.id === firstId);
    const secondSession = result.current.sessions.find((s) => s.id === second!.id);
    expect(first?.messages).toEqual(firstMessages);
    expect(secondSession?.messages).toEqual(secondMessages);
    // Updating the second session must not touch the first session's messages.
    expect(first?.messages).not.toEqual([]);
    expect(first?.messages).toEqual(firstMessages);
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
        abilities: ['tiles'],
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
});
