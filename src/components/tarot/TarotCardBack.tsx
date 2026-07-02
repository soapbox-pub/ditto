import { MoonStar, Sparkles } from "lucide-react";

/** The face-down back of a tarot card: lattice, medallion, wandering stars. */
export function TarotCardBack() {
  return (
    <div className="tarot-card-back">
      <div className="back-lattice" />
      <Sparkles className="back-star back-star-1" />
      <Sparkles className="back-star back-star-2" />
      <Sparkles className="back-star back-star-3" />
      <Sparkles className="back-star back-star-4" />
      <Sparkles className="back-star back-star-5" />
      <div className="back-ring">
        <MoonStar className="back-emblem" />
      </div>
      <div className="card-sheen" />
    </div>
  );
}
