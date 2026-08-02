import { useState } from 'react';

/** A single tool call attached to a chat message. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
}

/** A message rendered in the chat UI. */
export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool_result';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
}

/** An ability a chat session can be forked with. */
export type Ability = 'tiles';

/** A single chat conversation. */
export interface ChatSession {
  id: string;
  abilities: Ability[];
  providerId: string;
  modelId: string;
  messages: DisplayMessage[];
  createdAt: Date;
  seedCode?: string;
}

/** Input for creating a new session. */
export interface CreateSessionInput {
  abilities: Ability[];
  providerId: string;
  modelId: string;
  seedCode?: string;
}

/** Fields that can be patched on an existing session. */
export type SessionPatch = Partial<Pick<ChatSession, 'providerId' | 'modelId' | 'messages'>>;

function createSessionObject(input: CreateSessionInput): ChatSession {
  return {
    id: crypto.randomUUID(),
    abilities: input.abilities,
    providerId: input.providerId,
    modelId: input.modelId,
    messages: [],
    createdAt: new Date(),
    seedCode: input.seedCode,
  };
}

interface ChatState {
  sessions: ChatSession[];
  activeSessionId: string;
}

/**
 * In-memory multi-session chat state. Not persisted — a later ticket adds
 * localStorage. Bootstraps one default session on first render.
 */
export function useChatSessions() {
  const [state, setState] = useState<ChatState>(() => {
    const bootstrap = createSessionObject({ abilities: [], providerId: 'shakespeare', modelId: '' });
    return { sessions: [bootstrap], activeSessionId: bootstrap.id };
  });

  /** Append a fresh session and make it active. Returns the created session. */
  function createSession(input: CreateSessionInput): ChatSession {
    const session = createSessionObject(input);
    setState((prev) => ({
      sessions: [...prev.sessions, session],
      activeSessionId: session.id,
    }));
    return session;
  }

  /** Switch the active session. Ignores unknown ids. */
  function setActiveSessionId(id: string): void {
    setState((prev) => {
      if (!prev.sessions.some((s) => s.id === id)) return prev;
      return { ...prev, activeSessionId: id };
    });
  }

  /** Remove a session. Closing the active session activates the previous one in array order. */
  function closeSession(id: string): void {
    setState((prev) => {
      const index = prev.sessions.findIndex((s) => s.id === id);
      if (index === -1) return prev;
      const next = prev.sessions.filter((s) => s.id !== id);
      // The last remaining session cannot be closed.
      if (next.length === 0) return prev;

      let activeSessionId = prev.activeSessionId;
      if (activeSessionId === id) {
        const nextIndex = Math.min(index, next.length - 1);
        activeSessionId = next[nextIndex].id;
      }
      return { sessions: next, activeSessionId };
    });
  }

  /** Patch provider/model/messages on a single session without touching the others. */
  function updateSession(id: string, patch: SessionPatch): void {
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  }

  const activeSession = state.sessions.find((s) => s.id === state.activeSessionId)!;

  return {
    sessions: state.sessions,
    activeSessionId: state.activeSessionId,
    activeSession,
    createSession,
    setActiveSessionId,
    closeSession,
    updateSession,
  };
}
