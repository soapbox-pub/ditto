import { useMemo } from "react";
import { MoonStar } from "lucide-react";
import { FormattedMessage } from "react-intl";
import type { NostrEvent } from "@nostrify/nostrify";
import { EmbeddedCardShell } from "@/components/EmbeddedCardShell";
import { tryNeventEncode } from "@/lib/safeNip19";
import { parseCardsFromEvent, readingTypeFromEvent } from "@/lib/tarot/cards";
import { POSITION_LABELS } from "./TarotReadingSection";

/**
 * Compact inline card for a NIP-TR kind 2256 tarot reading. Shows the drawn
 * cards (name + orientation) in draw order, reconstructed from the `c` tags —
 * never falling through to the kind-1 tokenizer.
 */
export function EmbeddedTarotReadingCard({
  event,
  className,
  disableHoverCards,
}: {
  event: NostrEvent;
  className?: string;
  disableHoverCards?: boolean;
}) {
  const neventId = useMemo(
    () => tryNeventEncode({ id: event.id, author: event.pubkey }),
    [event.id, event.pubkey],
  );

  const cards = parseCardsFromEvent(event);
  const readingType = readingTypeFromEvent(event);

  // A malformed id/pubkey can't encode to a usable link target. In practice
  // these come off a relay-verified NostrEvent, but guard rather than throw.
  if (!neventId) {
    return null;
  }

  return (
    <EmbeddedCardShell
      pubkey={event.pubkey}
      createdAt={event.created_at}
      navigateTo={neventId}
      className={className}
      disableHoverCards={disableHoverCards}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <MoonStar className="size-3" />
        {readingType === "weekly" ? (
          <FormattedMessage
            id="tarot.card.weeklyReading"
            defaultMessage="Weekly tarot reading"
          />
        ) : (
          <FormattedMessage
            id="tarot.card.dailyReading"
            defaultMessage="Daily tarot reading"
          />
        )}
      </div>
      {cards ? (
        <ul className="space-y-0.5">
          {cards.map((card, index) => (
            <li
              key={`${card.name}-${index}`}
              className="flex items-baseline gap-2 text-sm text-foreground"
            >
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground w-14">
                {POSITION_LABELS[index]
                  ? <FormattedMessage {...POSITION_LABELS[index]} />
                  : card.position}
              </span>
              <span className="font-medium truncate">
                {card.name}
                {card.isReversed && (
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    <FormattedMessage
                      id="tarot.orientation.reversedParen"
                      defaultMessage="(Reversed)"
                    />
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs italic text-muted-foreground">
          <FormattedMessage
            id="tarot.card.empty"
            defaultMessage="Tarot reading"
          />
        </p>
      )}
    </EmbeddedCardShell>
  );
}
