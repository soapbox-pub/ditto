import { useCallback, useMemo } from 'react';
import { useNostr } from '@nostrify/react';

import { useTheme } from '@/hooks/useTheme';
import { createBaseToolBundle, buildSessionToolBundle } from '@/lib/tools/toolRegistry';
import type { ToolBundleEntry } from '@/lib/tools/toolRegistry';
import type { ChatSession } from '@/hooks/useChatSessions';

/**
 * Assemble tool bundles with live runtime values.
 *
 * The base bundle is built once per render cycle from the live theme hook
 * and the app's Nostr relay pool; per-session bundles are derived on demand
 * via `buildSessionTools`, which a session's AgentSession consumes at
 * construction time.
 */
export function useToolRegistry() {
  const { applyCustomTheme } = useTheme();
  const { nostr } = useNostr();

  const baseTools = useMemo(() => createBaseToolBundle({ applyCustomTheme, nostr }), [applyCustomTheme, nostr]);

  const buildSessionTools = useCallback(
    (session: Pick<ChatSession, 'id' | 'abilities' | 'seedCode'>): ToolBundleEntry[] => {
      return buildSessionToolBundle({
        base: baseTools,
        abilities: session.abilities,
        projectId: session.id,
        seedCode: session.seedCode,
      });
    },
    [baseTools],
  );

  return { baseTools, buildSessionTools };
}
