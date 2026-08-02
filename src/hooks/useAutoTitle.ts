import { useEffect, useRef } from 'react';
import type { AgentSession } from '@soapbox.pub/nostr-canvas/devkit';

import { useCurrentUser } from './useCurrentUser';
import { useShakespeare, type Model } from './useShakespeare';
import type { ChatSession, SessionPatch } from './useChatSessions';
import { buildTitlePrompt, cleanTitle, isFirstExchangeComplete, pickAutoTitleModel } from '@/lib/autoTitle';

type AgentSnapshot = ReturnType<AgentSession['getSnapshot']>;

interface UseAutoTitleOptions {
  sessions: ChatSession[];
  /** Latest agent snapshot per session id, refreshed by useAgentSessions. */
  snapshots: Record<string, AgentSnapshot>;
  /** Shakespeare model list (live, cost-sorted by the caller). */
  models: Model[];
  updateSession: (id: string, patch: SessionPatch) => void;
}

/**
 * Generate tab titles in the background.
 *
 * Fires once per session, after its first full exchange (user message +
 * assistant reply) completes, using a fixed cheap utility model on the
 * Shakespeare endpoint — independent of the session's own provider/model. The
 * tab keeps its placeholder/spinner title until the request resolves. A failed
 * request leaves the placeholder so a later exchange retries.
 */
export function useAutoTitle({ sessions, snapshots, models, updateSession }: UseAutoTitleOptions): void {
  const { user } = useCurrentUser();
  const { sendChatMessage } = useShakespeare();
  const inFlightRef = useRef(new Set<string>());

  useEffect(() => {
    if (!user) return;

    for (const session of sessions) {
      if (session.title) continue;
      if (inFlightRef.current.has(session.id)) continue;

      const snapshot = snapshots[session.id];
      if (!snapshot) continue;
      if (!isFirstExchangeComplete(snapshot.messages)) continue;

      const model = pickAutoTitleModel(models);
      if (!model) continue;

      inFlightRef.current.add(session.id);
      sendChatMessage([{ role: 'user', content: buildTitlePrompt(snapshot.messages) }], model.fullId, {
        max_tokens: 12,
        temperature: 0,
      })
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
  }, [sessions, snapshots, models, user, sendChatMessage, updateSession]);
}
