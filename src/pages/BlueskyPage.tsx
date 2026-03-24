import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import {
  ArrowLeft,
  ExternalLink,
  FlameKindling,
  Heart,
  Loader2,
  MessageCircle,
  Repeat2,
  Search,
  X,
} from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppContext } from '@/hooks/useAppContext';
import { useBlueskyTrending, type BlueskyPost } from '@/hooks/useBlueskyTrending';
import { useBlueskySearch, type BlueskySearchResult } from '@/hooks/useBlueskySearch';
import { BlueskyIcon } from '@/components/icons/BlueskyIcon';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Category = 'all' | 'images' | 'links' | 'text';

interface CategoryMeta {
  label: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES: Record<Category, CategoryMeta> = {
  all: { label: 'All Posts' },
  images: { label: 'With Images' },
  links: { label: 'With Links' },
  text: { label: 'Text Only' },
};

const CATEGORY_ORDER: Category[] = ['all', 'images', 'links', 'text'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert an AT URI (at://did/collection/rkey) into a bsky.app web URL. */
function postWebUrl(uri: string, handle: string): string {
  const parts = uri.split('/');
  const rkey = parts[parts.length - 1];
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

/** Convert a bsky.app post URL into our /i/ route. */
function dittoUrl(url: string): string {
  return `/i/${encodeURIComponent(url)}`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function truncateText(text: string, maxLen = 160): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, '') + '\u2026';
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

/** Check if a post has image embeds. */
function hasImages(post: BlueskyPost): boolean {
  return post.embed?.$type === 'app.bsky.embed.images#view' && (post.embed?.images?.length ?? 0) > 0;
}

/** Check if a post has link/external embeds. */
function hasLinks(post: BlueskyPost): boolean {
  return post.embed?.$type === 'app.bsky.embed.external#view' && !!post.embed?.external;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function CategoryPill({ category, active, onClick }: {
  category: Category;
  active: boolean;
  onClick: () => void;
}) {
  const meta = CATEGORIES[category];
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
      {meta.label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Post card
// ---------------------------------------------------------------------------

function BlueskyPostCard({ post }: { post: BlueskyPost }) {
  const webUrl = postWebUrl(post.uri, post.author.handle);
  const firstImage = post.embed?.$type === 'app.bsky.embed.images#view' ? post.embed.images?.[0] : undefined;
  const externalEmbed = post.embed?.$type === 'app.bsky.embed.external#view' ? post.embed.external : undefined;
  const thumbnail = firstImage?.thumb ?? externalEmbed?.thumb;

  return (
    <Link
      to={dittoUrl(webUrl)}
      className="group block rounded-2xl border border-border overflow-hidden bg-card hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
    >
      {/* Thumbnail */}
      {thumbnail ? (
        <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-sky-500/10 to-blue-500/10">
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />

          {/* Engagement badge */}
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-white text-xs font-medium flex items-center gap-1">
            <Heart className="size-3" />
            {formatCount(post.likeCount)}
          </div>
        </div>
      ) : (
        <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-sky-500/10 to-blue-500/10 flex items-center justify-center p-4">
          <p className="text-sm text-muted-foreground leading-relaxed text-center line-clamp-5">
            {post.record.text}
          </p>

          {/* Engagement badge */}
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-white text-xs font-medium flex items-center gap-1">
            <Heart className="size-3" />
            {formatCount(post.likeCount)}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-3 space-y-2">
        {/* Author row */}
        <div className="flex items-center gap-2 min-w-0">
          {post.author.avatar ? (
            <img
              src={post.author.avatar}
              alt=""
              className="size-5 rounded-full object-cover shrink-0"
              loading="lazy"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <div className="size-5 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 shrink-0" />
          )}
          <span className="text-xs font-medium truncate">
            {post.author.displayName ?? post.author.handle}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            {timeAgo(post.record.createdAt)}
          </span>
        </div>

        {/* Post text */}
        {thumbnail && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {truncateText(post.record.text)}
          </p>
        )}

        {/* External link title */}
        {externalEmbed?.title && (
          <p className="text-xs font-medium text-primary leading-tight line-clamp-1">
            {externalEmbed.title}
          </p>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MessageCircle className="size-3" />
            {formatCount(post.replyCount)}
          </span>
          <span className="flex items-center gap-1">
            <Repeat2 className="size-3" />
            {formatCount(post.repostCount)}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="size-3" />
            {formatCount(post.likeCount)}
          </span>
        </div>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Search bar
// ---------------------------------------------------------------------------

function BlueskySearchBar() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const { data: results, isFetching } = useBlueskySearch(debouncedQuery);

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

  const handleSelect = useCallback((result: BlueskySearchResult) => {
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
          placeholder="Search Bluesky posts..."
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
                  key={result.uri}
                  type="button"
                  className="flex items-center gap-3 px-3 py-2.5 w-full text-left hover:bg-secondary/60 transition-colors"
                  onClick={() => handleSelect(result)}
                >
                  {result.avatar ? (
                    <img
                      src={result.avatar}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover bg-secondary shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500/20 to-blue-500/20 flex items-center justify-center shrink-0">
                      <BlueskyIcon className="size-4 text-muted-foreground/50" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{result.displayName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      @{result.handle}
                      {result.likes > 0 && <> &middot; {formatCount(result.likes)} likes</>}
                    </p>
                    <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{result.text}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No results found for &ldquo;{debouncedQuery}&rdquo;
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

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function BlueskyLoadingSkeleton() {
  return (
    <div className="px-4 pt-4 pb-4">
      <div className="grid grid-cols-2 gap-3 sidebar:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border overflow-hidden bg-card">
            <Skeleton className="aspect-[4/3] w-full" />
            <div className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="size-5 rounded-full" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
              <div className="flex gap-3">
                <Skeleton className="h-3 w-8" />
                <Skeleton className="h-3 w-8" />
                <Skeleton className="h-3 w-8" />
              </div>
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

export function BlueskyPage() {
  const { config } = useAppContext();
  const { data: posts, isLoading, isError } = useBlueskyTrending();
  const [activeCategory, setActiveCategory] = useState<Category>('all');

  useSeoMeta({
    title: `Bluesky | ${config.appName}`,
    description: 'Explore popular posts from Bluesky \u2014 trending discussions, images, and links.',
  });

  const filtered = useMemo(() => {
    if (!posts) return [];
    switch (activeCategory) {
      case 'images':
        return posts.filter(hasImages);
      case 'links':
        return posts.filter(hasLinks);
      case 'text':
        return posts.filter((p) => !hasImages(p) && !hasLinks(p));
      default:
        return posts;
    }
  }, [posts, activeCategory]);

  return (
    <main className="pb-16 sidebar:pb-0">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 pt-4 pb-2">
        <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="size-8 rounded-lg bg-gradient-to-br from-sky-500/20 to-blue-500/10 flex items-center justify-center">
            <BlueskyIcon className="size-4 text-sky-500 dark:text-sky-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight">Bluesky</h1>
            <p className="text-xs text-muted-foreground">Popular posts from the ATmosphere</p>
          </div>
        </div>
        <a
          href="https://bsky.app"
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          title="Visit Bluesky"
        >
          <ExternalLink className="size-4" />
        </a>
      </div>

      {/* Search bar */}
      <BlueskySearchBar />

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

      {/* Content */}
      {isLoading ? (
        <BlueskyLoadingSkeleton />
      ) : isError ? (
        <div className="px-4 pt-8 pb-16 text-center">
          <FlameKindling className="size-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">
            Couldn&apos;t load Bluesky posts. Try again later.
          </p>
        </div>
      ) : (
        <div className="px-4 pt-4 pb-4">
          <div className="grid grid-cols-2 gap-3 sidebar:grid-cols-3">
            {filtered.map((post) => (
              <BlueskyPostCard key={post.uri} post={post} />
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="py-16 text-center">
              <BlueskyIcon className="size-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">No posts match this filter.</p>
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
              href="https://bsky.app"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Bluesky
            </a>
            , a decentralized social network built on the AT Protocol. All posts are public and belong to their respective authors.
          </p>
        </div>
      </div>
    </main>
  );
}
