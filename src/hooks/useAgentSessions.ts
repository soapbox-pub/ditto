import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentSession } from '@soapbox.pub/nostr-canvas/devkit';
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
  unsub?: () => void;
}

export interface AgentSessionsOptions {
  sessions: ChatSession[];
  activeSessionId: string;
  profiles: AIProviderProfile[];
  user: NUser | null;
  /** Shakespeare model metadata, used for the context-window hint. */
  models: Model[];
  buildSessionTools: (session: ChatSession) => ToolBundleEntry[];
  systemPromptFor: (session: ChatSession) => string;
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
 * Each agent's every state change is persisted back into its tab's
 * localStorage entry (the agent blob merged in, metadata untouched), so a
 * reload at any point — including mid-pause — restores exactly what was
 * happening.
 */
export function useAgentSessions(options: AgentSessionsOptions) {
  const { sessions, activeSessionId, profiles, user, models, buildSessionTools, systemPromptFor } = options;
  const agentsRef = useRef(new Map<string, AgentEntry>());
  /** Latest snapshot per session id, updated on every agent notify. */
  const [snapshots, setSnapshots] = useState<Record<string, AgentSnapshot>>({});
  const [buildError, setBuildError] = useState<string | null>(null);
  /** Active session id read from subscriptions, which outlive effect runs. */
  const activeSessionIdRef = useRef(activeSessionId);
  /** Last persisted blob JSON per session, so identical blobs (e.g. stream chunks) skip writes. */
  const lastBlobJsonRef = useRef(new Map<string, string>());

  useEffect(() => {
    if (!user) {
      setSnapshots({});
      setBuildError(null);
      return;
    }

    let cancelled = false;
    activeSessionIdRef.current = activeSessionId;

    // Subscribe once per agent, for its whole lifetime. The handler persists
    // the blob (deduped) and refreshes the snapshots map.
    const attach = (entry: AgentEntry, sessionId: string): void => {
      if (entry.unsub) return;
      entry.unsub = entry.agent.subscribe(() => {
        const serialized = entry.agent.serialize();
        const json = JSON.stringify(serialized);
        if (lastBlobJsonRef.current.get(sessionId) !== json) {
          lastBlobJsonRef.current.set(sessionId, json);
          saveTabAgent(sessionId, serialized);
        }
        const snap = entry.agent.getSnapshot();
        setSnapshots((prev) => (prev[sessionId] === snap ? prev : { ...prev, [sessionId]: snap }));
      });
    };

    // Drop agents for sessions that no longer exist.
    const liveIds = new Set(sessions.map((s) => s.id));
    for (const [id, entry] of agentsRef.current) {
      if (!liveIds.has(id)) {
        entry.unsub?.();
        entry.agent.stop();
        agentsRef.current.delete(id);
        lastBlobJsonRef.current.delete(id);
      }
    }

    const buildAgent = async (session: ChatSession): Promise<void> => {
      try {
        const client = await createSessionOpenAIClient(session, profiles, user);
        if (cancelled) return;

        const modelId = sessionModelId(session);
        const prevEntry = agentsRef.current.get(session.id);
        const prevMessages = prevEntry?.agent.getMessages() ?? [];
        prevEntry?.unsub?.();
        prevEntry?.agent.stop();

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
          const stored = getStoredTab(session.id);
          if (stored?.agent) {
            agent.deserialize(stored.agent);
            lastBlobJsonRef.current.set(session.id, JSON.stringify(stored.agent));
          }
        }

        const entry: AgentEntry = { agent, providerId: session.providerId, modelId };
        agentsRef.current.set(session.id, entry);
        attach(entry, session.id);
        setSnapshots((prev) => ({ ...prev, [session.id]: agent.getSnapshot() }));
        if (session.id === activeSessionIdRef.current) setBuildError(null);
      } catch (err) {
        if (!cancelled && session.id === activeSessionIdRef.current) {
          setBuildError(err instanceof Error ? err.message : String(err));
          setSnapshots((prev) => {
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
      if (existing && existing.providerId === session.providerId && existing.modelId === modelId) {
        // Same provider/model — keep the live session, refresh the prompt.
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
  }, [sessions, activeSessionId, profiles, user, models, buildSessionTools, systemPromptFor]);

  /**
   * Send a user message through the active session's AgentSession.
   * While the agent is paused on ask_questions, the message is the answer.
   */
  const sendMessage = useCallback(
    async (content: string) => {
      const entry = agentsRef.current.get(activeSessionId);
      const session = sessions.find((s) => s.id === activeSessionId);
      if (!entry || !session) return;
      // Refuse to drive a stale agent that a rebuild is replacing.
      if (entry.providerId !== session.providerId || entry.modelId !== sessionModelId(session)) return;

      const pending = entry.agent.getSnapshot().pendingInput;
      if (pending) {
        await entry.agent.resolvePendingInput(pending.toolCallId, content);
        return;
      }
      await entry.agent.send(content);
    },
    [activeSessionId, sessions],
  );

  /** Clear the active session's conversation. */
  const clearActiveSession = useCallback(() => {
    agentsRef.current.get(activeSessionId)?.agent.clearMessages();
  }, [activeSessionId]);

  return { snapshots, buildError, sendMessage, clearActiveSession };
}
