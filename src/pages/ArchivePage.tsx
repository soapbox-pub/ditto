import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { defineMessage, FormattedMessage, useIntl, type MessageDescriptor } from 'react-intl';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { useSeoMeta } from '@/hooks/useSeoMeta';
import { Archive, Gamepad2, Film, Mic, Monitor, Sparkles, Play, ExternalLink, Clock, Search, X, Loader2 } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppContext } from '@/hooks/useAppContext';
import { useArchiveSearch, type ArchiveSearchResult } from '@/hooks/useArchiveSearch';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ArchiveItem {
  /** archive.org item identifier */
  identifier: string;
  /** Display title */
  title: string;
  /** Year (optional) */
  year?: string;
  /** Brief one-liner */
  tagline: MessageDescriptor;
  /** Category for filtering */
  category: Category;
}

type Category = 'games' | 'films' | 'audio' | 'software' | 'animation' | 'tv';

interface CategoryMeta {
  label: MessageDescriptor;
  icon: React.ReactNode;
  gradient: string;
  accent: string;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const CATEGORIES: Record<Category, CategoryMeta> = {
  games: {
    label: defineMessage({ id: 'archive.category.games', defaultMessage: 'Classic Games' }),
    icon: <Gamepad2 className="size-4" />,
    gradient: 'from-violet-500/20 to-fuchsia-500/20',
    accent: 'text-violet-500 dark:text-violet-400',
  },
  films: {
    label: defineMessage({ id: 'archive.category.films', defaultMessage: 'Public Domain Films' }),
    icon: <Film className="size-4" />,
    gradient: 'from-amber-500/20 to-orange-500/20',
    accent: 'text-amber-600 dark:text-amber-400',
  },
  audio: {
    label: defineMessage({ id: 'archive.category.audio', defaultMessage: 'Audio Treasures' }),
    icon: <Mic className="size-4" />,
    gradient: 'from-emerald-500/20 to-teal-500/20',
    accent: 'text-emerald-600 dark:text-emerald-400',
  },
  tv: {
    label: defineMessage({ id: 'archive.category.tv', defaultMessage: 'Classic Television' }),
    icon: <Monitor className="size-4" />,
    gradient: 'from-sky-500/20 to-cyan-500/20',
    accent: 'text-sky-600 dark:text-sky-400',
  },
  animation: {
    label: defineMessage({ id: 'archive.category.animation', defaultMessage: 'Classic Cartoons' }),
    icon: <Sparkles className="size-4" />,
    gradient: 'from-pink-500/20 to-rose-500/20',
    accent: 'text-pink-500 dark:text-pink-400',
  },
  software: {
    label: defineMessage({ id: 'archive.category.software', defaultMessage: 'Software History' }),
    icon: <Archive className="size-4" />,
    gradient: 'from-blue-500/20 to-indigo-500/20',
    accent: 'text-blue-600 dark:text-blue-400',
  },
};

const ITEMS: ArchiveItem[] = [
  // ── Classic Games ────────────────────────────────────────────
  {
    identifier: 'msdos_Oregon_Trail_The_1990',
    title: 'The Oregon Trail',
    year: '1990',
    tagline: defineMessage({ id: 'archive.item.theOregonTrail', defaultMessage: 'You have died of dysentery. The game that traumatized a generation.' }),
    category: 'games',
  },
  {
    identifier: 'msdos_Prince_of_Persia_1990',
    title: 'Prince of Persia',
    year: '1990',
    tagline: defineMessage({ id: 'archive.item.princeOfPersia', defaultMessage: 'Rotoscoped beauty. 60 minutes to save the princess.' }),
    category: 'games',
  },
  {
    identifier: 'msdos_Wolfenstein_3D_1992',
    title: 'Wolfenstein 3D',
    year: '1992',
    tagline: defineMessage({ id: 'archive.item.wolfenstein3d', defaultMessage: 'The grandfather of first-person shooters.' }),
    category: 'games',
  },
  {
    identifier: 'msdos_SimCity_1989',
    title: 'SimCity',
    year: '1989',
    tagline: defineMessage({ id: 'archive.item.simcity', defaultMessage: 'Build your dream city. Watch it get destroyed by Godzilla.' }),
    category: 'games',
  },
  {
    identifier: 'msdos_Pac-Man_1983',
    title: 'Pac-Man',
    year: '1983',
    tagline: defineMessage({ id: 'archive.item.pacMan', defaultMessage: 'Waka waka waka waka waka.' }),
    category: 'games',
  },
  {
    identifier: 'Doom-2',
    title: 'Doom II',
    year: '1994',
    tagline: defineMessage({ id: 'archive.item.doomIi', defaultMessage: 'Rip and tear, until it is done.' }),
    category: 'games',
  },
  {
    identifier: 'msdos_Donkey_Kong_1983',
    title: 'Donkey Kong',
    year: '1983',
    tagline: defineMessage({ id: 'archive.item.donkeyKong', defaultMessage: 'The game that introduced the world to Mario.' }),
    category: 'games',
  },
  {
    identifier: 'msdos_Where_in_the_World_is_Carmen_Sandiego_Enhanced_1989',
    title: 'Where in the World is Carmen Sandiego?',
    year: '1989',
    tagline: defineMessage({ id: 'archive.item.whereInTheWorldIsCarmenSandiego', defaultMessage: 'Geography class never felt this cool.' }),
    category: 'games',
  },
  {
    identifier: 'msdos_Golden_Axe_1990',
    title: 'Golden Axe',
    year: '1990',
    tagline: defineMessage({ id: 'archive.item.goldenAxe', defaultMessage: 'Hack, slash, and ride dragons through a fantasy realm.' }),
    category: 'games',
  },
  {
    identifier: 'msdos_Scorched_Earth_1991',
    title: 'Scorched Earth',
    year: '1991',
    tagline: defineMessage({ id: 'archive.item.scorchedEarth', defaultMessage: 'The mother of all games. Nuclear tanks on pixel hills.' }),
    category: 'games',
  },
  {
    identifier: 'msdos_Dune_2_-_The_Building_of_a_Dynasty_1992',
    title: 'Dune II',
    year: '1992',
    tagline: defineMessage({ id: 'archive.item.duneIi', defaultMessage: 'The game that invented real-time strategy.' }),
    category: 'games',
  },
  {
    identifier: 'msdos_Leisure_Suit_Larry_1_-_Land_of_the_Lounge_Lizards_1987',
    title: 'Leisure Suit Larry',
    year: '1987',
    tagline: defineMessage({ id: 'archive.item.leisureSuitLarry', defaultMessage: 'The most awkward adventure in gaming history.' }),
    category: 'games',
  },

  // ── Flash Games ──────────────────────────────────────────────
  {
    identifier: 'stick-rpg-complete',
    title: 'Stick RPG Complete',
    tagline: defineMessage({ id: 'archive.item.stickRpgComplete', defaultMessage: 'The Flash game that consumed entire afternoons.' }),
    category: 'games',
  },
  {
    identifier: 'the-binding-of-isaac_202111',
    title: 'The Binding of Isaac (Flash)',
    tagline: defineMessage({ id: 'archive.item.theBindingOfIsaacFlash', defaultMessage: "Edmund McMillen's dark roguelike masterpiece, original Flash version." }),
    category: 'games',
  },

  // ── Public Domain Films ──────────────────────────────────────
  {
    identifier: 'Nosferatu_most_complete_version_93_mins.',
    title: 'Nosferatu',
    year: '1922',
    tagline: defineMessage({ id: 'archive.item.nosferatu', defaultMessage: 'The unauthorized Dracula adaptation that became an immortal classic.' }),
    category: 'films',
  },
  {
    identifier: 'Night.Of.The.Living.Dead_1080p',
    title: 'Night of the Living Dead',
    year: '1968',
    tagline: defineMessage({ id: 'archive.item.nightOfTheLivingDead', defaultMessage: 'George Romero invented an entire genre in one night.' }),
    category: 'films',
  },
  {
    identifier: 'his_girl_friday',
    title: 'His Girl Friday',
    year: '1940',
    tagline: defineMessage({ id: 'archive.item.hisGirlFriday', defaultMessage: 'Rapid-fire dialogue. Cary Grant at his most charming.' }),
    category: 'films',
  },
  {
    identifier: 'house_on_haunted_hill_ipod',
    title: 'House on Haunted Hill',
    year: '1959',
    tagline: defineMessage({ id: 'archive.item.houseOnHauntedHill', defaultMessage: 'Vincent Price offers $10,000 to anyone who survives the night.' }),
    category: 'films',
  },
  {
    identifier: 'Sita_Sings_the_Blues',
    title: 'Sita Sings the Blues',
    year: '2008',
    tagline: defineMessage({ id: 'archive.item.sitaSingsTheBlues', defaultMessage: 'Ancient Indian epic meets 1920s jazz. A creative commons triumph.' }),
    category: 'films',
  },
  {
    identifier: '774-plan-9-from-outer-space',
    title: 'Plan 9 from Outer Space',
    year: '1957',
    tagline: defineMessage({ id: 'archive.item.plan9FromOuterSpace', defaultMessage: 'The "worst movie ever made" is the best movie ever made.' }),
    category: 'films',
  },

  // ── Classic TV ───────────────────────────────────────────────
  {
    identifier: 'theloneranger_201705',
    title: 'The Lone Ranger',
    tagline: defineMessage({ id: 'archive.item.theLoneRanger', defaultMessage: 'Hi-yo, Silver! Away! Justice rides on horseback.' }),
    category: 'tv',
  },
  {
    identifier: 'get-smart',
    title: 'Get Smart',
    tagline: defineMessage({ id: 'archive.item.getSmart', defaultMessage: 'Would you believe... the funniest spy show ever made?' }),
    category: 'tv',
  },
  {
    identifier: 'GreenAcresCompleteSeries',
    title: 'Green Acres',
    tagline: defineMessage({ id: 'archive.item.greenAcres', defaultMessage: 'A New York lawyer moves to the country. Chaos follows.' }),
    category: 'tv',
  },

  // ── Audio Treasures ──────────────────────────────────────────
  {
    identifier: 'gd77-05-08.sbd.hicks.4982.sbeok.shnf',
    title: 'Grateful Dead - Cornell \'77',
    year: '1977',
    tagline: defineMessage({ id: 'archive.item.gratefulDeadCornell77', defaultMessage: 'The greatest live concert recording of all time. No debate.' }),
    category: 'audio',
  },
  {
    identifier: 'alice_in_wonderland_librivox',
    title: 'Alice\'s Adventures in Wonderland',
    tagline: defineMessage({ id: 'archive.item.alicesAdventuresInWonderland', defaultMessage: "Lewis Carroll's masterpiece, read aloud for free. Down the rabbit hole." }),
    category: 'audio',
  },
  {
    identifier: 'art_of_war_librivox',
    title: 'The Art of War',
    tagline: defineMessage({ id: 'archive.item.theArtOfWar', defaultMessage: "Sun Tzu's timeless strategy treatise. The most downloaded audiobook on the internet." }),
    category: 'audio',
  },
  {
    identifier: 'ird059',
    title: 'The Conet Project',
    tagline: defineMessage({ id: 'archive.item.theConetProject', defaultMessage: 'Recordings of mysterious shortwave numbers stations. Pure Cold War eeriness.' }),
    category: 'audio',
  },
  {
    identifier: 'adventures_holmes',
    title: 'The Adventures of Sherlock Holmes',
    tagline: defineMessage({ id: 'archive.item.theAdventuresOfSherlockHolmes', defaultMessage: 'Elementary, my dear Watson. 12 stories of deduction.' }),
    category: 'audio',
  },

  // ── Classic Cartoons ─────────────────────────────────────────
  {
    identifier: 'BettyBoopCartoons',
    title: 'Betty Boop Cartoons',
    tagline: defineMessage({ id: 'archive.item.bettyBoopCartoons', defaultMessage: 'Boop-Oop-a-Doop! Pre-code animation at its most daring.' }),
    category: 'animation',
  },
  {
    identifier: 'superman_the_mechanical_monsters',
    title: 'Superman: The Mechanical Monsters',
    year: '1941',
    tagline: defineMessage({ id: 'archive.item.supermanTheMechanicalMonsters', defaultMessage: "Fleischer Studios' gorgeous Art Deco Superman. Still jaw-dropping." }),
    category: 'animation',
  },
  {
    identifier: 'popeye_patriotic_popeye',
    title: 'Patriotic Popeye',
    tagline: defineMessage({ id: 'archive.item.patrioticPopeye', defaultMessage: 'I yam what I yam! Spinach-fueled heroics.' }),
    category: 'animation',
  },
  {
    identifier: 'bb_minnie_the_moocher',
    title: 'Betty Boop: Minnie the Moocher',
    tagline: defineMessage({ id: 'archive.item.bettyBoopMinnieTheMoocher', defaultMessage: 'Cab Calloway rotoscoped into a ghost walrus. Peak surrealism.' }),
    category: 'animation',
  },
  {
    identifier: 'woody_woodpecker_pantry_panic',
    title: 'Woody Woodpecker: Pantry Panic',
    tagline: defineMessage({ id: 'archive.item.woodyWoodpeckerPantryPanic', defaultMessage: 'Ha-ha-ha-HA-ha! The bird who drove everyone insane.' }),
    category: 'animation',
  },

  // ── Flash Animations ─────────────────────────────────────────
  {
    identifier: 'flash_badger',
    title: 'Badger Badger Badger',
    tagline: defineMessage({ id: 'archive.item.badgerBadgerBadger', defaultMessage: 'Mushroom! MUSHROOM! A snake! Peak early internet.' }),
    category: 'animation',
  },
  {
    identifier: 'peanut-butter-jelly-time',
    title: 'Peanut Butter Jelly Time',
    tagline: defineMessage({ id: 'archive.item.peanutButterJellyTime', defaultMessage: 'A dancing banana changed the internet forever.' }),
    category: 'animation',
  },

  // ── Prelinger Archives / Educational Films ───────────────────
  {
    identifier: 'DuckandC1951',
    title: 'Duck and Cover',
    year: '1951',
    tagline: defineMessage({ id: 'archive.item.duckAndCover', defaultMessage: 'Bert the Turtle taught kids to survive nuclear war. (Spoiler: no.)' }),
    category: 'films',
  },

  // ── Software History ─────────────────────────────────────────
  {
    identifier: 'win95_in_dosbox',
    title: 'Windows 95 in Your Browser',
    tagline: defineMessage({ id: 'archive.item.windows95InYourBrowser', defaultMessage: 'The startup sound that changed personal computing. Press Start.' }),
    category: 'software',
  },
  {
    identifier: 'win3_stock',
    title: 'Windows 3.11',
    tagline: defineMessage({ id: 'archive.item.windows311', defaultMessage: 'Program Manager, File Manager, Solitaire. The holy trinity.' }),
    category: 'software',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function thumbnailUrl(identifier: string): string {
  return `https://archive.org/services/img/${identifier}`;
}

function archiveUrl(identifier: string): string {
  return `https://archive.org/details/${identifier}`;
}

function dittoUrl(identifier: string): string {
  return `/i/${encodeURIComponent(archiveUrl(identifier))}`;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function CategoryPill({ category, active, onClick }: {
  category: Category | 'all';
  active: boolean;
  onClick: () => void;
}) {
  const meta = category === 'all'
    ? { label: defineMessage({ id: 'archive.category.all', defaultMessage: 'All' }), icon: <Sparkles className="size-3.5" />, accent: 'text-primary' }
    : CATEGORIES[category];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap shrink-0',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground',
      )}
    >
      {meta.icon}
      <FormattedMessage {...meta.label} />
    </button>
  );
}

function ArchiveCard({ item }: { item: ArchiveItem }) {
  const meta = CATEGORIES[item.category];

  return (
    <Link
      to={dittoUrl(item.identifier)}
      className="group block rounded-2xl border border-border-subtle overflow-hidden bg-card hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
    >
      {/* Thumbnail */}
      <div className={cn('relative aspect-[4/3] overflow-hidden bg-gradient-to-br', meta.gradient)}>
        <img
          src={thumbnailUrl(item.identifier)}
          alt={item.title}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
          decoding="async"
        />

        {/* Hover play overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-300 flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-primary/90 rounded-full p-3 shadow-lg">
            <Play className="size-5 text-primary-foreground ml-0.5" fill="currentColor" />
          </div>
        </div>

        {/* Year badge */}
        {item.year && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-white text-xs font-medium flex items-center gap-1">
            <Clock className="size-3" />
            {item.year}
          </div>
        )}

        {/* Category badge */}
        <div className={cn(
          'absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-xs font-medium flex items-center gap-1 text-white',
        )}>
          {meta.icon}
          <FormattedMessage {...meta.label} />
        </div>
      </div>

      {/* Content */}
      <div className="p-3 space-y-1">
        <h3 className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors line-clamp-1">
          {item.title}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          <FormattedMessage {...item.tagline} />
        </p>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Search bar
// ---------------------------------------------------------------------------

/** Maps archive.org mediatype to a human-friendly label. */
const MEDIATYPE_LABELS: Record<string, MessageDescriptor> = {
  software: defineMessage({ id: 'archive.mediatype.software', defaultMessage: 'Software' }),
  movies: defineMessage({ id: 'archive.mediatype.movies', defaultMessage: 'Video' }),
  audio: defineMessage({ id: 'archive.mediatype.audio', defaultMessage: 'Audio' }),
  etree: defineMessage({ id: 'archive.mediatype.etree', defaultMessage: 'Live Music' }),
  texts: defineMessage({ id: 'archive.mediatype.texts', defaultMessage: 'Text' }),
};

function mediatypeLabel(mediatype: string): React.ReactNode {
  const label = MEDIATYPE_LABELS[mediatype];
  return label ? <FormattedMessage {...label} /> : mediatype;
}

function ArchiveSearchBar() {
  const intl = useIntl();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { data: results, isFetching } = useArchiveSearch(debouncedQuery);

  // 400ms debounce (slightly longer than book search since archive.org can be slower)
  const handleChange = useCallback((value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value.trim());
    }, 400);
  }, []);

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  // Open dropdown when we have results
  useEffect(() => {
    if (debouncedQuery.length >= 2 && results && results.length > 0) {
      setDropdownOpen(true);
    } else if (debouncedQuery.length >= 2 && results && results.length === 0 && !isFetching) {
      setDropdownOpen(true);
    }
  }, [debouncedQuery, results, isFetching]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback((identifier: string) => {
    setQuery('');
    setDebouncedQuery('');
    setDropdownOpen(false);
    inputRef.current?.blur();
    navigate(dittoUrl(identifier));
  }, [navigate]);

  const handleClear = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    setDropdownOpen(false);
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setDropdownOpen(false);
      inputRef.current?.blur();
    }
    if (e.key === 'Enter' && results && results.length > 0) {
      e.preventDefault();
      handleSelect(results[0].identifier);
    }
  }, [results, handleSelect]);

  return (
    <div ref={containerRef} className="relative px-4 pb-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          type="text"
          placeholder={intl.formatMessage({ id: 'archive.searchPlaceholder', defaultMessage: 'Search the Internet Archive...' })}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            if (debouncedQuery.length >= 2) setDropdownOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="pl-9 pr-9 h-9 text-base md:text-sm rounded-full"
        />
        {query ? (
          <button
            type="button"
            onClick={handleClear}
            aria-label={intl.formatMessage({ id: 'archive.clearSearch', defaultMessage: 'Clear search' })}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {/* Search results dropdown */}
      {dropdownOpen && debouncedQuery.length >= 2 && (
        <div className="absolute left-4 right-4 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
          {isFetching && (!results || results.length === 0) ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <Skeleton className="w-10 h-10 rounded shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : results && results.length > 0 ? (
            <div className="divide-y divide-border max-h-80 overflow-y-auto">
              {results.map((result) => (
                <ArchiveSearchResultItem
                  key={result.identifier}
                  result={result}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              <FormattedMessage id="archive.noResults" defaultMessage="No results found for “{query}”" values={{ query: debouncedQuery }} />
            </div>
          )}

          {/* Loading indicator when results exist but we're refetching */}
          {isFetching && results && results.length > 0 && (
            <div className="flex justify-center py-2 border-t border-border">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ArchiveSearchResultItem({ result, onSelect }: { result: ArchiveSearchResult; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      className="flex items-center gap-3 px-3 py-2.5 w-full text-left hover:bg-secondary/60 transition-colors"
      onClick={() => onSelect(result.identifier)}
    >
      <img
        src={thumbnailUrl(result.identifier)}
        alt=""
        className="w-10 h-10 rounded object-cover bg-secondary shrink-0"
        loading="lazy"
        onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
        decoding="async"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{result.title}</p>
        <p className="text-xs text-muted-foreground truncate">
          {mediatypeLabel(result.mediatype)}
          {result.downloads > 0 && <> &middot; <FormattedMessage id="archive.downloads" defaultMessage="{count} downloads" values={{ count: formatDownloads(result.downloads) }} /></>}
        </p>
      </div>
    </button>
  );
}

/** Format a download count into a compact human-readable string. */
function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const CATEGORY_ORDER: (Category | 'all')[] = ['all', 'games', 'films', 'animation', 'audio', 'tv', 'software'];

export function ArchivePage() {
  const intl = useIntl();
  const { config } = useAppContext();
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all');

  useSeoMeta({
    title: intl.formatMessage({ id: 'archive.seoTitle', defaultMessage: 'Archive | {appName}' }, { appName: config.appName }),
    description: intl.formatMessage({ id: 'archive.seoDescription', defaultMessage: 'Explore the best of the Internet Archive: classic games, films, music, and more.' }),
  });

  const filtered = useMemo(() => {
    if (activeCategory === 'all') return ITEMS;
    return ITEMS.filter((item) => item.category === activeCategory);
  }, [activeCategory]);

  return (
    <main>
      <PageHeader
        title={intl.formatMessage({ id: 'archive.title', defaultMessage: 'Archive' })}
        icon={<Archive className="size-5" />}
        subtitle={intl.formatMessage({ id: 'archive.subtitle', defaultMessage: 'Treasures from the Internet Archive' })}
      >
        <a
          href="https://archive.org"
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          title={intl.formatMessage({ id: 'archive.visit', defaultMessage: 'Visit archive.org' })}
          aria-label={intl.formatMessage({ id: 'archive.visit', defaultMessage: 'Visit archive.org' })}
        >
          <ExternalLink className="size-4" />
        </a>
      </PageHeader>

      {/* Search bar */}
      <ArchiveSearchBar />

      {/* Category filter pills */}
      <div className="sticky top-mobile-bar sidebar:top-0 bg-background/80 backdrop-blur-md z-10 border-b border-border">
        <div className="flex gap-2 px-4 py-2.5 overflow-x-auto">
          {CATEGORY_ORDER.map((cat) => (
            <CategoryPill
              key={cat}
              category={cat}
              active={activeCategory === cat}
              onClick={() => setActiveCategory(cat)}
            />
          ))}
        </div>
      </div>

      {/* Grid of items */}
      <div className="px-4 pt-4 pb-4">
        <div className="grid grid-cols-2 gap-3 sidebar:grid-cols-3">
          {filtered.map((item) => (
            <ArchiveCard key={item.identifier} item={item} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <Sparkles className="size-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm"><FormattedMessage id="archive.emptyCategory" defaultMessage="No items in this category yet." /></p>
          </div>
        )}
      </div>

      {/* Attribution footer */}
      <div className="px-4 pb-8">
        <div className="rounded-xl border border-dashed border-border bg-secondary/30 px-4 py-3 text-center">
          <p className="text-xs text-muted-foreground">
            <FormattedMessage
              id="archive.attribution"
              defaultMessage="Content provided by the <link>Internet Archive</link>, a non-profit digital library. All items are in the public domain or freely available."
              values={{
                link: (chunks) => (
                  <a
                    href="https://archive.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-foreground transition-colors"
                  >
                    {chunks}
                  </a>
                ),
              }}
            />
          </p>
        </div>
      </div>
    </main>
  );
}
