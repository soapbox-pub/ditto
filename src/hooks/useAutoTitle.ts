import { useEffect, useRef } from 'react';
import type { AgentSession } from '@soapbox.pub/nostr-canvas/devkit';

import { createSessionOpenAIClient, sessionModelId } from '@/lib/aiClient';
import { useCurrentUser } from './useCurrentUser';
import type { AIProviderProfile } from './useAIProviders';
import type { ChatSession, SessionPatch } from './useChatSessions';
import { buildTitlePrompt, cleanTitle, isFirstExchangeComplete } from '@/lib/autoTitle';

type AgentSnapshot = ReturnType<AgentSession['getSnapshot']>;

interface UseAutoTitleOptions {
  sessions: ChatSession[];
  /** Latest agent snapshot per session id, refreshed by useAgentSessions. */
  snapshots: Record<string, AgentSnapshot>;
  /** User-configured AI provider profiles, used to build each session's client. */
  profiles: AIProviderProfile[];
  updateSession: (id: string, patch: SessionPatch) => void;
}

/**
 * Generate tab titles in the background.
 *
 * Fires once per session, after its first full exchange (user message +
 * assistant reply) completes, using the session's own provider and model via
 * createSessionOpenAIClient — the same client path real chat completions use,
 * so a session on a custom provider is never at the mercy of the Shakespeare
 * endpoint. The tab keeps its placeholder/spinner title until the request
 * resolves. A failed request leaves the placeholder so a later exchange
 * retries.
 */
export function useAutoTitle({ sessions, snapshots, profiles, updateSession }: UseAutoTitleOptions): void {
  const { user } = useCurrentUser();
  const inFlightRef = useRef(new Set<string>());

  useEffect(() => {
    if (!user) return;

    for (const session of sessions) {
      if (session.title) continue;
      if (inFlightRef.current.has(session.id)) continue;

      const snapshot = snapshots[session.id];
      if (!snapshot) continue;
      if (!isFirstExchangeComplete(snapshot.messages)) continue;

      inFlightRef.current.add(session.id);
      createSessionOpenAIClient(session, profiles, user)
        .then((client) =>
          client.chat.completions.create({
            model: sessionModelId(session),
            messages: [{ role: 'user', content: buildTitlePrompt(snapshot.messages) }],
            max_tokens: 12,
            temperature: 0,
          }),
        )
        .then((res) => {
          const title = cleanTitle(res.choices?.[0]?.message?.content ?? '');
          if (title) updateSession(session.id, { title });
        })
        .catch(() => {
          // Leave the placeholder; the next completed exchange retries.
        })
        .finally(() => {
          inFlightRef.current.delete(session.id);
        });
    }
  }, [sessions, snapshots, profiles, user, updateSession]);
}
