import { useEffect, useState } from "react";
import type { TarotCardData } from "@/lib/tarot/cards";
import { cn } from "@/lib/utils";
import { TarotCardBack } from "./TarotCardBack";
import { TarotCardFace } from "./TarotCardFace";
import "./TarotReader.css";

interface TarotCardProps {
  card?: TarotCardData;
  isRevealed?: boolean;
  isSpinning?: boolean;
  /** Flip a face-down card. */
  onCardClick?: () => void;
  /** Called when a settled (already revealed) card is clicked. */
  onSettledClick?: () => void;
}

/** Duration of the CSS flip transition, plus a small buffer. */
const FLIP_MS = 950;

/**
 * A single flippable tarot card. Sizes itself to its parent's width
 * (container-query units inside), so place it in a sized wrapper.
 *
 * Once a card is revealed and the flip has finished, it re-renders as a
 * flat, untransformed face — text inside 3D-transformed layers rasterizes
 * blurry, so settled cards leave the 3D context entirely.
 */
export function TarotCard({
  card,
  isRevealed,
  isSpinning,
  onCardClick,
  onSettledClick,
}: TarotCardProps) {
  // Cards that mount already revealed (restored readings, share image)
  // settle immediately and never animate.
  const [settled, setSettled] = useState(!!isRevealed);

  useEffect(() => {
    if (!isRevealed) {
      setSettled(false);
      return;
    }
    const timer = setTimeout(() => setSettled(true), FLIP_MS);
    return () => clearTimeout(timer);
  }, [isRevealed]);

  if (isSpinning || !card) {
    return (
      <div className={`tarot-card ${isSpinning ? "spinning" : ""}`}>
        <div className="tarot-card-inner">
          <TarotCardBack />
        </div>
      </div>
    );
  }

  const label = isRevealed
    ? `${card.name}${card.isReversed ? " (Reversed)" : ""}`
    : "Reveal card";

  // Settled: flat render, no perspective, no backfaces — crisp text.
  if (isRevealed && settled) {
    const face = (
      <div
        className={cn("tarot-card-static", card.isReversed && "reversed-card")}
      >
        <TarotCardFace card={card} />
      </div>
    );

    if (onSettledClick) {
      return (
        <button
          type="button"
          className="tarot-card settled appearance-none bg-transparent border-0 p-0 text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={onSettledClick}
          aria-label={`${label}. Read interpretation`}
        >
          {face}
        </button>
      );
    }

    return (
      <div className="tarot-card settled" role="img" aria-label={label}>
        {face}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cn(
        "tarot-card appearance-none bg-transparent border-0 p-0 text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isRevealed && "flipped",
      )}
      onClick={onCardClick}
      disabled={!onCardClick || isRevealed}
      aria-label={label}
    >
      <div className="tarot-card-inner">
        <TarotCardBack />
        <div
          className={cn(
            "tarot-card-front",
            card.isReversed && "reversed-card",
          )}
        >
          <TarotCardFace card={card} />
        </div>
      </div>
      {/* A faint bloom of light as the face lands. */}
      {isRevealed && <span className="reveal-flash" aria-hidden="true" />}
    </button>
  );
}
