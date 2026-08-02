import { useCallback, useMemo } from 'react';
import { useNostr } from '@nostrify/react';

import { useTheme } from '@/hooks/useTheme';
import { createBaseToolBundle, buildSessionToolBundle } from '@/lib/tools/toolRegistry';
import type { ToolBundleEntry } from '@/lib/tools/toolRegistry';
import type { ChatSession } from '@/hooks/useChatSessions';

/**
 * Assemble tool bundles with live runtime values.
 *
 * The base bundle is built once per render cycle from the live theme hook;
 * per-session bundles are derived on demand via `buildSessionTools`, which a
 * session's AgentSession consumes at construction time. The app's Nostr relay
 * pool is threaded into ability bundles that need it (e.g. the opt-in
 * 'nostr-lookup' ability's nak tool).
 */
export function useToolRegistry() {
  const { applyCustomTheme } = useTheme();
  const { nostr } = useNostr();

  const baseTools = useMemo(() => createBaseToolBundle({ applyCustomTheme }), [applyCustomTheme]);

  const buildSessionTools = useCallback(
    (session: Pick<ChatSession, 'id' | 'abilities' | 'seedCode'>): ToolBundleEntry[] => {
      return buildSessionToolBundle({
        base: baseTools,
        abilities: session.abilities,
        projectId: session.id,
        seedCode: session.seedCode,
        nostr,
      });
    },
    [baseTools, nostr],
  );

  return { baseTools, buildSessionTools };
}
