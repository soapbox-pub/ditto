import {
  BookOpen,
  Castle,
  CircleDollarSign,
  Coins,
  Crown,
  createLucideIcon,
  Dumbbell,
  Flame,
  Gavel,
  Gem,
  HandHeart,
  LoaderPinwheel,
  MoonStar,
  Scale,
  Scroll,
  Shield,
  Skull,
  Sparkles,
  Sprout,
  Star,
  Sun,
  Sword,
  Swords,
  Tornado,
  Wand,
  WandSparkles,
  Wine,
} from "lucide-react";
import {
  cauldron,
  goblet,
  hedgehog,
  pacManGhost,
  planet,
  pumpkin,
  wineGlassBottle,
} from "@lucide/lab";
import { defineMessages, FormattedMessage } from "react-intl";
import { useTarotText } from "@/hooks/useTarotText";
import { cardNumeral, type TarotCardData, type TarotSuit } from "@/lib/tarot/cards";
import { tarotCardName } from "@/lib/tarot/text";

const Cauldron = createLucideIcon("Cauldron", cauldron);
const Goblet = createLucideIcon("Goblet", goblet);
const Pumpkin = createLucideIcon("Pumpkin", pumpkin);
const Hedgehog = createLucideIcon("Hedgehog", hedgehog);
const Ghost = createLucideIcon("Ghost", pacManGhost);
const Planet = createLucideIcon("Planet", planet);
const WineGlassBottle = createLucideIcon("WineGlassBottle", wineGlassBottle);

const icons: Record<
  string,
  React.ComponentType<React.SVGProps<SVGSVGElement>>
> = {
  sparkles: Sparkles,
  "wand-sparkles": WandSparkles,
  "book-open": BookOpen,
  crown: Crown,
  castle: Castle,
  scroll: Scroll,
  "hand-heart": HandHeart,
  shield: Shield,
  dumbbell: Dumbbell,
  hedgehog: Hedgehog,
  "loader-pinwheel": LoaderPinwheel,
  scale: Scale,
  ghost: Ghost,
  skull: Skull,
  goblet: Goblet,
  pumpkin: Pumpkin,
  tornado: Tornado,
  star: Star,
  "moon-star": MoonStar,
  sun: Sun,
  gavel: Gavel,
  globe: Planet,
  wand: Wand,
  sprout: Sprout,
  flame: Flame,
  wine: Wine,
  wineGlassBottle: WineGlassBottle,
  cauldron: Cauldron,
  sword: Sword,
  swords: Swords,
  "circle-dollar-sign": CircleDollarSign,
  coins: Coins,
  gem: Gem,
};

const SUIT_LABELS = defineMessages<Exclude<TarotSuit, "major">>({
  wands: { id: "tarot.suit.wands", defaultMessage: "Wands" },
  cups: { id: "tarot.suit.cups", defaultMessage: "Cups" },
  swords: { id: "tarot.suit.swords", defaultMessage: "Swords" },
  pentacles: { id: "tarot.suit.pentacles", defaultMessage: "Pentacles" },
});

/**
 * Cards whose single icon doesn't already depict the count get a
 * multi-icon arrangement (the Swords and Coins icons already show pairs).
 */
function CardArt({ card }: { card: TarotCardData }) {
  const IconComponent = icons[card.icon] || Star;

  if (card.id === "two-of-cups") {
    return (
      <div className="two-of-cups">
        <Wine className="card-icon cup-1" />
        <Wine className="card-icon cup-2" />
      </div>
    );
  }

  if (card.id === "three-of-swords") {
    return (
      <div className="icon-layout-3 three-of-swords">
        <IconComponent className="card-icon sword-1" />
        <IconComponent className="card-icon sword-2" />
        <IconComponent className="card-icon sword-3" />
      </div>
    );
  }

  if (card.id.startsWith("three-of-")) {
    return (
      <div className="icon-layout-3">
        <div className="row-1">
          <IconComponent className="card-icon" />
        </div>
        <div className="row-2">
          <IconComponent className="card-icon" />
          <IconComponent className="card-icon" />
        </div>
      </div>
    );
  }

  return (
    <div className="icon-medallion">
      <div className="icon-glow" />
      <IconComponent className="card-icon" />
    </div>
  );
}

interface TarotCardFaceProps {
  card: TarotCardData;
}

/** The face-up front of a tarot card: numeral, name, artwork, orientation. */
export function TarotCardFace({ card }: TarotCardFaceProps) {
  const name = tarotCardName(useTarotText(), card);
  const isLongName = name.length > 14;

  return (
    <div className={`tarot-face suit-${card.suit}`}>
      <span className="face-corner face-corner-tl" aria-hidden="true">✦</span>
      <span className="face-corner face-corner-tr" aria-hidden="true">✦</span>
      <span className="face-corner face-corner-bl" aria-hidden="true">✦</span>
      <span className="face-corner face-corner-br" aria-hidden="true">✦</span>
      <header className="face-header">
        <span className="face-eyebrow">
          {card.suit === "major"
            ? cardNumeral(card)
            : <FormattedMessage {...SUIT_LABELS[card.suit]} />}
        </span>
        <span className={`face-name ${isLongName ? "long" : ""}`}>
          {name}
        </span>
      </header>
      <div className="face-art">
        <CardArt card={card} />
      </div>
      <footer className="face-footer">
        {card.isReversed
          ? (
            <span className="reversed">
              <FormattedMessage id="tarot.orientation.reversed" defaultMessage="Reversed" />
            </span>
          )
          : (
            <span>
              <FormattedMessage id="tarot.orientation.upright" defaultMessage="Upright" />
            </span>
          )}
      </footer>
    </div>
  );
}
