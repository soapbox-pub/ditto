import { useState } from "react";
import { Smile } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useCustomEmojis, type CustomEmoji } from "@/hooks/useCustomEmojis";
import { cn } from "@/lib/utils";
import { useNestRoom } from "../nestRoomContextDef";
import { useNests } from "@/contexts/nestsContextDef";
import { NEST_BAR_ICON, NEST_BAR_ITEM, NEST_BAR_LABEL } from "./nestBarStyles";

const EMOJI_CATEGORIES = {
  favorites: { label: "Favorites", icon: "⭐", emojis: ["🤙", "💯", "🔥", "💜", "❤️", "👏", "🙌", "✨", "🫶", "💪", "🎉", "🚀"] },
  faces: { label: "Faces", icon: "😂", emojis: ["😂", "🤣", "😅", "😳", "🤔", "😱", "🤯", "😍", "🥺", "😤", "🫠", "💀"] },
  hands: { label: "Hands", icon: "👋", emojis: ["👋", "🤝", "👊", "✌️", "🤘", "🫡", "🙏", "🤙", "👍", "👎", "🫶", "💪"] },
  symbols: { label: "Symbols", icon: "⚡", emojis: ["⚡", "💎", "🏆", "🎯", "🚀", "💰", "🎉", "🎵", "🌊", "☀️", "🦾", "🧡"] },
} as const;

interface ReactionsButtonProps {
  roomATag: string;
}

export function ReactionsButton({ roomATag }: ReactionsButtonProps) {
  const { user } = useCurrentUser();
  const { mutate: createEvent } = useNostrPublish();
  const { addLocalReaction } = useNestRoom();
  const { session } = useNests();
  const { emojis: customEmojis } = useCustomEmojis();
  const [open, setOpen] = useState(false);

  const sendReaction = (emoji: string, emojiTags?: string[][], emojiUrl?: string) => {
    if (!user) return;
    addLocalReaction(emoji, emojiUrl);
    const tags: string[][] = [["a", roomATag]];
    if (emojiTags) {
      tags.push(...emojiTags);
    }
    createEvent({
      kind: 7,
      content: emoji,
      tags,
      created_at: Math.floor(Date.now() / 1000),
      relays: session?.relays,
    });
    setOpen(false);
  };

  const sendCustomEmoji = (emoji: CustomEmoji) => {
    sendReaction(
      `:${emoji.shortcode}:`,
      [["emoji", emoji.shortcode, emoji.url]],
      emoji.url,
    );
  };

  if (!user) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button className={cn(NEST_BAR_ITEM, "opacity-50 cursor-not-allowed")} disabled>
            <Smile className={NEST_BAR_ICON} />
            <span className={NEST_BAR_LABEL}>React</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>Log in to react</TooltipContent>
      </Tooltip>
    );
  }

  const hasCustom = customEmojis.length > 0;
  const defaultTab = hasCustom ? "custom" : "favorites";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={NEST_BAR_ITEM}>
          <Smile className={NEST_BAR_ICON} />
          <span className={NEST_BAR_LABEL}>React</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" side="top" align="center">
        <Tabs defaultValue={defaultTab}>
          <TabsList className="w-full grid h-9 mb-2" style={{ gridTemplateColumns: `repeat(${hasCustom ? 5 : 4}, 1fr)` }}>
            {hasCustom && (
              <TabsTrigger value="custom" className="text-sm px-1">🎨</TabsTrigger>
            )}
            {Object.entries(EMOJI_CATEGORIES).map(([key, cat]) => (
              <TabsTrigger key={key} value={key} className="text-sm px-1">{cat.icon}</TabsTrigger>
            ))}
          </TabsList>

          {/* Custom Emoji Tab */}
          {hasCustom && (
            <TabsContent value="custom" className="mt-0">
              <ScrollArea className="h-[182px]">
                <div className="grid grid-cols-4 gap-1 pr-3">
                  {customEmojis.map((emoji) => (
                    <Tooltip key={emoji.shortcode}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => sendCustomEmoji(emoji)}
                          className="h-14 w-full flex items-center justify-center rounded-lg hover:bg-secondary transition-colors cursor-pointer p-1"
                        >
                          <img
                            src={emoji.url}
                            alt={`:${emoji.shortcode}:`}
                            className="size-10 object-contain"
                            loading="lazy"
                          />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        :{emoji.shortcode}:
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          )}

          {/* Standard Emoji Tabs */}
          {Object.entries(EMOJI_CATEGORIES).map(([key, cat]) => (
            <TabsContent key={key} value={key} className="mt-0">
              <ScrollArea className="h-[182px]">
                <div className="grid grid-cols-4 gap-1 pr-3">
                  {cat.emojis.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => sendReaction(emoji)}
                      className="h-14 w-full flex items-center justify-center text-3xl rounded-lg hover:bg-secondary transition-colors cursor-pointer"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
