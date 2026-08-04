import { useEffect, useRef, useState } from 'react';
import type { SerializedSession } from '@soapbox.pub/nostr-canvas/devkit';

import type { AIProviderProfile } from '@/hooks/useAIProviders';
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
  // Tool results are attached to their originating assistant message instead
  // of rendering as separate bubbles, so only user/assistant roles are ever
  // emitted (see snapshotToDisplayMessages in AIChatPage).
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
}

/** A single chat conversation. */
export interface ChatSession {
  id: string;
  /** LLM-generated tab label; empty until the auto-title resolves. */
  title: string;
  abilities: Ability[];
  providerId: string;
  modelId: string;
  createdAt: Date;
}

/** Input for creating a new session. */
export interface CreateSessionInput {
  abilities: Ability[];
  providerId: string;
  modelId: string;
}

/** Fields that can be patched on an existing session. */
export type SessionPatch = Partial<Pick<ChatSession, 'providerId' | 'modelId' | 'title'>>;

const EMPTY_AGENT: SerializedSession = { messages: [], pendingInput: null, pendingToolCalls: [] };

function createSessionObject(input: CreateSessionInput): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: '',
    abilities: input.abilities,
    providerId: input.providerId,
    modelId: input.modelId,
    createdAt: new Date(),
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
    createdAt: new Date(tab.createdAt),
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
 * The default provider for a fresh chat session: the first configured AI
 * provider profile when at least one exists, otherwise the zero-config
 * 'shakespeare' provider. Used both by the first-tab bootstrap and by the
 * "New Chat" button, so both always start from the same sensible default.
 */
export function defaultProviderId(profiles: AIProviderProfile[] = []): string {
  return profiles.length > 0 ? profiles[0].id : 'shakespeare';
}

/**
 * Restore the stored tabs for a pubkey scope (after silently pruning any
 * untouched for 30 days), or bootstrap a single default session when nothing
 * is stored. `pubkey` scopes the localStorage keys per account. When no
 * session is stored, the bootstrap uses the first configured AI provider
 * profile when at least one exists, falling back to the zero-config
 * 'shakespeare' provider.
 *
 * With no pubkey (logged out) nothing is written to storage: there is no UI
 * that can reach an 'anon'-scoped tab, so persisting one would just orphan a
 * storage record. A fresh in-memory session is still returned so callers can
 * read `activeSession` while rendering the logged-out state.
 *
 * Safe to call more than once in a row, as React StrictMode dev does to lazy
 * `useState` initializers and effects: for a pubkey'd scope the first call's
 * bootstrap `saveTab` is read back by the second call via `getStoredTabs`
 * (so only one tab is ever written), and `pruneStaleTabs` finds nothing left
 * to remove on a repeat. The logged-out path performs no writes at all.
 */
function loadOrBootstrap(pubkey?: string, profiles: AIProviderProfile[] = []): ChatState {
  if (pubkey === undefined) {
    const providerId = defaultProviderId(profiles);
    const bootstrap = createSessionObject({ abilities: [], providerId, modelId: '' });
    return { sessions: [bootstrap], activeSessionId: bootstrap.id };
  }
  pruneStaleTabs(pubkey); // Silent housekeeping: drop tabs untouched for 30 days.
  const stored = getStoredTabs(pubkey);
  if (stored.length > 0) {
    return {
      sessions: stored.map(tabToSession),
      activeSessionId: stored[0].id,
    };
  }
  const providerId = defaultProviderId(profiles);
  const bootstrap = createSessionObject({ abilities: [], providerId, modelId: '' });
  saveTab(tabFromSession(bootstrap), pubkey);
  return { sessions: [bootstrap], activeSessionId: bootstrap.id };
}

/**
 * Multi-session chat state backed by localStorage.
 *
 * Persistence: one localStorage entry per tab (the session metadata plus the
 * session's serialized AgentSession blob). Tab creation/closing and metadata
 * patches (provider/model/title) write here; the agent blob itself is written
 * by useAgentSessions on every message/state change. On first render the
 * stored tabs for the current account are restored (after silently pruning
 * any untouched for 30 days), or a single default session is bootstrapped
 * when nothing is stored — preferring the first configured AI provider
 * profile when one exists. When the signed-in account changes the tab list is
 * reloaded from that account's pubkey scope.
 */
export function useChatSessions(pubkey?: string, profiles: AIProviderProfile[] = []) {
  const [state, setState] = useState<ChatState>(() => loadOrBootstrap(pubkey, profiles));

  // Reload the tab list from the new account's scope on an account switch.
  // The ref guard makes the reload run at most once per pubkey: StrictMode's
  // simulated remount re-initializes the ref to the current pubkey, so the
  // effect returns early instead of re-running loadOrBootstrap. Even if it
  // did re-run, loadOrBootstrap is idempotent (see its docstring).
  const prevPubkeyRef = useRef(pubkey);
  useEffect(() => {
    if (prevPubkeyRef.current === pubkey) return;
    prevPubkeyRef.current = pubkey;
    setState(loadOrBootstrap(pubkey, profiles));
  }, [pubkey, profiles]);

  /** Append a fresh session and make it active. Returns the created session. */
  function createSession(input: CreateSessionInput): ChatSession {
    const session = createSessionObject(input);
    // Logged out there is nothing to persist to: no 'anon'-scoped tab may be
    // written (see loadOrBootstrap), so the session stays in memory only.
    if (pubkey !== undefined) saveTab(tabFromSession(session), pubkey);
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
    // Decide the side effect once, outside the updater: React may invoke an
    // updater more than once (StrictMode dev double-invoke, concurrent
    // replay), so the localStorage delete must not live inside it.
    const willRemove = state.sessions.some((s) => s.id === id) && state.sessions.length > 1;
    if (!willRemove) return;

    // Hard delete: the tab's localStorage entry goes immediately. There is
    // no "recently closed" recovery surface. Logged out there is nothing to
    // delete — anon sessions are in memory only.
    if (pubkey !== undefined) removeTab(id, pubkey);

    setState((prev) => {
      const index = prev.sessions.findIndex((s) => s.id === id);
      if (index === -1) return prev;
      const next = prev.sessions.filter((s) => s.id !== id);
      // The last remaining session cannot be closed (defensive: state may
      // have changed since the guard above).
      if (next.length === 0) return prev;

      let activeSessionId = prev.activeSessionId;
      if (activeSessionId === id) {
        const nextIndex = Math.min(index, next.length - 1);
        activeSessionId = next[nextIndex].id;
      }
      return { sessions: next, activeSessionId };
    });
  }

  /** Patch provider/model/title on a single session without touching the others. */
  function updateSession(id: string, patch: SessionPatch): void {
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
    // Persist the metadata fields; the agent blob is preserved by the merge.
    // Logged out the patch is in memory only (see loadOrBootstrap).
    const metadata = {
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.providerId !== undefined && { providerId: patch.providerId }),
      ...(patch.modelId !== undefined && { modelId: patch.modelId }),
    };
    if (pubkey !== undefined) patchTabMetadata(id, metadata, pubkey);
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
