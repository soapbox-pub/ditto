import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentSession } from '@soapbox.pub/nostr-canvas/devkit';
import type { NUser } from '@nostrify/react/login';

import { createSessionOpenAIClient, sessionModelId, sessionContextWindow } from '@/lib/aiClient';
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
 * Each session keeps its AgentSession in memory; switching tabs is a focus
 * change only (a background tab's stream keeps running). Rebuilding happens
 * only when the session's provider or model changes, and carries the prior
 * messages over. Errors building a client surface separately from the
 * session's own run errors.
 */
export function useAgentSessions(options: AgentSessionsOptions) {
  const { sessions, activeSessionId, profiles, user, models, buildSessionTools, systemPromptFor } = options;
  const agentsRef = useRef(new Map<string, AgentEntry>());
  const [snapshot, setSnapshot] = useState<AgentSnapshot | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  useEffect(() => {
    if (!activeSession || !user) {
      setSnapshot(null);
      return;
    }
    let cancelled = false;
    let unsub: (() => void) | undefined;

    (async () => {
      try {
        const client = await createSessionOpenAIClient(activeSession, profiles, user);
        if (cancelled) return;
        setBuildError(null);

        const modelId = sessionModelId(activeSession);
        const prevEntry = agentsRef.current.get(activeSession.id);

        if (prevEntry && prevEntry.providerId === activeSession.providerId && prevEntry.modelId === modelId) {
          // Same provider/model — keep the live session, refresh the prompt.
          prevEntry.agent.updateSystemPrompt(systemPromptFor(activeSession));
          unsub = prevEntry.agent.subscribe(() => setSnapshot(prevEntry.agent.getSnapshot()));
          setSnapshot(prevEntry.agent.getSnapshot());
          return;
        }

        const prevMessages = prevEntry?.agent.getMessages() ?? [];
        prevEntry?.agent.stop();
        const agent = new AgentSession({
          client,
          modelId,
          tools: buildSessionTools(activeSession),
          systemPrompt: systemPromptFor(activeSession),
          contextWindow: sessionContextWindow(activeSession, models, profiles),
        });
        if (prevMessages.length > 0) agent.loadMessages(prevMessages);
        agentsRef.current.set(activeSession.id, { agent, providerId: activeSession.providerId, modelId });
        unsub = agent.subscribe(() => setSnapshot(agent.getSnapshot()));
        setSnapshot(agent.getSnapshot());
      } catch (err) {
        if (!cancelled) {
          setBuildError(err instanceof Error ? err.message : String(err));
          setSnapshot(null);
        }
      }
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [activeSession, profiles, user, models, buildSessionTools, systemPromptFor]);

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

  return { snapshot, buildError, sendMessage, clearActiveSession };
}
