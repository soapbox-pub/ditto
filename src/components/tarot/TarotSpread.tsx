import { FormattedMessage } from "react-intl";
import type { TarotCardData } from "@/lib/tarot/cards";
import { cn } from "@/lib/utils";
import { TarotCard } from "./TarotCard";
import { POSITION_LABELS } from "./TarotReadingSection";
import "./TarotReader.css";

/** Subtle dealt-spread tilt; cards straighten as they're revealed. */
const FAN_TILT = [
  "-rotate-3 translate-y-2",
  "-translate-y-1",
  "rotate-3 translate-y-2",
] as const;

interface TarotSpreadProps {
  cards: TarotCardData[];
  /** Per-card reveal state, in draw order. Omitted means every card is face-up. */
  revealed?: readonly boolean[];
  /** Flip a face-down card. */
  onCardClick?: (index: number) => void;
  /** Click on a settled, face-up card (e.g. jump to its interpretation). */
  onSettledClick?: (index: number) => void;
  className?: string;
}

/**
 * The three-across past/present/future spread: position labels over sized
 * card slots. Shared between the reader page and the feed/detail reading
 * cards so they stay visually identical — including the hover lift on
 * clickable cards.
 */
export function TarotSpread({
  cards,
  revealed,
  onCardClick,
  onSettledClick,
  className,
}: TarotSpreadProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-center gap-[4%] sm:gap-8",
        className,
      )}
    >
      {cards.map((card, index) => {
        const isRevealed = revealed ? !!revealed[index] : true;
        return (
          <div key={`${card.name}-${index}`} className="w-[30%] max-w-[180px]">
            <h3 className="text-center text-xs sm:text-sm font-semibold uppercase tracking-[0.25em] text-muted-foreground mb-3">
              {POSITION_LABELS[index]
                ? <FormattedMessage {...POSITION_LABELS[index]} />
                : card.position}
            </h3>
            <div
              className={cn(
                "motion-safe:transition-transform motion-safe:duration-500",
                !isRevealed && FAN_TILT[index],
              )}
            >
              <TarotCard
                card={card}
                isRevealed={isRevealed}
                onCardClick={onCardClick && (() => onCardClick(index))}
                onSettledClick={onSettledClick && (() => onSettledClick(index))}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
