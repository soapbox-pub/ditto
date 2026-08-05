import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentSession } from '@soapbox.pub/nostr-canvas/devkit';
import type { SerializedSession } from '@soapbox.pub/nostr-canvas/devkit';
import type { NUser } from '@nostrify/react/login';

import { createSessionOpenAIClient, sessionModelId, sessionContextWindow } from '@/lib/aiClient';
import { getStoredTab, saveTabAgent } from '@/lib/chatTabsStorage';
import type { ToolBundleEntry } from '@/lib/tools/toolRegistry';
import type { AIProviderProfile } from './useAIProviders';
import type { ChatSession } from './useChatSessions';
import type { Model } from './useShakespeare';

type AgentSnapshot = ReturnType<AgentSession['getSnapshot']>;

/** A live AgentSession plus the inputs it was built with, for staleness checks. */
interface AgentEntry {
  agent: AgentSession;
  providerId: string;
  modelId: string;
  /** Provider credential fields the client was built with; null for the zero-config Shakespeare provider. */
  providerApiKey: string | null;
  providerBaseURL: string | null;
  unsub?: () => void;
}

interface AgentSessionsOptions {
  sessions: ChatSession[];
  activeSessionId: string;
  profiles: AIProviderProfile[];
  user: NUser | null;
  /** Shakespeare model metadata, used for the context-window hint. */
  models: Model[];
  buildSessionTools: (session: ChatSession) => ToolBundleEntry[];
  systemPromptFor: (session: ChatSession) => string;
}

/** Trailing debounce for tab-blob persistence; streams notify once per chunk. */
const SAVE_DEBOUNCE_MS = 200;

/** The provider credential fields a session's client was built with; null when the zero-config Shakespeare provider is in use. */
function providerCredentialFields(
  session: ChatSession,
  profiles: AIProviderProfile[],
): { apiKey: string | null; baseURL: string | null } {
  if (session.providerId === 'shakespeare') return { apiKey: null, baseURL: null };
  const profile = profiles.find((p) => p.id === session.providerId);
  return { apiKey: profile?.apiKey ?? null, baseURL: profile?.baseURL ?? null };
}

/**
 * Manage one live AgentSession per chat session.
 *
 * Every open tab keeps its AgentSession alive in memory; switching tabs is a
 * focus change only, so a background tab's in-flight stream keeps running and
 * finishes. Agents are (re)built only when a session's provider or model
 * changes, carrying the prior messages over. A fresh page load reconstructs
 * each tab's agent from its localStorage blob via deserialize(), which
 * round-trips a mid-flight ask_questions pause.
 *
 * Each agent's state changes are persisted back into its tab's localStorage
 * entry (the agent blob merged in, metadata untouched) on a short trailing
 * debounce, so a reload at any point — including mid-pause — restores
 * exactly what was happening.
 */
export function useAgentSessions(options: AgentSessionsOptions) {
  const { sessions, activeSessionId, profiles, user, models, buildSessionTools, systemPromptFor } = options;
  const pubkey = user?.pubkey;
  const agentsRef = useRef(new Map<string, AgentEntry>());
  /** Latest snapshot per session id, updated on every agent notify. */
  const [snapshots, setSnapshots] = useState<Record<string, AgentSnapshot>>({});
  const [buildError, setBuildError] = useState<string | null>(null);
  /** Active session id read from subscriptions, which outlive effect runs. */
  const activeSessionIdRef = useRef(activeSessionId);
  /** Last persisted blob JSON per session, so identical blobs (e.g. stream chunks) skip writes. */
  const lastBlobJsonRef = useRef(new Map<string, string>());
  /** Latest serialized blob per session awaiting its debounced persist, plus the pubkey scope it must be written under. */
  const pendingBlobRef = useRef(new Map<string, { pubkey: string | undefined; serialized: SerializedSession }>());
  /** Trailing-debounce timer per session for persisting the pending blob. */
  const saveTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  /** Persist a session's pending blob now (its debounce timer fired, or teardown). */
  const flushPendingSave = useCallback((sessionId: string): void => {
    saveTimersRef.current.delete(sessionId);
    const pending = pendingBlobRef.current.get(sessionId);
    if (!pending) return;
    pendingBlobRef.current.delete(sessionId);
    const json = JSON.stringify(pending.serialized);
    if (lastBlobJsonRef.current.get(sessionId) !== json) {
      lastBlobJsonRef.current.set(sessionId, json);
      saveTabAgent(sessionId, pending.serialized, pending.pubkey);
    }
  }, []);

  /** Unsubscribe, stop, and forget a session's live agent and any pending save. */
  const stopAgent = useCallback((sessionId: string): void => {
    const timer = saveTimersRef.current.get(sessionId);
    if (timer) clearTimeout(timer);
    saveTimersRef.current.delete(sessionId);
    pendingBlobRef.current.delete(sessionId);
    const entry = agentsRef.current.get(sessionId);
    if (!entry) return;
    // Unsubscribe before stop() so the stop-triggered notify cannot re-schedule a save.
    entry.unsub?.();
    entry.agent.stop();
    agentsRef.current.delete(sessionId);
    lastBlobJsonRef.current.delete(sessionId);
  }, []);

  /**
   * Flush pending writes and stop every live agent. Runs on logout and
   * unmount, and — because the surrounding effect's deps include several
   * values that are not guaranteed to be referentially stable across
   * renders (e.g. profile/tool-building chains rooted in a useMutation
   * result) — potentially on every render while logged out. Both setState
   * calls must be true no-ops once already empty/null, or an unstable dep
   * turns into an infinite render loop: setState forces this component to
   * re-render, which recomputes the unstable dep, which reruns the effect,
   * which calls teardownAll again.
   */
  const teardownAll = useCallback((): void => {
    for (const sessionId of [...saveTimersRef.current.keys()]) flushPendingSave(sessionId);
    for (const sessionId of [...agentsRef.current.keys()]) stopAgent(sessionId);
    setSnapshots((prev) => (Object.keys(prev).length === 0 ? prev : {}));
    setBuildError((prev) => (prev === null ? prev : null));
  }, [flushPendingSave, stopAgent]);

  // Unmount: tear down every live agent so no stream keeps running (or
  // writing) after the component goes away. Dependency re-runs keep agents
  // alive across tab switches, so this lives in a separate once-only effect.
  useEffect(() => {
    return () => {
      teardownAll();
    };
  }, [teardownAll]);

  useEffect(() => {
    if (!user) {
      // Logout: stop every live agent rather than only clearing the UI state,
      // so no in-flight stream keeps running — or writing — under the previous
      // account's storage scope.
      teardownAll();
      return;
    }

    let cancelled = false;
    activeSessionIdRef.current = activeSessionId;

    // Subscribe once per agent, for its whole lifetime. The handler refreshes
    // the snapshots map and defers the blob persist to a trailing debounce,
    // so per-chunk writes do not jank the main thread on mobile.
    const attach = (entry: AgentEntry, sessionId: string): void => {
      if (entry.unsub) return;
      entry.unsub = entry.agent.subscribe(() => {
        pendingBlobRef.current.set(sessionId, { pubkey, serialized: entry.agent.serialize() });
        const timer = saveTimersRef.current.get(sessionId);
        if (timer) clearTimeout(timer);
        saveTimersRef.current.set(sessionId, setTimeout(() => flushPendingSave(sessionId), SAVE_DEBOUNCE_MS));
        const snap = entry.agent.getSnapshot();
        setSnapshots((prev) => (prev[sessionId] === snap ? prev : { ...prev, [sessionId]: snap }));
      });
    };

    // Drop agents for sessions that no longer exist (e.g. closed tabs, or an
    // account switch dropping the previous account's sessions). Flush first
    // so a debounced write in flight isn't lost — stopAgent alone discards
    // any pending blob without persisting it.
    const liveIds = new Set(sessions.map((s) => s.id));
    for (const id of [...agentsRef.current.keys()]) {
      if (!liveIds.has(id)) {
        flushPendingSave(id);
        stopAgent(id);
        // Drop the snapshot too: stopAgent forgets the agent but the snapshot
        // would otherwise keep a closed tab's (or the previous account's)
        // whole conversation alive in memory.
        setSnapshots((prev) => {
          if (!(id in prev)) return prev;
          const { [id]: _dropped, ...rest } = prev;
          return rest;
        });
      }
    }

    const buildAgent = async (session: ChatSession): Promise<void> => {
      try {
        const client = await createSessionOpenAIClient(session, profiles, user);
        if (cancelled) return;

        const modelId = sessionModelId(session);
        const { apiKey, baseURL } = providerCredentialFields(session, profiles);
        const prevEntry = agentsRef.current.get(session.id);
        const prevMessages = prevEntry?.agent.getMessages() ?? [];
        if (prevEntry) {
          // Provider/model/credential switch: commit the outgoing agent's
          // pending blob, then stop it and carry the messages over.
          flushPendingSave(session.id);
          prevEntry.unsub?.();
          prevEntry.agent.stop();
        }

        const agent = new AgentSession({
          client,
          modelId,
          tools: buildSessionTools(session),
          systemPrompt: systemPromptFor(session),
          contextWindow: sessionContextWindow(session, models, profiles),
        });

        if (prevEntry) {
          // Provider/model switch: carry the messages over (as before).
          agent.loadMessages(prevMessages);
        } else {
          // Fresh page load: reconstruct from the stored blob, preserving a
          // mid-flight ask_questions pause via pendingInput.
          const stored = getStoredTab(session.id, pubkey);
          if (stored?.agent) {
            agent.deserialize(stored.agent);
            lastBlobJsonRef.current.set(session.id, JSON.stringify(stored.agent));
          }
        }

        const entry: AgentEntry = {
          agent,
          providerId: session.providerId,
          modelId,
          providerApiKey: apiKey,
          providerBaseURL: baseURL,
        };
        agentsRef.current.set(session.id, entry);
        attach(entry, session.id);
        setSnapshots((prev) => ({ ...prev, [session.id]: agent.getSnapshot() }));
        if (session.id === activeSessionIdRef.current) setBuildError(null);
      } catch (err) {
        if (!cancelled && session.id === activeSessionIdRef.current) {
          setBuildError(err instanceof Error ? err.message : String(err));
          setSnapshots((prev) => {
            // No-op when the key is already gone, or a fresh object is
            // returned on every failure and churns consumers needlessly.
            if (!(session.id in prev)) return prev;
            const { [session.id]: _dropped, ...rest } = prev;
            return rest;
          });
        }
      }
    };

    const builds: Promise<void>[] = [];
    for (const session of sessions) {
      const existing = agentsRef.current.get(session.id);
      const modelId = sessionModelId(session);
      const { apiKey, baseURL } = providerCredentialFields(session, profiles);
      if (
        existing &&
        existing.providerId === session.providerId &&
        existing.modelId === modelId &&
        existing.providerApiKey === apiKey &&
        existing.providerBaseURL === baseURL
      ) {
        // Same provider/model/credentials — keep the live session, refresh the prompt.
        existing.agent.updateSystemPrompt(systemPromptFor(session));
        attach(existing, session.id);
        setSnapshots((prev) =>
          prev[session.id] === existing.agent.getSnapshot() ? prev : { ...prev, [session.id]: existing.agent.getSnapshot() },
        );
        if (session.id === activeSessionIdRef.current) setBuildError(null);
        continue;
      }
      builds.push(buildAgent(session));
    }

    Promise.all(builds).catch(() => {
      // Individual build failures are handled inside buildAgent.
    });

    return () => {
      cancelled = true;
    };
  }, [
    sessions,
    activeSessionId,
    profiles,
    user,
    pubkey,
    models,
    buildSessionTools,
    systemPromptFor,
    flushPendingSave,
    stopAgent,
    teardownAll,
  ]);

  /**
   * Send a user message through the active session's AgentSession.
   * While the agent is paused on ask_questions, the message is the answer.
   */
  const sendMessage = useCallback(
    async (content: string) => {
      const entry = agentsRef.current.get(activeSessionId);
      const session = sessions.find((s) => s.id === activeSessionId);
      if (!entry || !session) return;
      // Refuse to drive a stale agent that a rebuild is replacing (provider,
      // model, or credential change — matches the keep-vs-rebuild check above).
      const { apiKey, baseURL } = providerCredentialFields(session, profiles);
      if (
        entry.providerId !== session.providerId ||
        entry.modelId !== sessionModelId(session) ||
        entry.providerApiKey !== apiKey ||
        entry.providerBaseURL !== baseURL
      ) {
        return;
      }

      const pending = entry.agent.getSnapshot().pendingInput;
      if (pending) {
        await entry.agent.resolvePendingInput(pending.toolCallId, content);
        return;
      }
      await entry.agent.send(content);
    },
    [activeSessionId, sessions, profiles],
  );

  /** Clear the active session's conversation. */
  const clearActiveSession = useCallback(() => {
    agentsRef.current.get(activeSessionId)?.agent.clearMessages();
  }, [activeSessionId]);

  return { snapshots, buildError, sendMessage, clearActiveSession };
}
