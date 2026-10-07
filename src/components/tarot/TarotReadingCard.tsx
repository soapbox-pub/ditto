import { useState } from "react";
import { flushSync } from "react-dom";
import { FormattedMessage } from "react-intl";
import type { NostrEvent } from "@nostrify/nostrify";
import { Button } from "@/components/ui/button";
import { useTarotSectionJump } from "@/hooks/useTarotSectionJump";
import { parseCardsFromEvent } from "@/lib/tarot/cards";
import { cn } from "@/lib/utils";
import { POSITION_LABELS, TarotReadingSection } from "./TarotReadingSection";
import { TarotSpread } from "./TarotSpread";
import { TarotStars } from "./TarotStars";
import "./TarotReader.css";

interface TarotReadingCardProps {
  event: NostrEvent;
  /** Detail-page rendering: show the full interpretation, not a clamped preview. */
  expanded?: boolean;
  className?: string;
}

/**
 * Renders a NIP-TR kind 2256 tarot reading: the drawn cards as face-up card
 * art over the star field, with per-card interpretations behind a toggle. The
 * draw comes entirely from the event's ordered `c` tags — `content` is
 * rendered as plain prose (never through the kind-1 tokenizer).
 */
export function TarotReadingCard({
  event,
  expanded,
  className,
}: TarotReadingCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const { highlightIndex, sectionRefs, jumpToSection } = useTarotSectionJump();
  const cards = parseCardsFromEvent(event);
  const interpretation = event.content.trim();

  if (!cards) {
    return null;
  }

  // Clicking a card opens the interpretations (if hidden) and jumps to its
  // section. flushSync so the section exists before we scroll to it.
  const handleSettledClick = (index: number) => {
    if (!showDetails) {
      flushSync(() => setShowDetails(true));
    }
    jumpToSection(index);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative overflow-hidden rounded-xl px-2 py-4">
        <TarotStars />
        <TarotSpread
          cards={cards}
          onSettledClick={handleSettledClick}
          className="relative"
        />
      </div>

      {interpretation && (
        <p
          className={cn(
            "text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground",
            !expanded && "line-clamp-6",
          )}
        >
          {interpretation}
        </p>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="w-full text-muted-foreground"
        onClick={(e) => {
          e.stopPropagation();
          setShowDetails((v) => !v);
        }}
      >
        {showDetails ? (
          <FormattedMessage
            id="tarot.card.hideDetails"
            defaultMessage="Hide interpretation"
          />
        ) : (
          <FormattedMessage
            id="tarot.card.showDetails"
            defaultMessage="Show interpretation"
          />
        )}
      </Button>

      {showDetails && (
        <div className="space-y-3">
          {cards.slice(0, POSITION_LABELS.length).map((card, index) => (
            <div
              key={`${card.name}-${index}`}
              ref={(el) => {
                sectionRefs.current[index] = el;
              }}
            >
              <TarotReadingSection
                title={POSITION_LABELS[index]}
                index={index}
                card={card}
                highlighted={highlightIndex === index}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
