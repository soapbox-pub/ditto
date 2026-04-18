import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useInView } from 'react-intersection-observer';
import {
  ArrowLeft,
  ExternalLink,
  FlameKindling,
  Info,
  Loader2,
  MessageCircle,
  Repeat2,
  Search,
  Share2,
  X,
} from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { ExternalReactionButton } from '@/components/ExternalReactionButton';
import { useAppContext } from '@/hooks/useAppContext';
import { useBlueskyTrending, type BlueskyPost } from '@/hooks/useBlueskyTrending';
import { useBlueskyActorSearch, type BlueskyActorResult } from '@/hooks/useBlueskyActorSearch';
import { BlueskyIcon } from '@/components/icons/BlueskyIcon';
import { shareOrCopy } from '@/lib/share';
import { parseExternalUri } from '@/lib/externalContent';
import { useShareOrigin } from '@/hooks/useShareOrigin';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------



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

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Post card — feed-style (vertical, like NoteCard)
// ---------------------------------------------------------------------------

function BlueskyFeedPost({ post }: { post: BlueskyPost }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const shareOrigin = useShareOrigin();

  const webUrl = postWebUrl(post.uri, post.author.handle);
  const internalUrl = dittoUrl(webUrl);
  const profileUrl = dittoUrl(`https://bsky.app/profile/${post.author.handle}`);
  const images = post.embed?.$type === 'app.bsky.embed.images#view' ? (post.embed.images ?? []) : [];
  const externalEmbed = post.embed?.$type === 'app.bsky.embed.external#view' ? post.embed.external : undefined;

  // NIP-73 external content for the reaction button
  const externalContent = useMemo(() => parseExternalUri(webUrl), [webUrl]);

  const [shareOpen, setShareOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);

  const handleComment = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setCommentOpen(true);
  }, []);

  const handleRepost = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShareOpen(true);
  }, []);

  const handleShare = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const fullUrl = `${shareOrigin}${internalUrl}`;
    const result = await shareOrCopy(fullUrl);
    if (result === 'copied') {
      toast({ title: 'Link copied' });
    }
  }, [internalUrl, toast, shareOrigin]);

  const handleCardClick = useCallback(() => {
    navigate(internalUrl);
  }, [navigate, internalUrl]);

  return (
    <>
      <article
        onClick={handleCardClick}
        className="px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors cursor-pointer"
      >
        <div className="flex gap-3">
          {/* Avatar */}
          <Link to={profileUrl} onClick={(e) => e.stopPropagation()} className="shrink-0">
            {post.author.avatar ? (
              <img
                src={post.author.avatar}
                alt=""
                className="size-11 rounded-full object-cover"
                loading="lazy"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <div className="size-11 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center text-white text-sm font-bold">
                {(post.author.displayName ?? post.author.handle).charAt(0).toUpperCase()}
              </div>
            )}
          </Link>

          {/* Body */}
          <div className="flex-1 min-w-0">
            {/* Author info */}
            <div className="flex items-center gap-1.5 min-w-0">
              <Link to={profileUrl} onClick={(e) => e.stopPropagation()} className="font-semibold text-[15px] truncate leading-tight hover:underline">
                {post.author.displayName ?? post.author.handle}
              </Link>
              <Link to={profileUrl} onClick={(e) => e.stopPropagation()} className="text-muted-foreground text-sm truncate leading-tight hover:underline">
                @{post.author.handle}
              </Link>
              <span className="text-muted-foreground text-sm shrink-0">&middot;</span>
              <span className="text-muted-foreground text-sm shrink-0">
                {timeAgo(post.record.createdAt)}
              </span>
            </div>

            {/* Post text */}
            <p className="mt-1 text-[15px] leading-relaxed whitespace-pre-wrap break-words">
              {post.record.text}
            </p>

            {/* Image embeds */}
            {images.length > 0 && (
              <div
                className={cn(
                  'mt-3 rounded-xl overflow-hidden border border-border',
                  images.length === 1 && 'grid grid-cols-1',
                  images.length === 2 && 'grid grid-cols-2 gap-0.5',
                  images.length === 3 && 'grid grid-cols-2 gap-0.5',
                  images.length >= 4 && 'grid grid-cols-2 gap-0.5',
                )}
              >
                {images.slice(0, 4).map((img, i) => (
                  <div
                    key={i}
                    className={cn(
                      'relative overflow-hidden bg-secondary',
                      images.length === 1 ? 'aspect-video' : 'aspect-square',
                      images.length === 3 && i === 0 && 'row-span-2 aspect-auto',
                    )}
                  >
                    <img
                      src={img.thumb}
                      alt={img.alt || ''}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* External link embed */}
            {externalEmbed && (
              <div className="mt-3 rounded-xl border border-border overflow-hidden bg-secondary/30">
                {externalEmbed.thumb && (
                  <div className="aspect-[2/1] overflow-hidden bg-secondary">
                    <img
                      src={externalEmbed.thumb}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                )}
                <div className="px-3 py-2.5 space-y-0.5">
                  <p className="text-xs text-muted-foreground truncate">
                    {(() => { try { return new URL(externalEmbed.uri).hostname; } catch { return externalEmbed.uri; } })()}
                  </p>
                  {externalEmbed.title && (
                    <p className="text-sm font-semibold leading-tight line-clamp-2">{externalEmbed.title}</p>
                  )}
                  {externalEmbed.description && (
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{externalEmbed.description}</p>
                  )}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-5 mt-3 -ml-2">
              <button
                type="button"
                onClick={handleComment}
                className="inline-flex items-center gap-1.5 p-2 rounded-full text-muted-foreground hover:text-sky-500 hover:bg-sky-500/10 transition-colors"
                title="Comment"
              >
                <MessageCircle className="size-[18px]" />
                {post.replyCount > 0 && <span className="text-sm tabular-nums">{formatCount(post.replyCount)}</span>}
              </button>
              <button
                type="button"
                onClick={handleRepost}
                className="inline-flex items-center gap-1.5 p-2 rounded-full text-muted-foreground hover:text-green-500 hover:bg-green-500/10 transition-colors"
                title="Share to feed"
              >
                <Repeat2 className="size-[18px]" />
                {post.repostCount > 0 && <span className="text-sm tabular-nums">{formatCount(post.repostCount)}</span>}
              </button>
              <ExternalReactionButton content={externalContent} iconSize="size-[18px]" count={post.likeCount} />
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex items-center p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                title="Share link"
              >
                <Share2 className="size-[18px]" />
              </button>
            </div>
          </div>
        </div>
      </article>

      {/* Comment compose modal */}
      {commentOpen && (
        <ReplyComposeModal
          open={commentOpen}
          onOpenChange={setCommentOpen}
          event={new URL(webUrl)}
        />
      )}

      {/* Share compose modal */}
      {shareOpen && (
        <ReplyComposeModal
          open={shareOpen}
          onOpenChange={setShareOpen}
          initialContent={webUrl}
          title="Share to feed"
        />
      )}
    </>
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { data: results, isFetching } = useBlueskyActorSearch(debouncedQuery);

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
    if (debouncedQuery.length >= 1 && results && results.length > 0) {
      setDropdownOpen(true);
    } else if (debouncedQuery.length >= 1 && results && results.length === 0 && !isFetching) {
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

  const handleSelect = useCallback((result: BlueskyActorResult) => {
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
          placeholder="Search Bluesky users..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            if (debouncedQuery.length >= 1) setDropdownOpen(true);
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
      {dropdownOpen && debouncedQuery.length >= 1 && (
        <div className="absolute left-4 right-4 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
          {isFetching && (!results || results.length === 0) ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <Skeleton className="size-10 rounded-full shrink-0" />
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
                  key={result.did}
                  type="button"
                  className="flex items-center gap-3 px-3 py-2.5 w-full text-left hover:bg-secondary/60 transition-colors"
                  onClick={() => handleSelect(result)}
                >
                  {result.avatar ? (
                    <img
                      src={result.avatar}
                      alt=""
                      className="size-10 rounded-full object-cover bg-secondary shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="size-10 rounded-full bg-gradient-to-br from-sky-500/20 to-blue-500/20 flex items-center justify-center shrink-0">
                      <BlueskyIcon className="size-4 text-muted-foreground/50" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {result.displayName || result.handle}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      @{result.handle}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No users found for &ldquo;{debouncedQuery}&rdquo;
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
// Loading skeleton (feed-style)
// ---------------------------------------------------------------------------

function BlueskyLoadingSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="px-4 py-3">
          <div className="flex gap-3">
            <Skeleton className="size-11 rounded-full shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3.5 w-20" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-40 w-full rounded-xl" />
              <div className="flex gap-6 pt-1">
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-4 w-10" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function BlueskyPage() {
  const { config } = useAppContext();
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useBlueskyTrending();
  const { ref: loadMoreRef, inView } = useInView();

  useSeoMeta({
    title: `Bluesky | ${config.appName}`,
    description: 'Explore popular posts from Bluesky \u2014 trending discussions, images, and links.',
  });

  // Flatten pages, deduplicate by URI
  const allPosts = useMemo(() => {
    if (!data?.pages) return [];
    const seen = new Set<string>();
    return data.pages.flatMap((page) => page.posts).filter((post) => {
      if (seen.has(post.uri)) return false;
      seen.add(post.uri);
      return true;
    });
  }, [data?.pages]);

  // Trigger next page fetch when sentinel is in view
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

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
        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                title="About"
              >
                <Info className="size-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="end" className="w-72 text-xs text-muted-foreground">
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
            </PopoverContent>
          </Popover>
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
      </div>

      {/* Search bar */}
      <BlueskySearchBar />

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
      ) : allPosts.length === 0 ? (
        <div className="py-16 text-center">
          <BlueskyIcon className="size-10 mx-auto mb-3 text-muted-foreground/20" />
          <p className="text-muted-foreground text-sm">No posts found.</p>
        </div>
      ) : (
        <div>
          {allPosts.map((post) => (
            <BlueskyFeedPost key={post.uri} post={post} />
          ))}

          {/* Infinite scroll sentinel */}
          {hasNextPage && (
            <div ref={loadMoreRef} className="py-6">
              {isFetchingNextPage && (
                <div className="flex justify-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
