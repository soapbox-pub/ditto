import { useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Sparkles, Swords, Palette, List } from 'lucide-react';
import { CardsIcon } from '@/components/icons/CardsIcon';
import { Lightbox } from '@/components/ImageGallery';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { scryfallImageUrl } from '@/lib/scryfall';
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
function CardRow({ card, onClick }: { card: CardEntry; onClick?: () => void }) {
  return (
    <div
      className="flex items-center justify-between px-3 py-1 text-[13px] hover:bg-secondary/30 transition-colors cursor-pointer"
      onClick={onClick}
    >
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
function CardTile({ card, onClick }: { card: CardEntry; onClick?: () => void }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className="relative aspect-[5/7] rounded-lg bg-secondary/60 border border-border flex items-center justify-center p-1 cursor-pointer"
        onClick={onClick}
      >
        <span className="text-[9px] text-center text-muted-foreground leading-tight line-clamp-3">
          {card.name}
        </span>
        {card.quantity > 1 && <QuantityBadge quantity={card.quantity} />}
      </div>
    );
  }

  return (
    <div className="relative aspect-[5/7] rounded-lg overflow-hidden group cursor-pointer" onClick={onClick}>
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

/** Top bar content for the card lightbox showing card name and foil indicator. */
function CardLightboxTopBar({ card, index, total }: { card: CardEntry; index: number; total: number }) {
  return (
    <div className="flex items-center gap-3">
      {total > 1 && (
        <span className="text-white/80 text-sm font-medium tabular-nums">
          {index + 1} / {total}
        </span>
      )}
      <span className="text-white text-sm font-medium truncate max-w-[200px]">
        {card.name}
      </span>
      {card.foil && <Sparkles className="size-3.5 text-amber-400 shrink-0" />}
    </div>
  );
}

export function MagicDeckContent({ event }: { event: NostrEvent }) {
  const title = getTag(event.tags, 'title');
  const banner = getTag(event.tags, 'banner');
  const commanders = getAllTagValues(event.tags, 'C');
  const companion = getTag(event.tags, 'S');
  const tTags = getAllTagValues(event.tags, 't');
  const [visualView, setVisualView] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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

  // All cards in one flat list for lightbox navigation
  const allCards = useMemo(() => [...mainDeck, ...sideboard], [mainDeck, sideboard]);

  // Separate format tags from archetype/other tags
  const formatTags = useMemo(() => tTags.filter((t) => t in FORMAT_LABELS), [tTags]);
  const archetypeTags = useMemo(() => tTags.filter((t) => t in ARCHETYPE_LABELS), [tTags]);
  const otherTags = useMemo(
    () => tTags.filter((t) => !(t in FORMAT_LABELS) && !(t in ARCHETYPE_LABELS)),
    [tTags],
  );

  const totalCards = useMemo(() => mainDeck.reduce((sum, c) => sum + c.quantity, 0), [mainDeck]);
  const totalSideboard = useMemo(() => sideboard.reduce((sum, c) => sum + c.quantity, 0), [sideboard]);

  const openLightbox = useCallback((index: number) => { setLightboxIndex(index); }, []);
  const closeLightbox = useCallback(() => { setLightboxIndex(null); }, []);
  const goNext = useCallback(() => { setLightboxIndex((prev) => (prev !== null ? (prev + 1) % allCards.length : null)); }, [allCards.length]);
  const goPrev = useCallback(() => { setLightboxIndex((prev) => (prev !== null ? (prev - 1 + allCards.length) % allCards.length : null)); }, [allCards.length]);

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
              {visualView ? <List className="size-3.5" /> : <Palette className="size-3.5" />}
              {visualView ? 'List' : 'Visual'}
            </button>
          </div>

          {visualView ? (
            /* Visual spoiler grid */
            <div className="max-h-[400px] overflow-y-auto p-2">
              <div className="grid grid-cols-4 gap-1.5">
                {mainDeck.map((card, i) => (
                  <CardTile key={`${card.name}-${i}`} card={card} onClick={() => openLightbox(i)} />
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
                      <CardTile
                        key={`sb-${card.name}-${i}`}
                        card={card}
                        onClick={() => openLightbox(mainDeck.length + i)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            /* Text decklist */
            <div className="max-h-[240px] overflow-y-auto">
              {mainDeck.map((card, i) => (
                <CardRow key={`${card.name}-${i}`} card={card} onClick={() => openLightbox(i)} />
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
                    <CardRow
                      key={`sb-${card.name}-${i}`}
                      card={card}
                      onClick={() => openLightbox(mainDeck.length + i)}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Card lightbox */}
      {lightboxIndex !== null && allCards.length > 0 && (
        <Lightbox
          images={allCards.map((c) => scryfallImageUrl(c, 'large'))}
          currentIndex={lightboxIndex}
          onClose={closeLightbox}
          onNext={goNext}
          onPrev={goPrev}
          showDownload={false}
          maxDotIndicators={20}
          topBarLeft={
            <CardLightboxTopBar
              card={allCards[lightboxIndex]}
              index={lightboxIndex}
              total={allCards.length}
            />
          }
        />
      )}
    </div>
  );
}
