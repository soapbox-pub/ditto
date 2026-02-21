import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Sparkles, Swords, Image, List } from 'lucide-react';
import { CardsIcon } from '@/components/icons/CardsIcon';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { NostrEvent } from '@nostrify/nostrify';

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

function getAllTagValues(tags: string[][], name: string): string[] {
  return tags.filter(([n]) => n === name).map(([, v]) => v);
}

/** A parsed card entry from `c` or `b` tags. */
interface CardEntry {
  name: string;
  quantity: number;
  setId: string;
  artId: string;
  lang: string;
  foil: boolean;
}

/** Parse a card tag (`c` or `b`) into a CardEntry. */
function parseCardTag(tag: string[]): CardEntry | null {
  if (tag.length < 3) return null;
  const [, name, qty, setId, artId, lang, foil] = tag;
  const quantity = parseInt(qty, 10);
  if (!name || isNaN(quantity) || quantity < 1) return null;
  return {
    name,
    quantity,
    setId: setId ?? '',
    artId: artId ?? '',
    lang: lang ?? '',
    foil: foil === 'foil' || foil === 'true',
  };
}

/**
 * Build a Scryfall image URL for a card.
 * Uses set/collector_number when available for exact printing,
 * otherwise falls back to exact name lookup.
 */
function scryfallImageUrl(card: CardEntry, version: 'small' | 'normal' = 'small'): string {
  if (card.setId && card.artId) {
    return `https://api.scryfall.com/cards/${encodeURIComponent(card.setId.toLowerCase())}/${encodeURIComponent(card.artId)}?format=image&version=${version}`;
  }
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}&format=image&version=${version}`;
}

/** Format labels for MTG formats. */
const FORMAT_LABELS: Record<string, string> = {
  standard: 'Standard',
  modern: 'Modern',
  commander: 'Commander',
  legacy: 'Legacy',
  vintage: 'Vintage',
  pioneer: 'Pioneer',
  pauper: 'Pauper',
  cedh: 'cEDH',
  limited: 'Limited',
  draft: 'Draft',
  sealed: 'Sealed',
  brawl: 'Brawl',
  historic: 'Historic',
  explorer: 'Explorer',
  alchemy: 'Alchemy',
  timeless: 'Timeless',
};

/** Non-format archetype labels. */
const ARCHETYPE_LABELS: Record<string, string> = {
  aggro: 'Aggro',
  midrange: 'Midrange',
  control: 'Control',
  combo: 'Combo',
  tempo: 'Tempo',
  ramp: 'Ramp',
  tribal: 'Tribal',
  burn: 'Burn',
  mill: 'Mill',
  stax: 'Stax',
  tokens: 'Tokens',
  reanimator: 'Reanimator',
  voltron: 'Voltron',
  aristocrats: 'Aristocrats',
};

/** Render a single card row in list view. */
function CardRow({ card }: { card: CardEntry }) {
  return (
    <div className="flex items-center justify-between px-3 py-1 text-[13px] hover:bg-secondary/30 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-muted-foreground tabular-nums text-xs w-5 text-right shrink-0">
          {card.quantity}x
        </span>
        <span className={cn('truncate', card.foil && 'bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent')}>
          {card.name}
        </span>
        {card.foil && (
          <Sparkles className="size-3 text-primary shrink-0" />
        )}
      </div>
      {card.setId && (
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0 ml-2">
          {card.setId}
        </span>
      )}
    </div>
  );
}

/** Render a card as a visual image tile. */
function CardTile({ card }: { card: CardEntry }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    // Fallback: show a placeholder with the card name
    return (
      <div className="relative aspect-[5/7] rounded-lg bg-secondary/60 border border-border flex items-center justify-center p-1">
        <span className="text-[9px] text-center text-muted-foreground leading-tight line-clamp-3">
          {card.name}
        </span>
        {card.quantity > 1 && <QuantityBadge quantity={card.quantity} />}
      </div>
    );
  }

  return (
    <div className="relative aspect-[5/7] rounded-lg overflow-hidden group">
      <img
        src={scryfallImageUrl(card, 'normal')}
        alt={card.name}
        className="w-full h-full object-cover transition-transform group-hover:scale-105"
        loading="lazy"
        onError={() => setFailed(true)}
      />
      {card.foil && (
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/10 to-transparent pointer-events-none" />
      )}
      {card.quantity > 1 && <QuantityBadge quantity={card.quantity} />}
    </div>
  );
}

function QuantityBadge({ quantity }: { quantity: number }) {
  return (
    <span className="absolute top-1 right-1 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none backdrop-blur-sm">
      x{quantity}
    </span>
  );
}

/** Visual spoiler grid of card images. */
function CardGrid({ cards, sideboard }: { cards: CardEntry[]; sideboard: CardEntry[] }) {
  return (
    <ScrollArea className="max-h-[400px]">
      <div className="p-2">
        <div className="grid grid-cols-4 gap-1.5">
          {cards.map((card, i) => (
            <CardTile key={`${card.name}-${i}`} card={card} />
          ))}
        </div>
        {sideboard.length > 0 && (
          <>
            <div className="px-1 py-2 mt-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Sideboard
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {sideboard.map((card, i) => (
                <CardTile key={`sb-${card.name}-${i}`} card={card} />
              ))}
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
}

export function MagicDeckContent({ event }: { event: NostrEvent }) {
  const title = getTag(event.tags, 'title');
  const banner = getTag(event.tags, 'banner');
  const commanders = getAllTagValues(event.tags, 'C');
  const companion = getTag(event.tags, 'S');
  const tTags = getAllTagValues(event.tags, 't');
  const [visualView, setVisualView] = useState(false);

  // Parse main deck and sideboard
  const mainDeck = useMemo(() => {
    return event.tags
      .filter(([n]) => n === 'c')
      .map(parseCardTag)
      .filter((c): c is CardEntry => c !== null);
  }, [event.tags]);

  const sideboard = useMemo(() => {
    return event.tags
      .filter(([n]) => n === 'b')
      .map(parseCardTag)
      .filter((c): c is CardEntry => c !== null);
  }, [event.tags]);

  // Separate format tags from archetype/other tags
  const formatTags = useMemo(() => tTags.filter((t) => t in FORMAT_LABELS), [tTags]);
  const archetypeTags = useMemo(() => tTags.filter((t) => t in ARCHETYPE_LABELS), [tTags]);
  const otherTags = useMemo(
    () => tTags.filter((t) => !(t in FORMAT_LABELS) && !(t in ARCHETYPE_LABELS)),
    [tTags],
  );

  const totalCards = useMemo(() => mainDeck.reduce((sum, c) => sum + c.quantity, 0), [mainDeck]);
  const totalSideboard = useMemo(() => sideboard.reduce((sum, c) => sum + c.quantity, 0), [sideboard]);

  return (
    <div className="mt-2">
      {/* Banner image */}
      {banner && (
        <div className="rounded-2xl overflow-hidden mb-3">
          <img
            src={banner}
            alt={title ?? 'Magic deck'}
            className="w-full max-h-[200px] object-cover"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Title */}
      {title && (
        <div className="flex items-start gap-2 mb-2">
          <CardsIcon className="size-4 text-primary mt-0.5 shrink-0" />
          <span className="text-[15px] font-semibold leading-snug">{title}</span>
        </div>
      )}

      {/* Commander(s) */}
      {commanders.length > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <Shield className="size-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground">
            Commander{commanders.length > 1 ? 's' : ''}:
          </span>
          <span className="text-xs font-medium">
            {commanders.join(' & ')}
          </span>
        </div>
      )}

      {/* Companion */}
      {companion && (
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="size-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground">Companion:</span>
          <span className="text-xs font-medium">{companion}</span>
        </div>
      )}

      {/* Format badges + card count + sideboard — all on one line */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {formatTags.map((tag) => (
          <Link
            key={tag}
            to={`/t/${encodeURIComponent(tag)}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Badge variant="secondary" className="text-[11px] gap-1 font-medium hover:bg-secondary/80 transition-colors">
              <Swords className="size-3" />
              {FORMAT_LABELS[tag] ?? tag}
            </Badge>
          </Link>
        ))}
        {archetypeTags.map((tag) => (
          <Link
            key={tag}
            to={`/t/${encodeURIComponent(tag)}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Badge variant="outline" className="text-[11px] font-medium hover:bg-secondary/80 transition-colors">
              {ARCHETYPE_LABELS[tag] ?? tag}
            </Badge>
          </Link>
        ))}
        {otherTags.map((tag) => (
          <Link
            key={tag}
            to={`/t/${encodeURIComponent(tag)}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Badge variant="outline" className="text-[11px] font-medium hover:bg-secondary/80 transition-colors">
              {tag}
            </Badge>
          </Link>
        ))}
        <Badge variant="secondary" className="text-[11px] gap-1 font-medium">
          <CardsIcon className="size-3" />
          {totalCards} cards
        </Badge>
        {totalSideboard > 0 && (
          <Badge variant="secondary" className="text-[11px] gap-1 font-medium">
            {totalSideboard} sideboard
          </Badge>
        )}
      </div>

      {/* Card list / visual spoiler */}
      {mainDeck.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden" onClick={(e) => e.stopPropagation()}>
          {/* View toggle header */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-secondary/30 border-b border-border/50">
            <span className="text-[11px] font-medium text-muted-foreground">
              {visualView ? 'Visual Spoiler' : 'Decklist'}
            </span>
            <button
              onClick={() => setVisualView(!visualView)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {visualView ? <List className="size-3.5" /> : <Image className="size-3.5" />}
              {visualView ? 'List' : 'Visual'}
            </button>
          </div>

          {visualView ? (
            <CardGrid cards={mainDeck} sideboard={sideboard} />
          ) : (
            <ScrollArea className="max-h-[240px]">
              <div>
                {mainDeck.map((card, i) => (
                  <CardRow key={`${card.name}-${i}`} card={card} />
                ))}

                {/* Sideboard inline */}
                {sideboard.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 bg-secondary/40 border-y border-border/50">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Sideboard
                      </span>
                    </div>
                    {sideboard.map((card, i) => (
                      <CardRow key={`sb-${card.name}-${i}`} card={card} />
                    ))}
                  </>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}
