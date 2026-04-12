import { useCallback, useMemo } from 'react';
import { useNostr } from '@nostrify/react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBuddy } from '@/hooks/useBuddy';
import { useTheme } from '@/hooks/useTheme';
import { useAppContext } from '@/hooks/useAppContext';
import { useSavedFeeds } from '@/hooks/useSavedFeeds';
import { useScreenEffect } from '@/contexts/ScreenEffectContext';
import { truncateToolResult } from '@/lib/tools/truncateToolResult';
import { toolToOpenAI } from '@/lib/tools/toolToOpenAI';

import { SetThemeTool } from '@/lib/tools/SetThemeTool';
import { SearchUsersTool } from '@/lib/tools/SearchUsersTool';
import { SearchFollowPacksTool } from '@/lib/tools/SearchFollowPacksTool';
import { CreateSpellTool } from '@/lib/tools/CreateSpellTool';
import { FetchPageTool } from '@/lib/tools/FetchPageTool';
import { UploadFromUrlTool } from '@/lib/tools/UploadFromUrlTool';
import { CreateEmojiPackTool } from '@/lib/tools/CreateEmojiPackTool';
import { PublishEventsTool } from '@/lib/tools/PublishEventsTool';
import { FetchEventTool } from '@/lib/tools/FetchEventTool';
import { GetFeedTool } from '@/lib/tools/GetFeedTool';
import { CreateWebxdcTool } from '@/lib/tools/CreateWebxdcTool';
import { MakeItRainTool } from '@/lib/tools/MakeItRainTool';

import type { Tool, ToolContext } from '@/lib/tools/Tool';
import type { ToolExecutorResult } from '@/lib/aiChatTools';

// ─── Tool Registry ───

/** All registered tools, keyed by name. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TOOL_REGISTRY: Record<string, Tool<any>> = {
  set_theme: SetThemeTool,
  search_users: SearchUsersTool,
  search_follow_packs: SearchFollowPacksTool,
  create_spell: CreateSpellTool,
  fetch_page: FetchPageTool,
  upload_from_url: UploadFromUrlTool,
  create_emoji_pack: CreateEmojiPackTool,
  publish_events: PublishEventsTool,
  fetch_event: FetchEventTool,
  get_feed: GetFeedTool,
  create_webxdc: CreateWebxdcTool,
  make_it_rain: MakeItRainTool,
};

/** OpenAI-formatted tool definitions derived from the registry. */
export const TOOLS = Object.entries(TOOL_REGISTRY).map(
  ([name, tool]) => toolToOpenAI(name, tool),
);

// ─── Hook ───

export function useAIChatTools() {
  const { applyCustomTheme } = useTheme();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { savedFeeds } = useSavedFeeds();
  const { setScreenEffect } = useScreenEffect();
  const { getBuddySecretKey } = useBuddy();

  /** Build a ToolContext from current hook values. */
  const buildContext = useCallback((): ToolContext => ({
    nostr,
    user: user ? { pubkey: user.pubkey, signer: user.signer } : undefined,
    config: {
      corsProxy: config.corsProxy,
      blossomServerMetadata: config.blossomServerMetadata,
      useAppBlossomServers: config.useAppBlossomServers,
    },
    getBuddySecretKey,
    savedFeeds,
    applyCustomTheme,
    setScreenEffect,
  }), [nostr, user, config, getBuddySecretKey, savedFeeds, applyCustomTheme, setScreenEffect]);

  const executeToolCall = useCallback(async (name: string, rawArgs: Record<string, unknown>): Promise<ToolExecutorResult> => {
    const tool = TOOL_REGISTRY[name];
    if (!tool) {
      return { result: JSON.stringify({ error: `Unknown tool: ${name}` }) };
    }

    try {
      // Validate and parse args through the tool's Zod schema.
      const args = tool.inputSchema.parse(rawArgs);
      const ctx = buildContext();
      const toolResult = await tool.execute(args, ctx);

      return {
        result: truncateToolResult(toolResult.result),
        nostrEvent: toolResult.nostrEvent,
      };
    } catch (err) {
      return { result: JSON.stringify({ error: `Tool "${name}" failed: ${err instanceof Error ? err.message : 'Unknown error'}` }) };
    }
  }, [buildContext]);

  // Expose savedFeeds for the system prompt (saved feed labels)
  const savedFeedsMemo = useMemo(() => savedFeeds, [savedFeeds]);

  return { executeToolCall, savedFeeds: savedFeedsMemo };
}
