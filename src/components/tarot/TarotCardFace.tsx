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
import { cardEyebrow, type TarotCardData } from "@/lib/tarot/cards";

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

/**
 * Cards whose single icon doesn't already depict the count get a
 * multi-icon arrangement (the Swords and Coins icons already show pairs).
 */
function CardArt({ card }: { card: TarotCardData }) {
  const IconComponent = icons[card.icon] || Star;
  const lowerCaseName = card.name.toLowerCase();

  if (lowerCaseName === "two of cups") {
    return (
      <div className="two-of-cups">
        <Wine className="card-icon cup-1" />
        <Wine className="card-icon cup-2" />
      </div>
    );
  }

  if (lowerCaseName === "three of swords") {
    return (
      <div className="icon-layout-3 three-of-swords">
        <IconComponent className="card-icon sword-1" />
        <IconComponent className="card-icon sword-2" />
        <IconComponent className="card-icon sword-3" />
      </div>
    );
  }

  if (lowerCaseName.startsWith("three of")) {
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
  const isLongName = card.name.length > 14;

  return (
    <div className={`tarot-face suit-${card.suit}`}>
      <span className="face-corner face-corner-tl" aria-hidden="true">✦</span>
      <span className="face-corner face-corner-tr" aria-hidden="true">✦</span>
      <span className="face-corner face-corner-bl" aria-hidden="true">✦</span>
      <span className="face-corner face-corner-br" aria-hidden="true">✦</span>
      <header className="face-header">
        <span className="face-eyebrow">{cardEyebrow(card)}</span>
        <span className={`face-name ${isLongName ? "long" : ""}`}>
          {card.name}
        </span>
      </header>
      <div className="face-art">
        <CardArt card={card} />
      </div>
      <footer className="face-footer">
        {card.isReversed
          ? <span className="reversed">Reversed</span>
          : <span>Upright</span>}
      </footer>
    </div>
  );
}
