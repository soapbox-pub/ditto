import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, Gamepad2, Film, Mic, BookOpen, Monitor, Sparkles, Play, ExternalLink, Clock } from 'lucide-react';

import { useAppContext } from '@/hooks/useAppContext';
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
  tagline: string;
  /** Category for filtering */
  category: Category;
}

type Category = 'games' | 'films' | 'audio' | 'software' | 'animation' | 'tv';

interface CategoryMeta {
  label: string;
  icon: React.ReactNode;
  gradient: string;
  accent: string;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const CATEGORIES: Record<Category, CategoryMeta> = {
  games: {
    label: 'Classic Games',
    icon: <Gamepad2 className="size-4" />,
    gradient: 'from-violet-500/20 to-fuchsia-500/20',
    accent: 'text-violet-500 dark:text-violet-400',
  },
  films: {
    label: 'Public Domain Films',
    icon: <Film className="size-4" />,
    gradient: 'from-amber-500/20 to-orange-500/20',
    accent: 'text-amber-600 dark:text-amber-400',
  },
  audio: {
    label: 'Audio Treasures',
    icon: <Mic className="size-4" />,
    gradient: 'from-emerald-500/20 to-teal-500/20',
    accent: 'text-emerald-600 dark:text-emerald-400',
  },
  tv: {
    label: 'Classic Television',
    icon: <Monitor className="size-4" />,
    gradient: 'from-sky-500/20 to-cyan-500/20',
    accent: 'text-sky-600 dark:text-sky-400',
  },
  animation: {
    label: 'Classic Cartoons',
    icon: <Sparkles className="size-4" />,
    gradient: 'from-pink-500/20 to-rose-500/20',
    accent: 'text-pink-500 dark:text-pink-400',
  },
  software: {
    label: 'Software History',
    icon: <BookOpen className="size-4" />,
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
    tagline: 'You have died of dysentery. The game that traumatized a generation.',
    category: 'games',
  },
  {
    identifier: 'msdos_Prince_of_Persia_1990',
    title: 'Prince of Persia',
    year: '1990',
    tagline: 'Rotoscoped beauty. 60 minutes to save the princess.',
    category: 'games',
  },
  {
    identifier: 'msdos_Wolfenstein_3D_1992',
    title: 'Wolfenstein 3D',
    year: '1992',
    tagline: 'The grandfather of first-person shooters.',
    category: 'games',
  },
  {
    identifier: 'msdos_SimCity_1989',
    title: 'SimCity',
    year: '1989',
    tagline: 'Build your dream city. Watch it get destroyed by Godzilla.',
    category: 'games',
  },
  {
    identifier: 'msdos_Pac-Man_1983',
    title: 'Pac-Man',
    year: '1983',
    tagline: 'Waka waka waka waka waka.',
    category: 'games',
  },
  {
    identifier: 'Doom-2',
    title: 'Doom II',
    year: '1994',
    tagline: 'Rip and tear, until it is done.',
    category: 'games',
  },
  {
    identifier: 'msdos_Donkey_Kong_1983',
    title: 'Donkey Kong',
    year: '1983',
    tagline: 'The game that introduced the world to Mario.',
    category: 'games',
  },
  {
    identifier: 'msdos_Where_in_the_World_is_Carmen_Sandiego_Enhanced_1989',
    title: 'Where in the World is Carmen Sandiego?',
    year: '1989',
    tagline: 'Geography class never felt this cool.',
    category: 'games',
  },
  {
    identifier: 'msdos_Golden_Axe_1990',
    title: 'Golden Axe',
    year: '1990',
    tagline: 'Hack, slash, and ride dragons through a fantasy realm.',
    category: 'games',
  },
  {
    identifier: 'msdos_Scorched_Earth_1991',
    title: 'Scorched Earth',
    year: '1991',
    tagline: 'The mother of all games. Nuclear tanks on pixel hills.',
    category: 'games',
  },
  {
    identifier: 'msdos_Dune_2_-_The_Building_of_a_Dynasty_1992',
    title: 'Dune II',
    year: '1992',
    tagline: 'The game that invented real-time strategy.',
    category: 'games',
  },
  {
    identifier: 'msdos_Leisure_Suit_Larry_1_-_Land_of_the_Lounge_Lizards_1987',
    title: 'Leisure Suit Larry',
    year: '1987',
    tagline: 'The most awkward adventure in gaming history.',
    category: 'games',
  },

  // ── Flash Games ──────────────────────────────────────────────
  {
    identifier: 'stick-rpg-complete',
    title: 'Stick RPG Complete',
    tagline: 'The Flash game that consumed entire afternoons.',
    category: 'games',
  },
  {
    identifier: 'the-binding-of-isaac_202111',
    title: 'The Binding of Isaac (Flash)',
    tagline: 'Edmund McMillen\'s dark roguelike masterpiece, original Flash version.',
    category: 'games',
  },

  // ── Public Domain Films ──────────────────────────────────────
  {
    identifier: 'Nosferatu_most_complete_version_93_mins.',
    title: 'Nosferatu',
    year: '1922',
    tagline: 'The unauthorized Dracula adaptation that became an immortal classic.',
    category: 'films',
  },
  {
    identifier: 'Night.Of.The.Living.Dead_1080p',
    title: 'Night of the Living Dead',
    year: '1968',
    tagline: 'George Romero invented an entire genre in one night.',
    category: 'films',
  },
  {
    identifier: 'his_girl_friday',
    title: 'His Girl Friday',
    year: '1940',
    tagline: 'Rapid-fire dialogue. Cary Grant at his most charming.',
    category: 'films',
  },
  {
    identifier: 'house_on_haunted_hill_ipod',
    title: 'House on Haunted Hill',
    year: '1959',
    tagline: 'Vincent Price offers $10,000 to anyone who survives the night.',
    category: 'films',
  },
  {
    identifier: 'Sita_Sings_the_Blues',
    title: 'Sita Sings the Blues',
    year: '2008',
    tagline: 'Ancient Indian epic meets 1920s jazz. A creative commons triumph.',
    category: 'films',
  },
  {
    identifier: '774-plan-9-from-outer-space',
    title: 'Plan 9 from Outer Space',
    year: '1957',
    tagline: 'The "worst movie ever made" is the best movie ever made.',
    category: 'films',
  },

  // ── Classic TV ───────────────────────────────────────────────
  {
    identifier: 'theloneranger_201705',
    title: 'The Lone Ranger',
    tagline: 'Hi-yo, Silver! Away! Justice rides on horseback.',
    category: 'tv',
  },
  {
    identifier: 'get-smart',
    title: 'Get Smart',
    tagline: 'Would you believe... the funniest spy show ever made?',
    category: 'tv',
  },
  {
    identifier: 'GreenAcresCompleteSeries',
    title: 'Green Acres',
    tagline: 'A New York lawyer moves to the country. Chaos follows.',
    category: 'tv',
  },

  // ── Audio Treasures ──────────────────────────────────────────
  {
    identifier: 'gd77-05-08.sbd.hicks.4982.sbeok.shnf',
    title: 'Grateful Dead - Cornell \'77',
    year: '1977',
    tagline: 'The greatest live concert recording of all time. No debate.',
    category: 'audio',
  },
  {
    identifier: 'alice_in_wonderland_librivox',
    title: 'Alice\'s Adventures in Wonderland',
    tagline: 'Lewis Carroll\'s masterpiece, read aloud for free. Down the rabbit hole.',
    category: 'audio',
  },
  {
    identifier: 'art_of_war_librivox',
    title: 'The Art of War',
    tagline: 'Sun Tzu\'s timeless strategy treatise. The most downloaded audiobook on the internet.',
    category: 'audio',
  },
  {
    identifier: 'ird059',
    title: 'The Conet Project',
    tagline: 'Recordings of mysterious shortwave numbers stations. Pure Cold War eeriness.',
    category: 'audio',
  },
  {
    identifier: 'adventures_holmes',
    title: 'The Adventures of Sherlock Holmes',
    tagline: 'Elementary, my dear Watson. 12 stories of deduction.',
    category: 'audio',
  },

  // ── Classic Cartoons ─────────────────────────────────────────
  {
    identifier: 'BettyBoopCartoons',
    title: 'Betty Boop Cartoons',
    tagline: 'Boop-Oop-a-Doop! Pre-code animation at its most daring.',
    category: 'animation',
  },
  {
    identifier: 'superman_the_mechanical_monsters',
    title: 'Superman: The Mechanical Monsters',
    year: '1941',
    tagline: 'Fleischer Studios\' gorgeous Art Deco Superman. Still jaw-dropping.',
    category: 'animation',
  },
  {
    identifier: 'popeye_patriotic_popeye',
    title: 'Patriotic Popeye',
    tagline: 'I yam what I yam! Spinach-fueled heroics.',
    category: 'animation',
  },
  {
    identifier: 'bb_minnie_the_moocher',
    title: 'Betty Boop: Minnie the Moocher',
    tagline: 'Cab Calloway rotoscoped into a ghost walrus. Peak surrealism.',
    category: 'animation',
  },
  {
    identifier: 'woody_woodpecker_pantry_panic',
    title: 'Woody Woodpecker: Pantry Panic',
    tagline: 'Ha-ha-ha-HA-ha! The bird who drove everyone insane.',
    category: 'animation',
  },

  // ── Flash Animations ─────────────────────────────────────────
  {
    identifier: 'flash_badger',
    title: 'Badger Badger Badger',
    tagline: 'Mushroom! MUSHROOM! A snake! Peak early internet.',
    category: 'animation',
  },
  {
    identifier: 'peanut-butter-jelly-time',
    title: 'Peanut Butter Jelly Time',
    tagline: 'A dancing banana changed the internet forever.',
    category: 'animation',
  },

  // ── Prelinger Archives / Educational Films ───────────────────
  {
    identifier: 'DuckandC1951',
    title: 'Duck and Cover',
    year: '1951',
    tagline: 'Bert the Turtle taught kids to survive nuclear war. (Spoiler: no.)',
    category: 'films',
  },

  // ── Software History ─────────────────────────────────────────
  {
    identifier: 'win95_in_dosbox',
    title: 'Windows 95 in Your Browser',
    tagline: 'The startup sound that changed personal computing. Press Start.',
    category: 'software',
  },
  {
    identifier: 'win3_stock',
    title: 'Windows 3.11',
    tagline: 'Program Manager, File Manager, Solitaire. The holy trinity.',
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
    ? { label: 'All', icon: <Sparkles className="size-3.5" />, accent: 'text-primary' }
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
      {meta.label}
    </button>
  );
}

function ArchiveCard({ item }: { item: ArchiveItem }) {
  const meta = CATEGORIES[item.category];

  return (
    <Link
      to={dittoUrl(item.identifier)}
      className="group block rounded-2xl border border-border overflow-hidden bg-card hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
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
          {meta.label}
        </div>
      </div>

      {/* Content */}
      <div className="p-3 space-y-1">
        <h3 className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors line-clamp-1">
          {item.title}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {item.tagline}
        </p>
      </div>
    </Link>
  );
}

/** A single featured "hero" item rendered larger. */
function FeaturedCard({ item }: { item: ArchiveItem }) {
  const meta = CATEGORIES[item.category];

  return (
    <Link
      to={dittoUrl(item.identifier)}
      className="group block rounded-2xl border border-border overflow-hidden bg-card hover:border-primary/30 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10"
    >
      <div className={cn('relative aspect-video overflow-hidden bg-gradient-to-br', meta.gradient)}>
        <img
          src={thumbnailUrl(item.identifier)}
          alt={item.title}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

        {/* Hover play */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-primary/90 rounded-full p-4 shadow-xl">
            <Play className="size-7 text-primary-foreground ml-0.5" fill="currentColor" />
          </div>
        </div>

        {/* Bottom info */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={cn('px-2 py-0.5 rounded-md bg-white/20 backdrop-blur-sm text-xs font-medium text-white flex items-center gap-1')}>
              {meta.icon}
              {meta.label}
            </span>
            {item.year && (
              <span className="px-2 py-0.5 rounded-md bg-white/20 backdrop-blur-sm text-xs font-medium text-white flex items-center gap-1">
                <Clock className="size-3" />
                {item.year}
              </span>
            )}
          </div>
          <h3 className="text-lg font-bold text-white drop-shadow-md leading-tight">
            {item.title}
          </h3>
          <p className="text-sm text-white/80 mt-1 line-clamp-2 drop-shadow-sm">
            {item.tagline}
          </p>
        </div>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const CATEGORY_ORDER: (Category | 'all')[] = ['all', 'games', 'films', 'animation', 'audio', 'tv', 'software'];

/** The featured items shown as hero cards at the top. */
const FEATURED_IDS = [
  'msdos_Oregon_Trail_The_1990',
  'Nosferatu_most_complete_version_93_mins.',
  'gd77-05-08.sbd.hicks.4982.sbeok.shnf',
];

export function ArchivePage() {
  const { config } = useAppContext();
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all');

  useSeoMeta({
    title: `Archive | ${config.appName}`,
    description: 'Explore the best of the Internet Archive — classic games, films, music, and more.',
  });

  const featured = useMemo(
    () => ITEMS.filter((item) => FEATURED_IDS.includes(item.identifier)),
    [],
  );

  const filtered = useMemo(() => {
    const base = ITEMS.filter((item) => !FEATURED_IDS.includes(item.identifier));
    if (activeCategory === 'all') return base;
    return base.filter((item) => item.category === activeCategory);
  }, [activeCategory]);

  return (
    <main className="pb-16 sidebar:pb-0">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 pt-4 pb-2">
        <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="size-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <BookOpen className="size-4 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight">Archive</h1>
            <p className="text-xs text-muted-foreground">Treasures from the Internet Archive</p>
          </div>
        </div>
        <a
          href="https://archive.org"
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          title="Visit archive.org"
        >
          <ExternalLink className="size-4" />
        </a>
      </div>

      {/* Featured hero row */}
      <div className="px-4 pt-2 pb-4">
        <div className="space-y-3">
          {featured.map((item) => (
            <FeaturedCard key={item.identifier} item={item} />
          ))}
        </div>
      </div>

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
            <p className="text-muted-foreground text-sm">No items in this category yet.</p>
          </div>
        )}
      </div>

      {/* Attribution footer */}
      <div className="px-4 pb-8">
        <div className="rounded-xl border border-dashed border-border bg-secondary/30 px-4 py-3 text-center">
          <p className="text-xs text-muted-foreground">
            Content provided by the{' '}
            <a
              href="https://archive.org"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Internet Archive
            </a>
            , a non-profit digital library. All items are in the public domain or freely available.
          </p>
        </div>
      </div>
    </main>
  );
}
