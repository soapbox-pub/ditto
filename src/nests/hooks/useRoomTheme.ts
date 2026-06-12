import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { NostrEvent } from "@nostrify/nostrify";
import {
  parseInlineThemeTags,
  parseThemeDefinition,
  THEME_DEFINITION_KIND,
  type InlineTheme,
} from "@/lib/themeEvent";
import { useRoomNostr } from "./useRoomNostr";
import { getRoomThemeRef } from "../lib/room";

/**
 * Resolve a nest room's Ditto theme.
 *
 * Rooms carry inline `c`/`f`/`bg` tags (primary source, works offline) and
 * may also reference a shareable kind 36767 theme via an a-tag. Inline tags
 * win; the referenced theme is only fetched as a fallback.
 */
export function useRoomTheme(event: NostrEvent | undefined): InlineTheme | null {
  const { nostr } = useRoomNostr();

  const inline = useMemo(
    () => (event ? parseInlineThemeTags(event.tags) : null),
    [event],
  );

  const themeRef = event ? getRoomThemeRef(event) : undefined;

  const { data: referenced = null } = useQuery({
    queryKey: ["nests", "room-theme", themeRef ?? ""],
    queryFn: async (): Promise<InlineTheme | null> => {
      const [kindStr, pubkey, identifier] = themeRef!.split(":");
      if (Number(kindStr) !== THEME_DEFINITION_KIND || !pubkey) return null;

      const events = await nostr.query(
        [{ kinds: [THEME_DEFINITION_KIND], authors: [pubkey], "#d": [identifier ?? ""], limit: 1 }],
        { signal: AbortSignal.timeout(5000) },
      );
      if (events.length === 0) return null;

      const def = parseThemeDefinition(events[0]);
      if (!def) return null;
      return {
        colors: def.colors,
        font: def.font,
        titleFont: def.titleFont,
        background: def.background,
      };
    },
    enabled: !inline && !!themeRef,
    staleTime: 5 * 60 * 1000,
  });

  return inline ?? referenced;
}
