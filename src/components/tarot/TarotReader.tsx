import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { MoonStar, Sparkles, Sun } from "lucide-react";
import { ARC_OVERHANG_PX } from "@/components/ArcBackground";
import { SubHeaderBar } from "@/components/SubHeaderBar";
import { TabButton } from "@/components/TabButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAppContext } from "@/hooks/useAppContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useTarotReading } from "@/hooks/useTarotReading";
import {
  CARD_POSITIONS,
  READING_DURATIONS,
  type ReadingType,
  type TarotCardData,
} from "@/lib/tarot/cards";
import { cn } from "@/lib/utils";
import { TarotCard } from "./TarotCard";
import { TarotImage } from "./TarotImage";
import { TarotShareDialog } from "./TarotShareDialog";
import { TarotStars } from "./TarotStars";
import "./TarotReader.css";

const POSITION_LABELS = ["Past", "Present", "Future"] as const;

/** Subtle dealt-spread tilt; cards straighten as they're revealed. */
const FAN_TILT = [
  "-rotate-3 translate-y-2",
  "-translate-y-1",
  "rotate-3 translate-y-2",
] as const;

function ReadingSection({
  title,
  index,
  card,
  highlighted,
}: {
  title: string;
  index: number;
  card: TarotCardData;
  highlighted: boolean;
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
              {title}
            </span>
            <Badge variant="outline" className="font-normal">
              {card.isReversed ? "Reversed" : "Upright"}
            </Badge>
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
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const [readingType, setReadingType] = useState<ReadingType>("daily");

  const daily = useTarotReading("daily");
  const weekly = useTarotReading("weekly");
  const reading = readingType === "daily" ? daily : weekly;

  const [hasShared, setHasShared] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const highlightTimer = useRef<number | undefined>(undefined);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHasShared(false);
  }, [readingType, user?.pubkey]);

  // The captured image belongs to a specific spread; regenerate when it changes.
  useEffect(() => {
    setGeneratedImage(null);
  }, [reading.cards]);

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

  // Clicking a settled card scrolls to and briefly highlights its interpretation.
  const handleCardJump = (index: number) => {
    const el = sectionRefs.current[index];
    if (!el) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });
    setHighlightIndex(index);
    window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(
      () => setHighlightIndex(null),
      1800,
    );
  };

  useEffect(() => {
    return () => window.clearTimeout(highlightTimer.current);
  }, []);

  const handleShareClick = async () => {
    setIsShareDialogOpen(true);
    if (generatedImage || !imageRef.current) return;
    try {
      const dataUrl = await toPng(imageRef.current, {
        width: 800,
        height: 418,
        pixelRatio: 2,
        backgroundColor: "#120a20",
        style: { transform: "scale(1)", transformOrigin: "top left" },
      });
      setGeneratedImage(dataUrl);
    } catch (error) {
      console.error("Failed to generate reading image:", error);
    }
  };

  return (
    <div className="flex flex-col flex-1">
      {/* Reading-type tabs — the shared curved sub-header */}
      <SubHeaderBar>
        <TabButton
          label="Daily"
          active={readingType === "daily"}
          onClick={() => setReadingType("daily")}
        >
          <span className="flex items-center justify-center gap-1">
            <Sun className="size-3.5" />
            Daily
          </span>
        </TabButton>
        <TabButton
          label="Weekly"
          active={readingType === "weekly"}
          onClick={() => setReadingType("weekly")}
        >
          <span className="flex items-center justify-center gap-1">
            <MoonStar className="size-3.5" />
            Weekly
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
          {reading.isLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-36">
                <TarotCard isSpinning />
              </div>
              <p className="text-muted-foreground mt-8">Reading your cards…</p>
            </div>
          ) : (
            <>
              {/* Heading */}
              <div className="text-center mt-4 mb-8 space-y-2 max-w-md">
                <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight">
                  {reading.sealed ? "Your fate is sealed" : "The cards await"}
                </h2>
                <p className="text-base sm:text-lg text-muted-foreground">
                  {reading.sealed
                    ? `Return ${readingType === "daily" ? "tomorrow" : "next week"} for a new reading.`
                    : readingType === "daily"
                      ? "Past, present, future. Drawn once a day."
                      : "Three major arcana for the week ahead."}
                </p>
              </div>

              {/* The spread */}
              <div className="w-full max-w-2xl">
                <div className="flex items-start justify-center gap-[4%] sm:gap-8">
                  {reading.cards.map((card, index) => (
                    <div key={card.name} className="w-[30%] max-w-[180px]">
                      <h3 className="text-center text-xs sm:text-sm font-semibold uppercase tracking-[0.25em] text-muted-foreground mb-3">
                        {POSITION_LABELS[index]}
                      </h3>
                      <div
                        className={cn(
                          "motion-safe:transition-transform motion-safe:duration-500",
                          !reading.revealed[index] && FAN_TILT[index],
                        )}
                      >
                        <TarotCard
                          card={card}
                          isRevealed={reading.revealed[index]}
                          onCardClick={() => reading.revealCard(index)}
                          onSettledClick={() => handleCardJump(index)}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Hint or countdown + actions */}
                <div className="flex flex-col items-center gap-3 mt-8">
                  {reading.cards.length === 3 && !reading.sealed && (
                    <>
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Sparkles className="size-4" aria-hidden="true" />
                        Tap each card to reveal your fate
                      </p>
                      <Button
                        onClick={reading.revealAll}
                        variant="outline"
                        size="sm"
                        className="rounded-full px-6"
                      >
                        Reveal all
                      </Button>
                    </>
                  )}

                  {reading.sealed && !expired && remaining !== null && (
                    <div className="inline-flex items-baseline gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-sm">
                      <span className="leading-none text-muted-foreground">
                        Next {readingType} reading
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
                      Draw a new reading
                    </Button>
                  )}

                  {reading.sealed && !expired && (
                    <Button
                      onClick={handleShareClick}
                      size="lg"
                      className="rounded-full px-8"
                      disabled={alreadyShared}
                    >
                      {alreadyShared ? "Shared ✓" : "Share your fortune"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Interpretations — each surfaces as its card is revealed */}
              {reading.cards.length === 3 && reading.revealed.some(Boolean) && (
                <div className="mt-10 w-full max-w-2xl space-y-4">
                  <h2 className="font-serif text-2xl font-bold text-center reading-reveal">
                    The interpretation
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
                          <ReadingSection
                            title={POSITION_LABELS[index]}
                            index={index}
                            card={card}
                            highlighted={highlightIndex === index}
                          />
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

      {reading.cards.length === 3 && (
        <TarotShareDialog
          isOpen={isShareDialogOpen}
          onOpenChange={setIsShareDialogOpen}
          cards={reading.cards}
          generatedImage={generatedImage}
          readingType={readingType}
          onSuccess={() => {
            setHasShared(true);
            reading.refetchFortune();
          }}
        />
      )}

      {/* Offscreen layout captured by html-to-image for the share post. */}
      <div
        ref={imageRef}
        className="absolute tarot-image-container"
        style={{ width: 800, height: 418, top: "-9999px", left: "-9999px" }}
        aria-hidden="true"
      >
        <TarotImage
          cards={reading.cards}
          readingType={readingType}
          appName={config.appName}
        />
      </div>
    </div>
  );
}
