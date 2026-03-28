import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  ExternalLink,
  Eye,
  FlameKindling,
  Loader2,
  Newspaper,
  Search,
  Star,
  TrendingUp,
  X,
} from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppContext } from '@/hooks/useAppContext';
import {
  useWikipediaFeatured,
  type WikiPage,
  type OnThisDayEvent,
  type NewsItem,
} from '@/hooks/useWikipediaFeatured';
import { useWikipediaSearch, type WikipediaSearchResult } from '@/hooks/useWikipediaSearch';
import { WikipediaIcon } from '@/components/icons/WikipediaIcon';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Section = 'featured' | 'mostread' | 'news' | 'onthisday';

interface SectionMeta {
  label: string;
  icon: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SECTIONS: Record<Section, SectionMeta> = {
  featured: { label: 'Featured', icon: <Star className="size-3.5" /> },
  mostread: { label: 'Trending', icon: <TrendingUp className="size-3.5" /> },
  news: { label: 'In the News', icon: <Newspaper className="size-3.5" /> },
  onthisday: { label: 'On This Day', icon: <Calendar className="size-3.5" /> },
};

const SECTION_ORDER: Section[] = ['featured', 'mostread', 'news', 'onthisday'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wikiPageUrl(page: WikiPage): string {
  return page.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${page.title}`;
}

function dittoUrl(url: string): string {
  return `/i/${encodeURIComponent(url)}`;
}

function dittoWikiUrl(page: WikiPage): string {
  return dittoUrl(wikiPageUrl(page));
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function truncateExtract(text: string, maxLen = 150): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, '') + '\u2026';
}

// ---------------------------------------------------------------------------
// Scrollspy hook
// ---------------------------------------------------------------------------

function useScrollspy(
  sectionRefs: Record<Section, RefObject<HTMLElement | null>>,
  navBarRef: RefObject<HTMLElement | null>,
) {
  const [active, setActive] = useState<Section>(SECTION_ORDER[0]);
  // Guard against scroll-into-view triggering the observer
  const isScrollingRef = useRef(false);

  useEffect(() => {
    const navBarHeight = navBarRef.current?.offsetHeight ?? 48;
    // Trigger when a section crosses just below the sticky nav bar
    const rootMargin = `-${navBarHeight + 8}px 0px -60% 0px`;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isScrollingRef.current) return;
        // Pick the first visible section in DOM order
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const id = visible[0].target.getAttribute('data-section') as Section;
          if (id) setActive(id);
        }
      },
      { rootMargin, threshold: 0 },
    );

    for (const key of SECTION_ORDER) {
      const el = sectionRefs[key].current;
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sectionRefs, navBarRef]);

  const scrollTo = useCallback((section: Section) => {
    const el = sectionRefs[section].current;
    if (!el) return;
    const navBarHeight = navBarRef.current?.offsetHeight ?? 48;
    const top = el.getBoundingClientRect().top + window.scrollY - navBarHeight - 8;
    isScrollingRef.current = true;
    setActive(section);
    window.scrollTo({ top, behavior: 'smooth' });
    // Release the guard after the smooth scroll finishes
    setTimeout(() => { isScrollingRef.current = false; }, 800);
  }, [sectionRefs, navBarRef]);

  return { active, scrollTo };
}

// ---------------------------------------------------------------------------
// Section pill
// ---------------------------------------------------------------------------

function SectionPill({ section, active, onClick }: {
  section: Section;
  active: boolean;
  onClick: () => void;
}) {
  const meta = SECTIONS[section];
  const pillRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll the pill into view when it becomes active
  useEffect(() => {
    if (active && pillRef.current) {
      pillRef.current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [active]);

  return (
    <button
      ref={pillRef}
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

// ---------------------------------------------------------------------------
// Article card (used for featured, most-read, on-this-day, news links)
// ---------------------------------------------------------------------------

function ArticleCard({ page, badge, badgeIcon }: {
  page: WikiPage;
  badge?: string;
  badgeIcon?: React.ReactNode;
}) {
  return (
    <Link
      to={dittoWikiUrl(page)}
      className="group block rounded-2xl border border-border overflow-hidden bg-card hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
    >
      {/* Thumbnail */}
      <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-blue-500/10 to-indigo-500/10">
        {page.thumbnail ? (
          <img
            src={page.thumbnail.source}
            alt={page.normalizedtitle}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <WikipediaIcon className="size-10 text-muted-foreground/20" />
          </div>
        )}

        {/* Top-right badge */}
        {badge && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-white text-xs font-medium flex items-center gap-1">
            {badgeIcon}
            {badge}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 space-y-1">
        <h3 className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors line-clamp-1">
          {page.normalizedtitle ?? page.titles?.normalized ?? page.title.replace(/_/g, ' ')}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {page.description ?? truncateExtract(page.extract)}
        </p>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Featured article (hero card)
// ---------------------------------------------------------------------------

function FeaturedArticleCard({ page }: { page: WikiPage }) {
  return (
    <Link
      to={dittoWikiUrl(page)}
      className="group block rounded-2xl border border-border overflow-hidden bg-card hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-amber-500/10 to-orange-500/10">
        {page.thumbnail ? (
          <img
            src={page.originalimage?.source ?? page.thumbnail.source}
            alt={page.normalizedtitle}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Star className="size-12 text-muted-foreground/20" />
          </div>
        )}


      </div>

      <div className="p-4 space-y-2">
        <h3 className="font-bold text-base leading-tight group-hover:text-primary transition-colors">
          {page.normalizedtitle ?? page.titles?.normalized ?? page.title.replace(/_/g, ' ')}
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
          {truncateExtract(page.extract, 280)}
        </p>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// On This Day entry
// ---------------------------------------------------------------------------

function OnThisDayCard({ event }: { event: OnThisDayEvent }) {
  const mainPage = event.pages[0];

  return (
    <div className="rounded-2xl border border-border overflow-hidden bg-card">
      <div className="flex items-start gap-3 p-4">
        {/* Year pill */}
        <div className="shrink-0 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-bold tabular-nums">
          {event.year}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-sm leading-relaxed">{event.text}</p>
          {mainPage && (
            <Link
              to={dittoWikiUrl(mainPage)}
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <BookOpen className="size-3" />
              {mainPage.normalizedtitle ?? mainPage.title.replace(/_/g, ' ')}
            </Link>
          )}
        </div>
        {mainPage?.thumbnail && (
          <Link to={dittoWikiUrl(mainPage)} className="shrink-0">
            <img
              src={mainPage.thumbnail.source}
              alt=""
              className="w-14 h-14 rounded-lg object-cover"
              loading="lazy"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          </Link>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// News card
// ---------------------------------------------------------------------------

function NewsCard({ item }: { item: NewsItem }) {
  // Extract clean text from HTML story
  const storyText = useMemo(() => {
    return item.story
      .replace(/<!--.*?-->/g, '') // remove comments
      .replace(/<\/?[^>]+(>|$)/g, '') // strip HTML tags
      .trim();
  }, [item.story]);

  const mainLink = item.links[0];

  return (
    <div className="rounded-2xl border border-border overflow-hidden bg-card">
      <div className="flex items-start gap-3 p-4">
        <div className="shrink-0 mt-0.5">
          <Newspaper className="size-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-sm leading-relaxed">{storyText}</p>
          {mainLink && (
            <Link
              to={dittoWikiUrl(mainLink)}
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <BookOpen className="size-3" />
              {mainLink.normalizedtitle ?? mainLink.title.replace(/_/g, ' ')}
            </Link>
          )}
        </div>
        {mainLink?.thumbnail && (
          <Link to={dittoWikiUrl(mainLink)} className="shrink-0">
            <img
              src={mainLink.thumbnail.source}
              alt=""
              className="w-14 h-14 rounded-lg object-cover"
              loading="lazy"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          </Link>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search bar
// ---------------------------------------------------------------------------

function WikipediaSearchBar() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { data: results, isFetching } = useWikipediaSearch(debouncedQuery);

  const handleChange = useCallback((value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value.trim());
    }, 300);
  }, []);

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

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

  const handleSelect = useCallback((result: WikipediaSearchResult) => {
    setQuery('');
    setDebouncedQuery('');
    setDropdownOpen(false);
    inputRef.current?.blur();
    navigate(dittoUrl(result.url));
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
      handleSelect(results[0]);
    }
  }, [results, handleSelect]);

  return (
    <div ref={containerRef} className="relative px-4 pb-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Search Wikipedia..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            if (debouncedQuery.length >= 2) setDropdownOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="pl-9 pr-9 h-9 text-base md:text-sm"
        />
        {query ? (
          <button
            type="button"
            onClick={handleClear}
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
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : results && results.length > 0 ? (
            <div className="divide-y divide-border max-h-80 overflow-y-auto">
              {results.map((result) => (
                <button
                  key={result.title}
                  type="button"
                  className="flex items-center gap-3 px-3 py-2.5 w-full text-left hover:bg-secondary/60 transition-colors"
                  onClick={() => handleSelect(result)}
                >
                  {result.thumbnail ? (
                    <img
                      src={result.thumbnail}
                      alt=""
                      className="w-10 h-10 rounded object-cover bg-secondary shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded bg-gradient-to-br from-blue-500/10 to-indigo-500/10 flex items-center justify-center shrink-0">
                      <WikipediaIcon className="size-4 text-muted-foreground/50" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{result.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{result.description}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No results found for &ldquo;{debouncedQuery}&rdquo;
            </div>
          )}

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

// ---------------------------------------------------------------------------
// Section heading
// ---------------------------------------------------------------------------

function SectionHeading({ icon, title, subtitle }: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <h2 className="text-sm font-bold leading-tight">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function WikipediaLoadingSkeleton() {
  return (
    <div className="px-4 pt-4 pb-4 space-y-6">
      {/* Featured skeleton */}
      <div className="rounded-2xl border border-border overflow-hidden bg-card">
        <Skeleton className="aspect-[16/9] w-full" />
        <div className="p-4 space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-2 gap-3 sidebar:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border overflow-hidden bg-card">
            <Skeleton className="aspect-[4/3] w-full" />
            <div className="p-3 space-y-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>

      {/* List skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="w-10 h-6 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="w-14 h-14 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function WikipediaPage() {
  const { config } = useAppContext();
  const { data: feed, isLoading, isError } = useWikipediaFeatured();

  useSeoMeta({
    title: `Wikipedia | ${config.appName}`,
    description: 'Explore today\'s featured Wikipedia content \u2014 trending articles, on this day, in the news, and more.',
  });

  // Section refs for scrollspy
  const navBarRef = useRef<HTMLDivElement>(null);
  const featuredRef = useRef<HTMLDivElement>(null);
  const mostreadRef = useRef<HTMLDivElement>(null);
  const newsRef = useRef<HTMLDivElement>(null);
  const onthisdayRef = useRef<HTMLDivElement>(null);
  const sectionRefs: Record<Section, RefObject<HTMLElement | null>> = {
    featured: featuredRef,
    mostread: mostreadRef,
    news: newsRef,
    onthisday: onthisdayRef,
  };

  const { active, scrollTo } = useScrollspy(sectionRefs, navBarRef);

  // Filter most-read to remove "Main Page" and "Special:" pages
  const mostReadArticles = useMemo(() => {
    if (!feed?.mostread?.articles) return [];
    return feed.mostread.articles
      .filter((a) => a.title !== 'Main_Page' && !a.title.startsWith('Special:'))
      .slice(0, 12);
  }, [feed?.mostread?.articles]);

  const onThisDayEvents = useMemo(() => {
    if (!feed?.onthisday) return [];
    return feed.onthisday.slice(0, 8);
  }, [feed?.onthisday]);

  const newsItems = useMemo(() => {
    return feed?.news ?? [];
  }, [feed?.news]);

  return (
    <main className="pb-16 sidebar:pb-0">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 pt-4 pb-2">
        <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="size-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-indigo-500/10 flex items-center justify-center">
            <WikipediaIcon className="size-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight">Wikipedia</h1>
            <p className="text-xs text-muted-foreground">Today&apos;s featured content</p>
          </div>
        </div>
        <a
          href="https://en.wikipedia.org"
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          title="Visit Wikipedia"
        >
          <ExternalLink className="size-4" />
        </a>
      </div>

      {/* Search bar */}
      <WikipediaSearchBar />

      {/* Scrollspy navigation pills */}
      <div
        ref={navBarRef}
        className="sticky top-mobile-bar sidebar:top-0 bg-background/80 backdrop-blur-md z-10 border-b border-border"
      >
        <div className="flex gap-2 px-4 py-2.5 overflow-x-auto">
          {SECTION_ORDER.map((s) => (
            <SectionPill
              key={s}
              section={s}
              active={active === s}
              onClick={() => scrollTo(s)}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <WikipediaLoadingSkeleton />
      ) : isError ? (
        <div className="px-4 pt-8 pb-16 text-center">
          <FlameKindling className="size-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">
            Couldn&apos;t load today&apos;s Wikipedia content. Try again later.
          </p>
        </div>
      ) : (
        <div className="px-4 pt-4 pb-4 space-y-6">
          {/* Today's Featured Article */}
          {feed?.tfa && (
            <div ref={featuredRef} data-section="featured">
              <SectionHeading
                icon={<Star className="size-3.5 text-amber-500" />}
                title="Today's Featured Article"
              />
              <FeaturedArticleCard page={feed.tfa} />
            </div>
          )}

          {/* Most Read */}
          {mostReadArticles.length > 0 && (
            <div ref={mostreadRef} data-section="mostread">
              <SectionHeading
                icon={<TrendingUp className="size-3.5 text-primary" />}
                title="Trending"
                subtitle="Most read articles today"
              />
              <div className="grid grid-cols-2 gap-3 sidebar:grid-cols-3">
                {mostReadArticles.map((page) => (
                  <ArticleCard
                    key={page.pageid}
                    page={page}
                    badge={page.views ? formatViews(page.views) : undefined}
                    badgeIcon={<Eye className="size-3" />}
                  />
                ))}
              </div>
            </div>
          )}

          {/* In the News */}
          {newsItems.length > 0 && (
            <div ref={newsRef} data-section="news">
              <SectionHeading
                icon={<Newspaper className="size-3.5 text-sky-500" />}
                title="In the News"
              />
              <div className="space-y-3">
                {newsItems.map((item, i) => (
                  <NewsCard key={i} item={item} />
                ))}
              </div>
            </div>
          )}

          {/* On This Day */}
          {onThisDayEvents.length > 0 && (
            <div ref={onthisdayRef} data-section="onthisday">
              <SectionHeading
                icon={<Calendar className="size-3.5 text-violet-500" />}
                title="On This Day"
                subtitle={new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
              />
              <div className="space-y-3">
                {onThisDayEvents.map((event, i) => (
                  <OnThisDayCard key={i} event={event} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Attribution footer */}
      <div className="px-4 pb-8">
        <div className="rounded-xl border border-dashed border-border bg-secondary/30 px-4 py-3 text-center">
          <p className="text-xs text-muted-foreground">
            Content provided by{' '}
            <a
              href="https://en.wikipedia.org"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Wikipedia
            </a>
            , the free encyclopedia. Text is available under the{' '}
            <a
              href="https://en.wikipedia.org/wiki/Wikipedia:Text_of_the_Creative_Commons_Attribution-ShareAlike_4.0_International_License"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              CC BY-SA 4.0
            </a>
            {' '}license.
          </p>
        </div>
      </div>
    </main>
  );
}
