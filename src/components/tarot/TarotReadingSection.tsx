import {
  defineMessage,
  FormattedMessage,
  type MessageDescriptor,
} from "react-intl";
import { Card } from "@/components/ui/card";
import type { TarotCardData } from "@/lib/tarot/cards";
import { cn } from "@/lib/utils";
import "./TarotReader.css";

/** Position labels for the three-card past/present/future spread, in draw order. */
export const POSITION_LABELS = [
  defineMessage({ id: "tarot.position.past", defaultMessage: "Past" }),
  defineMessage({ id: "tarot.position.present", defaultMessage: "Present" }),
  defineMessage({ id: "tarot.position.future", defaultMessage: "Future" }),
] as const;

/**
 * One card's interpretation: position, orientation, meaning, description, and
 * the position-specific fortune line. Shared between the reader page and the
 * feed/detail reading cards.
 */
export function TarotReadingSection({
  title,
  index,
  card,
  highlighted = false,
}: {
  title: MessageDescriptor;
  index: number;
  card: TarotCardData;
  highlighted?: boolean;
}) {
  const meaning = card.isReversed ? card.meaning_rev : card.meaning_up;
  const fortune = card.isReversed
    ? card.fortune_telling_rev[index]
    : card.fortune_telling[index];

  return (
    <Card
      className={cn(
        "overflow-hidden transition-shadow duration-500",
        highlighted && "ring-2 ring-primary shadow-lg",
      )}
    >
      <div className="flex items-stretch">
        <div
          className={cn("w-1 shrink-0", `suit-${card.suit}`)}
          style={{ backgroundColor: "var(--suit-accent)" }}
          aria-hidden="true"
        />
        <div className="w-full p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
              <FormattedMessage {...title} />
            </span>
            <span
              className={cn(
                "orientation-marker shrink-0",
                `suit-${card.suit}`,
              )}
            >
              <span
                className={cn(
                  "orientation-glyph",
                  card.isReversed && "reversed",
                )}
                aria-hidden="true"
              />
              {card.isReversed ? (
                <FormattedMessage id="tarot.orientation.reversed" defaultMessage="Reversed" />
              ) : (
                <FormattedMessage id="tarot.orientation.upright" defaultMessage="Upright" />
              )}
            </span>
          </div>
          <h3 className="font-serif text-xl sm:text-2xl font-bold">
            {card.name}
          </h3>
          <p className="italic text-muted-foreground">{meaning}</p>
          <p className="text-base leading-relaxed text-muted-foreground">
            {card.desc}
          </p>
          <p className="text-base leading-relaxed">{fortune}</p>
        </div>
      </div>
    </Card>
  );
}
