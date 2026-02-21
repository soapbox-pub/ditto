import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers, Shield, Sparkles, Swords, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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

/** Max cards to show in the preview before collapsing. */
const PREVIEW_CARD_COUNT = 8;

export function MagicDeckContent({ event }: { event: NostrEvent }) {
  const title = getTag(event.tags, 'title');
  const banner = getTag(event.tags, 'banner');
  const commanders = getAllTagValues(event.tags, 'C');
  const companion = getTag(event.tags, 'S');
  const tTags = getAllTagValues(event.tags, 't');

  const [expanded, setExpanded] = useState(false);

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

  const isCommander = formatTags.includes('commander') || formatTags.includes('cedh');
  const displayCards = expanded ? mainDeck : mainDeck.slice(0, PREVIEW_CARD_COUNT);
  const hasMore = mainDeck.length > PREVIEW_CARD_COUNT;

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
          <Layers className="size-4 text-primary mt-0.5 shrink-0" />
          <span className="text-[15px] font-semibold leading-snug">{title}</span>
        </div>
      )}

      {/* Format + archetype badges */}
      {(formatTags.length > 0 || archetypeTags.length > 0 || otherTags.length > 0) && (
        <div className="flex flex-wrap gap-1.5 mb-3">
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
        </div>
      )}

      {/* Commander(s) */}
      {commanders.length > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <Shield className="size-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground">
            {isCommander ? 'Commander' : 'Commander'}
            {commanders.length > 1 ? 's' : ''}:
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

      {/* Card count summary */}
      <div className="flex items-center gap-3 mb-2">
        <Badge variant="secondary" className="text-[11px] gap-1 font-medium">
          <Layers className="size-3" />
          {totalCards} cards
        </Badge>
        {totalSideboard > 0 && (
          <Badge variant="secondary" className="text-[11px] gap-1 font-medium">
            {totalSideboard} sideboard
          </Badge>
        )}
      </div>

      {/* Card list */}
      {mainDeck.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="divide-y divide-border/50">
            {displayCards.map((card, i) => (
              <div
                key={`${card.name}-${i}`}
                className="flex items-center justify-between px-3 py-1.5 text-sm hover:bg-secondary/30 transition-colors"
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
            ))}
          </div>

          {/* Expand/collapse */}
          {hasMore && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="flex items-center justify-center gap-1 w-full py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors border-t border-border/50"
            >
              {expanded ? (
                <>
                  <ChevronUp className="size-3.5" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="size-3.5" />
                  {mainDeck.length - PREVIEW_CARD_COUNT} more cards
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Sideboard (only in expanded view) */}
      {expanded && sideboard.length > 0 && (
        <div className="mt-2">
          <span className="text-xs font-medium text-muted-foreground mb-1 block">Sideboard</span>
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="divide-y divide-border/50">
              {sideboard.map((card, i) => (
                <div
                  key={`sb-${card.name}-${i}`}
                  className="flex items-center justify-between px-3 py-1.5 text-sm hover:bg-secondary/30 transition-colors"
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
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
