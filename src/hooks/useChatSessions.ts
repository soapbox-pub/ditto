import { useState } from 'react';
import type { SerializedSession } from '@soapbox.pub/nostr-canvas/devkit';

import type { Ability } from '@/lib/abilities';
import {
  getStoredTabs,
  saveTab,
  removeTab,
  patchTabMetadata,
  pruneStaleTabs,
  type PersistedTab,
} from '@/lib/chatTabsStorage';

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

/** An ability a chat session can be forked with. See `@/lib/abilities` for the canonical registry. */
export type { Ability } from '@/lib/abilities';

/** A single chat conversation. */
export interface ChatSession {
  id: string;
  /** LLM-generated tab label; empty until the auto-title resolves. */
  title: string;
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
export type SessionPatch = Partial<Pick<ChatSession, 'providerId' | 'modelId' | 'messages' | 'title'>>;

const EMPTY_AGENT: SerializedSession = { messages: [], pendingInput: null, pendingToolCalls: [] };

function createSessionObject(input: CreateSessionInput): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: '',
    abilities: input.abilities,
    providerId: input.providerId,
    modelId: input.modelId,
    messages: [],
    createdAt: new Date(),
    seedCode: input.seedCode,
  };
}

/** Map a persisted tab record back into an in-memory session. */
function tabToSession(tab: PersistedTab): ChatSession {
  return {
    id: tab.id,
    title: tab.title,
    abilities: tab.abilities,
    providerId: tab.providerId,
    modelId: tab.modelId,
    messages: [],
    createdAt: new Date(tab.createdAt),
    seedCode: tab.seedCode,
  };
}

/** Map a session into a persisted tab record. */
function tabFromSession(session: ChatSession, agent: SerializedSession = EMPTY_AGENT): PersistedTab {
  return {
    id: session.id,
    title: session.title,
    abilities: session.abilities,
    providerId: session.providerId,
    modelId: session.modelId,
    seedCode: session.seedCode,
    createdAt: session.createdAt.getTime(),
    updatedAt: Date.now(),
    agent,
  };
}

interface ChatState {
  sessions: ChatSession[];
  activeSessionId: string;
}

/**
 * Multi-session chat state backed by localStorage.
 *
 * Persistence: one localStorage entry per tab (the session metadata plus the
 * session's serialized AgentSession blob). Tab creation/closing and metadata
 * patches (provider/model/title) write here; the agent blob itself is written
 * by useAgentSessions on every message/state change. On first render the
 * stored tabs are restored (after silently pruning any untouched for 30 days),
 * or a single default session is bootstrapped when nothing is stored.
 */
export function useChatSessions() {
  const [state, setState] = useState<ChatState>(() => {
    pruneStaleTabs(); // Silent housekeeping: drop tabs untouched for 30 days.
    const stored = getStoredTabs();
    if (stored.length > 0) {
      return {
        sessions: stored.map(tabToSession),
        activeSessionId: stored[0].id,
      };
    }
    const bootstrap = createSessionObject({ abilities: [], providerId: 'shakespeare', modelId: '' });
    saveTab(tabFromSession(bootstrap));
    return { sessions: [bootstrap], activeSessionId: bootstrap.id };
  });

  /** Append a fresh session and make it active. Returns the created session. */
  function createSession(input: CreateSessionInput): ChatSession {
    const session = createSessionObject(input);
    saveTab(tabFromSession(session));
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

      // Hard delete: the tab's localStorage entry goes immediately. There is
      // no "recently closed" recovery surface.
      removeTab(id);

      let activeSessionId = prev.activeSessionId;
      if (activeSessionId === id) {
        const nextIndex = Math.min(index, next.length - 1);
        activeSessionId = next[nextIndex].id;
      }
      return { sessions: next, activeSessionId };
    });
  }

  /** Patch provider/model/messages/title on a single session without touching the others. */
  function updateSession(id: string, patch: SessionPatch): void {
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
    // Persist the metadata fields; the agent blob is preserved by the merge.
    const metadata = {
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.providerId !== undefined && { providerId: patch.providerId }),
      ...(patch.modelId !== undefined && { modelId: patch.modelId }),
    };
    patchTabMetadata(id, metadata);
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
