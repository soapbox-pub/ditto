import type { ReadingType, TarotCardData } from "@/lib/tarot/cards";
import { TarotCard } from "./TarotCard";

interface TarotImageProps {
  cards: TarotCardData[];
  readingType: ReadingType;
  appName: string;
}

const POSITION_LABELS = ["Past", "Present", "Future"] as const;

const FAN_TILT = [
  "-rotate-3 translate-y-1",
  "",
  "rotate-3 translate-y-1",
] as const;

/**
 * Offscreen 800x418 layout captured with html-to-image for the share post.
 * Colors are fixed (not themed) so the generated PNG is always legible.
 */
export function TarotImage({ cards, readingType, appName }: TarotImageProps) {
  if (cards.length < 3) {
    return null;
  }

  return (
    <div className="flex flex-col justify-between items-center h-full py-4">
      <h2 className="font-serif text-2xl font-semibold whitespace-nowrap text-amber-200/85">
        {readingType === "daily" ? "Today's Reading" : "This Week's Reading"}
      </h2>
      <div className="flex justify-center items-start gap-8">
        {cards.map((card, index) => (
          <div key={card.name} className="w-[168px]">
            <h3 className="text-center text-xs font-semibold uppercase tracking-[0.25em] text-purple-200/80 mb-2">
              {POSITION_LABELS[index]}
            </h3>
            <div className={FAN_TILT[index]}>
              <TarotCard card={card} isRevealed />
            </div>
          </div>
        ))}
      </div>
      <p className="text-center text-sm font-semibold text-amber-200/85">
        ✦ {appName} ✦
      </p>
    </div>
  );
}
