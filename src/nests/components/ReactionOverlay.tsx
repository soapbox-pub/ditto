import { useMemo } from "react";
import { useNestRoom } from "../nestRoomContextDef";

/**
 * Fixed overlay that shows floating emoji reactions animating upward.
 * Positioned above the menu bar, below modals.
 */
export function ReactionOverlay() {
  const { recentReactions } = useNestRoom();

  // Give each reaction a stable random horizontal position based on its id
  const positionedReactions = useMemo(
    () =>
      recentReactions.map((r) => ({
        ...r,
        // Simple hash of id to get a stable 10-90% horizontal position
        left: 10 + ((parseInt(r.id.slice(0, 8), 16) || r.id.length * 7) % 80),
      })),
    [recentReactions],
  );

  if (positionedReactions.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-20 md:bottom-24 z-20 pointer-events-none overflow-hidden h-[250px]">
      {positionedReactions.map((r) => (
        <span
          key={r.id}
          className="absolute bottom-0 nest-float-reaction text-2xl md:text-3xl"
          style={{ left: `${r.left}%` }}
        >
          {r.emojiUrl ? (
            <img src={r.emojiUrl} alt={r.emoji} className="size-8 md:size-10 object-contain" />
          ) : (
            r.emoji
          )}
        </span>
      ))}
    </div>
  );
}
