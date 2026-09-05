import { useEffect, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { MoonStar, Sparkles, Sun } from "lucide-react";
import { ARC_OVERHANG_PX } from "@/components/ArcBackground";
import { SubHeaderBar } from "@/components/SubHeaderBar";
import { TabButton } from "@/components/TabButton";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { useTarotReading } from "@/hooks/useTarotReading";
import { useTarotSectionJump } from "@/hooks/useTarotSectionJump";
import { useToast } from "@/hooks/useToast";
import {
  buildCardTags,
  CARD_POSITIONS,
  READING_DURATIONS,
  type ReadingType,
  SPREAD_PAST_PRESENT_FUTURE,
  TAROT_READING_KIND,
  type TarotCardData,
} from "@/lib/tarot/cards";
import { TarotCard } from "./TarotCard";
import { POSITION_LABELS, TarotReadingSection } from "./TarotReadingSection";
import { TarotSpread } from "./TarotSpread";
import { TarotStars } from "./TarotStars";
import "./TarotReader.css";

/** NIP-31 alt text summarizing the draw for clients that don't render kind 2256. */
function buildAlt(cards: TarotCardData[], readingType: ReadingType): string {
  const label = readingType === "daily" ? "Daily" : "Weekly";
  const list = cards
    .map((c) => c.name + (c.isReversed ? " (Reversed)" : ""))
    .join(", ");
  return `${label} tarot reading with three cards: ${list} (past/present/future)`;
}

function formatCountdown(remaining: number): string {
  const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
  const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

  const hms = `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

  return days > 0 ? `${days}d ${hms}` : hms;
}

/** The tarot reading experience: draw, reveal, contemplate, share. */
export function TarotReader() {
  const intl = useIntl();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const { mutate: createEvent } = useNostrPublish();
  const [readingType, setReadingType] = useState<ReadingType>("daily");

  const daily = useTarotReading("daily");
  const weekly = useTarotReading("weekly");
  const reading = readingType === "daily" ? daily : weekly;

  const [hasShared, setHasShared] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const { highlightIndex, sectionRefs, jumpToSection } = useTarotSectionJump();

  useEffect(() => {
    setHasShared(false);
  }, [readingType, user?.pubkey]);

  // Tick once a second while a sealed reading is counting down.
  const [now, setNow] = useState(() => Date.now());
  const counting = reading.sealed && reading.readingTimestamp !== null;
  useEffect(() => {
    if (!counting) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [counting]);

  const remaining = reading.readingTimestamp !== null
    ? reading.readingTimestamp + READING_DURATIONS[readingType] - now
    : null;

  const alreadyShared = !!reading.fortune || hasShared;
  const expired = reading.sealed && remaining !== null && remaining <= 0;

  // Publish the sealed reading directly as a NIP-TR kind 2256 event: the draw
  // as ordered `c` tags with empty `content`. The cards (and their meanings)
  // render from the tags alone, so no image or prose is needed.
  const handleShareClick = () => {
    if (!user || isSharing || reading.cards.length !== 3) return;

    setIsSharing(true);
    const alt = buildAlt(reading.cards, readingType);

    createEvent(
      {
        kind: TAROT_READING_KIND,
        content: "",
        tags: [
          ...buildCardTags(reading.cards),
          ["s", SPREAD_PAST_PRESENT_FUTURE],
          ["t", readingType],
          ["alt", alt],
        ],
      },
      {
        onSuccess: () => {
          setIsSharing(false);
          setHasShared(true);
          reading.refetchFortune();
          toast({
            title: intl.formatMessage({
              id: "tarot.share.toast.success",
              defaultMessage: "Your fortune has been shared ✨",
            }),
          });
        },
        onError: () => {
          setIsSharing(false);
          toast({
            title: intl.formatMessage({
              id: "tarot.share.toast.failedTitle",
              defaultMessage: "Failed to share",
            }),
            description: intl.formatMessage({
              id: "tarot.share.toast.postFailed",
              defaultMessage: "Your reading could not be posted. Try again.",
            }),
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="flex flex-col flex-1">
      {/* Reading-type tabs — the shared curved sub-header */}
      <SubHeaderBar>
        <TabButton
          label={intl.formatMessage({ id: "tarot.tab.daily", defaultMessage: "Daily" })}
          active={readingType === "daily"}
          onClick={() => setReadingType("daily")}
        >
          <span className="flex items-center justify-center gap-1">
            <Sun className="size-3.5" />
            <FormattedMessage id="tarot.tab.daily" defaultMessage="Daily" />
          </span>
        </TabButton>
        <TabButton
          label={intl.formatMessage({ id: "tarot.tab.weekly", defaultMessage: "Weekly" })}
          active={readingType === "weekly"}
          onClick={() => setReadingType("weekly")}
        >
          <span className="flex items-center justify-center gap-1">
            <MoonStar className="size-3.5" />
            <FormattedMessage id="tarot.tab.weekly" defaultMessage="Weekly" />
          </span>
        </TabButton>
      </SubHeaderBar>

      {/* The star field bleeds across the full content panel */}
      <div className="relative flex-1">
        <TarotStars />

        <div
          className="relative flex flex-col items-center px-4 pb-12"
          style={{ paddingTop: ARC_OVERHANG_PX + 16 }}
        >
          {!user ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-36">
                <TarotCard />
              </div>
              <p className="text-muted-foreground mt-8 max-w-xs">
                <FormattedMessage
                  id="tarot.loginRequired"
                  defaultMessage="Log in to draw your cards."
                />
              </p>
            </div>
          ) : reading.isLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-36">
                <TarotCard isSpinning />
              </div>
              <p className="text-muted-foreground mt-8">
                <FormattedMessage
                  id="tarot.loading"
                  defaultMessage="Reading your cards…"
                />
              </p>
            </div>
          ) : (
            <>
              {/* Heading */}
              <div className="text-center mt-4 mb-8 space-y-2 max-w-md">
                <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight">
                  {reading.sealed ? (
                    <FormattedMessage
                      id="tarot.heading.sealed"
                      defaultMessage="Your fate is sealed"
                    />
                  ) : (
                    <FormattedMessage
                      id="tarot.heading.await"
                      defaultMessage="The cards await"
                    />
                  )}
                </h2>
                <p className="text-base sm:text-lg text-muted-foreground">
                  {reading.sealed ? (
                    readingType === "daily" ? (
                      <FormattedMessage
                        id="tarot.subheading.sealed.daily"
                        defaultMessage="Return tomorrow for a new reading."
                      />
                    ) : (
                      <FormattedMessage
                        id="tarot.subheading.sealed.weekly"
                        defaultMessage="Return next week for a new reading."
                      />
                    )
                  ) : readingType === "daily" ? (
                    <FormattedMessage
                      id="tarot.subheading.daily"
                      defaultMessage="Past, present, future. Drawn once a day."
                    />
                  ) : (
                    <FormattedMessage
                      id="tarot.subheading.weekly"
                      defaultMessage="Three major arcana for the week ahead."
                    />
                  )}
                </p>
              </div>

              {/* The spread */}
              <div className="w-full max-w-2xl">
                <TarotSpread
                  cards={reading.cards}
                  revealed={reading.revealed}
                  onCardClick={(index) => reading.revealCard(index)}
                  onSettledClick={jumpToSection}
                />

                {/* Hint or countdown + actions */}
                <div className="flex flex-col items-center gap-3 mt-8">
                  {reading.cards.length === 3 && !reading.sealed && (
                    <>
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Sparkles className="size-4" aria-hidden="true" />
                        <FormattedMessage
                          id="tarot.hint.tapToReveal"
                          defaultMessage="Tap each card to reveal your fate"
                        />
                      </p>
                      <Button
                        onClick={reading.revealAll}
                        variant="outline"
                        size="sm"
                        className="rounded-full px-6"
                      >
                        <FormattedMessage
                          id="tarot.action.revealAll"
                          defaultMessage="Reveal all"
                        />
                      </Button>
                    </>
                  )}

                  {reading.sealed && !expired && remaining !== null && (
                    <div className="inline-flex items-baseline gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-sm">
                      <span className="leading-none text-muted-foreground">
                        <FormattedMessage
                          id="tarot.countdown.next"
                          defaultMessage="Next {type, select, daily {daily} other {weekly}} reading"
                          values={{ type: readingType }}
                        />
                      </span>
                      <span className="leading-none font-mono font-semibold tabular-nums text-primary">
                        {formatCountdown(remaining)}
                      </span>
                    </div>
                  )}

                  {expired && (
                    <Button
                      onClick={reading.redraw}
                      className="rounded-full px-8"
                    >
                      <FormattedMessage
                        id="tarot.action.redraw"
                        defaultMessage="Draw a new reading"
                      />
                    </Button>
                  )}

                  {reading.sealed && !expired && (
                    <Button
                      onClick={handleShareClick}
                      size="lg"
                      className="rounded-full px-8"
                      disabled={alreadyShared || isSharing}
                    >
                      {isSharing ? (
                        <FormattedMessage
                          id="tarot.action.sharing"
                          defaultMessage="Sharing…"
                        />
                      ) : alreadyShared ? (
                        <FormattedMessage
                          id="tarot.action.shared"
                          defaultMessage="Shared ✓"
                        />
                      ) : (
                        <FormattedMessage
                          id="tarot.action.share"
                          defaultMessage="Share your fortune"
                        />
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {/* Interpretations — each surfaces as its card is revealed */}
              {reading.cards.length === 3 && reading.revealed.some(Boolean) && (
                <div className="mt-10 w-full max-w-2xl space-y-4">
                  <h2 className="font-serif text-2xl font-bold text-center reading-reveal">
                    <FormattedMessage
                      id="tarot.interpretation.heading"
                      defaultMessage="The interpretation"
                    />
                    <span className="reading-sheen" aria-hidden="true" />
                  </h2>
                  {reading.cards.map((card, index) =>
                    reading.revealed[index]
                      ? (
                        <div
                          key={CARD_POSITIONS[index]}
                          ref={(el) => {
                            sectionRefs.current[index] = el;
                          }}
                          className="reading-reveal"
                        >
                          <TarotReadingSection
                            title={POSITION_LABELS[index]}
                            index={index}
                            card={card}
                            highlighted={highlightIndex === index}
                          />
                          <span className="reading-sheen" aria-hidden="true" />
                        </div>
                      )
                      : null,
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
