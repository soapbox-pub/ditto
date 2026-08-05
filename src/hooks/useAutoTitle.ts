import { useEffect, useRef } from 'react';
import type { AgentSession, SessionMessage } from '@soapbox.pub/nostr-canvas/devkit';

import { createSessionOpenAIClient, sessionModelId } from '@/lib/aiClient';
import { useCurrentUser } from './useCurrentUser';
import type { AIProviderProfile } from './useAIProviders';
import type { ChatSession, SessionPatch } from './useChatSessions';
import { AUTO_TITLE_MAX_TOKENS, buildTitlePrompt, cleanTitle, isFirstExchangeComplete } from '@/lib/autoTitle';

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
  /** Per-session messages array the last attempt was made against, so a failed attempt is not retried until the conversation changes. */
  const lastAttemptRef = useRef(new Map<string, SessionMessage[]>());

  useEffect(() => {
    if (!user) return;

    // Drop in-flight entries for sessions that no longer exist (closed tabs),
    // so the ref does not keep a dead session's entry forever.
    const liveSessionIds = new Set(sessions.map((s) => s.id));
    for (const id of [...inFlightRef.current]) {
      if (!liveSessionIds.has(id)) inFlightRef.current.delete(id);
    }

    for (const session of sessions) {
      if (session.title) {
        // A titled tab needs no further attempts; forget its tracking entry.
        lastAttemptRef.current.delete(session.id);
        continue;
      }
      if (inFlightRef.current.has(session.id)) continue;

      const snapshot = snapshots[session.id];
      if (!snapshot) continue;
      if (!isFirstExchangeComplete(snapshot.messages)) continue;

      // Skip a failed attempt until the exchange it summarized changes.
      // snapshots/profiles/updateSession are new references on many renders
      // (e.g. every keystroke), so without this guard a failed request would
      // refire on each of those re-renders once .finally cleared inFlight.
      if (lastAttemptRef.current.get(session.id) === snapshot.messages) continue;

      inFlightRef.current.add(session.id);
      lastAttemptRef.current.set(session.id, snapshot.messages);
      createSessionOpenAIClient(session, profiles, user)
        .then((client) =>
          client.chat.completions.create({
            model: sessionModelId(session),
            messages: [{ role: 'user', content: buildTitlePrompt(snapshot.messages) }],
            max_tokens: AUTO_TITLE_MAX_TOKENS,
            temperature: 0,
          }),
        )
        .then((res) => {
          const title = cleanTitle(res.choices?.[0]?.message?.content ?? '');
          if (title) updateSession(session.id, { title });
        })
        .catch((err) => {
          // Leave the placeholder; the next completed exchange retries.
          console.error('[useAutoTitle] title generation failed:', err);
        })
        .finally(() => {
          inFlightRef.current.delete(session.id);
        });
    }
  }, [sessions, snapshots, profiles, user, updateSession]);
}
