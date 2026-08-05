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
 * Pure read of the stored tabs for a pubkey scope, or a single default
 * in-memory session when nothing is stored. Never writes to storage, so it is
 * safe to call from the `useState` lazy initializer (state initializers must
 * be pure — a render React discards must not leave a write on disk). The
 * mount effect performs the prune and the bootstrap write via
 * `loadOrBootstrap`.
 */
function readStored(pubkey?: string, profiles: AIProviderProfile[] = []): ChatState {
  if (pubkey === undefined) {
    const providerId = defaultProviderId(profiles);
    const bootstrap = createSessionObject({ abilities: [], providerId, modelId: '' });
    return { sessions: [bootstrap], activeSessionId: bootstrap.id };
  }
  const stored = getStoredTabs(pubkey);
  if (stored.length > 0) {
    return {
      sessions: stored.map(tabToSession),
      activeSessionId: stored[0].id,
    };
  }
  const providerId = defaultProviderId(profiles);
  const bootstrap = createSessionObject({ abilities: [], providerId, modelId: '' });
  return { sessions: [bootstrap], activeSessionId: bootstrap.id };
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
 * This function performs the storage writes (prune + bootstrap `saveTab`), so
 * it must run from effects only, never from a `useState` initializer — state
 * initializers must be pure (see `readStored`). The mount effect and the
 * account-switch effect in useChatSessions call it, and it is safe to call
 * more than once in a row, as React StrictMode dev does to effects: for a
 * pubkey'd scope a repeated bootstrap `saveTab` is read back by the next call
 * via `getStoredTabs` (so only one tab is ever written), and `pruneStaleTabs`
 * finds nothing left to remove on a repeat. The logged-out path performs no
 * writes at all.
 */
function loadOrBootstrap(pubkey?: string, profiles: AIProviderProfile[] = []): ChatState {
  if (pubkey === undefined) return readStored(pubkey, profiles);
  pruneStaleTabs(pubkey); // Silent housekeeping: drop tabs untouched for 30 days.
  const state = readStored(pubkey, profiles);
  if (getStoredTabs(pubkey).length === 0) {
    // Nothing was stored, so readStored bootstrapped an in-memory session.
    // Persist that same session (same id) so it survives reload and metadata
    // patches land under the id the UI holds.
    saveTab(tabFromSession(state.sessions[0]), pubkey);
  }
  return state;
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
 * profile when one exists. The state initializer only reads storage; the
 * prune and the bootstrap write run once in a mount effect. When the
 * signed-in account changes the tab list is reloaded from that account's
 * pubkey scope.
 */
export function useChatSessions(pubkey?: string, profiles: AIProviderProfile[] = []) {
  // The initializer is a pure read: it must not write to storage (prune or
  // bootstrap saveTab), because React may discard a rendered result and a
  // discarded initializer must not leave a write on disk. The mount effect
  // below performs those writes exactly once.
  const [state, setState] = useState<ChatState>(() => readStored(pubkey, profiles));

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

  // Run the prune and the bootstrap write once on mount. The initializer is
  // pure, so these storage writes live here instead; the ref guard makes the
  // effect run exactly once even under StrictMode's double effect invocation
  // (the ref survives the simulated remount, so the second pass returns
  // early). loadOrBootstrap is also idempotent, so even a skipped guard would
  // not double-write.
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    if (pubkey === undefined) return;
    setState(loadOrBootstrap(pubkey, profiles));
  }, [pubkey, profiles]);

  // Mirror session removals to storage. closeSession queues the id from
  // inside its state updater, so a delete can only fire for a removal that
  // updater committed: it refuses to remove the last remaining session, and a
  // delete decided from render-time state could disagree with that refusal
  // when two closes land in one tick (the second would delete storage while
  // memory keeps the tab). Nothing else queues, so a mount prune and an
  // account switch drop no storage. React may invoke an updater more than
  // once and queue the same id twice; removeTab is an idempotent
  // localStorage delete, so a repeat is harmless.
  const pendingDeletesRef = useRef<string[]>([]);
  useEffect(() => {
    const pending = pendingDeletesRef.current;
    if (pending.length === 0) return;
    pendingDeletesRef.current = [];
    if (pubkey === undefined) return; // Logged out nothing was ever persisted.
    for (const id of pending) removeTab(id, pubkey);
  }, [state.sessions, pubkey]);

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
    // The storage delete is queued from inside the updater, not decided here:
    // the updater refuses to remove the last remaining session, and a delete
    // decided against render-time state can disagree with that refusal when
    // two closes land in one tick. The effect above flushes the queue.
    setState((prev) => {
      const index = prev.sessions.findIndex((s) => s.id === id);
      if (index === -1) return prev;
      const next = prev.sessions.filter((s) => s.id !== id);
      // The last remaining session cannot be closed.
      if (next.length === 0) return prev;

      // This branch commits the removal, so the storage delete is now owed.
      pendingDeletesRef.current.push(id);

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
    setState((prev) => {
      if (!prev.sessions.some((s) => s.id === id)) return prev;
      return {
        ...prev,
        sessions: prev.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      };
    });
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
