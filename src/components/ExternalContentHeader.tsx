import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Droplets, ExternalLink, FileText, Globe, MapPin, MessageCircle, Package, Play, Repeat2, Share2, User, Users, Wind } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { ExternalReactionButton } from '@/components/ExternalReactionButton';
import { LinkEmbed } from '@/components/LinkEmbed';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { WikipediaIcon } from '@/components/icons/WikipediaIcon';
import { BlueskyIcon } from '@/components/icons/BlueskyIcon';
import { extractYouTubeId, extractWikipediaTitle, extractWikidataId, extractBlueskyPost } from '@/lib/linkEmbed';
import { parseExternalUri, formatIsbn } from '@/lib/externalContent';
import { shareOrCopy } from '@/lib/share';
import { useLinkPreview } from '@/hooks/useLinkPreview';
import { useBlueskyPost } from '@/hooks/useBlueskyPost';
import { useBookInfo } from '@/hooks/useBookInfo';
import { useAddrEvent } from '@/hooks/useEvent';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useWeather } from '@/hooks/useWeather';
import { useToast } from '@/hooks/useToast';
import { useShareOrigin } from '@/hooks/useShareOrigin';
import { genUserName } from '@/lib/genUserName';
import { getCountryInfo, getWikipediaTitle } from '@/lib/countries';
import { useWikipediaSummary } from '@/hooks/useWikipediaSummary';
import { useWikidataEntity } from '@/hooks/useWikidataEntity';
import { EXTRA_KINDS } from '@/lib/extraKinds';
import { CONTENT_KIND_ICONS } from '@/lib/sidebarItems';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Full-size content headers (used on /i/ page)
// ---------------------------------------------------------------------------

export function UrlContentHeader({ url }: { url: string }) {
  const wikiTitle = useMemo(() => extractWikipediaTitle(url), [url]);
  const wikidataId = useMemo(() => extractWikidataId(url), [url]);
  const blueskyPost = useMemo(() => extractBlueskyPost(url), [url]);

  if (wikiTitle) {
    return <WikipediaArticleHeader title={wikiTitle} url={url} />;
  }

  if (wikidataId) {
    return <WikidataEntityHeader id={wikidataId} url={url} />;
  }

  if (blueskyPost) {
    return <BlueskyPostHeader author={blueskyPost.author} rkey={blueskyPost.rkey} url={url} />;
  }

  return <LinkEmbed url={url} showActions={false} />;
}

// ---------------------------------------------------------------------------
// Wikidata entity header — resolves the entity to its Wikipedia article and
// delegates to WikipediaArticleHeader. Falls back to LinkEmbed when there is
// no English Wikipedia sitelink (or while resolving fails).
// ---------------------------------------------------------------------------

function WikidataEntityHeader({ id, url }: { id: string; url: string }) {
  const { data: entity, isLoading } = useWikidataEntity(id);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border overflow-hidden">
        <Skeleton className="w-full aspect-[16/9]" />
        <div className="p-5 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="space-y-2 pt-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  if (entity?.wikipediaTitle && entity.wikipediaUrl) {
    return <WikipediaArticleHeader title={entity.wikipediaTitle} url={entity.wikipediaUrl} />;
  }

  return <LinkEmbed url={url} showActions={false} />;
}

// ---------------------------------------------------------------------------
// Bluesky post header (full feed-style, like a thread top post)
// ---------------------------------------------------------------------------

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function blueskyTimeAgo(dateStr: string): string {
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

function BlueskyPostHeader({ author, rkey, url }: { author: string; rkey: string; url: string }) {
  const { data: post, isLoading, isError } = useBlueskyPost(author, rkey);
  const { toast } = useToast();
  const shareOrigin = useShareOrigin();

  const profileUrl = `/i/${encodeURIComponent(`https://bsky.app/profile/${post?.handle ?? author}`)}`;
  const externalContent = useMemo(() => parseExternalUri(url), [url]);

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
    const fullUrl = `${shareOrigin}/i/${encodeURIComponent(url)}`;
    const result = await shareOrCopy(fullUrl);
    if (result === 'copied') {
      toast({ title: 'Link copied' });
    }
  }, [url, toast, shareOrigin]);

  if (isLoading) {
    return (
      <div className="py-3">
        <div className="flex gap-3">
          <Skeleton className="size-11 rounded-full shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3.5 w-20" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <div className="flex gap-6 pt-1">
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 w-10" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !post) {
    return <LinkEmbed url={url} showActions={false} />;
  }

  return (
    <>
      <article className="py-1">
        <div className="flex gap-3">
          {/* Avatar */}
          <Link to={profileUrl} className="shrink-0">
            {post.avatar ? (
              <img
                src={post.avatar}
                alt=""
                className="size-11 rounded-full object-cover"
                loading="lazy"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <div className="size-11 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center text-white text-sm font-bold">
                {(post.displayName ?? post.handle).charAt(0).toUpperCase()}
              </div>
            )}
          </Link>

          {/* Body */}
          <div className="flex-1 min-w-0">
            {/* Author info */}
            <div className="flex items-center gap-1.5 min-w-0">
              <Link to={profileUrl} className="font-semibold text-[15px] truncate leading-tight hover:underline">
                {post.displayName ?? post.handle}
              </Link>
              <Link to={profileUrl} className="text-muted-foreground text-sm truncate leading-tight hover:underline">
                @{post.handle}
              </Link>
              <span className="text-muted-foreground text-sm shrink-0">&middot;</span>
              <span className="text-muted-foreground text-sm shrink-0">
                {blueskyTimeAgo(post.createdAt)}
              </span>
            </div>

            {/* Post text */}
            {post.text && (
              <p className="mt-1 text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                {post.text}
              </p>
            )}

            {/* Image embeds */}
            {post.images && post.images.length > 0 && (
              <div
                className={cn(
                  'mt-3 rounded-xl overflow-hidden border border-border',
                  post.images.length === 1 && 'grid grid-cols-1',
                  post.images.length === 2 && 'grid grid-cols-2 gap-0.5',
                  post.images.length === 3 && 'grid grid-cols-2 gap-0.5',
                  post.images.length >= 4 && 'grid grid-cols-2 gap-0.5',
                )}
              >
                {post.images.slice(0, 4).map((img, i) => (
                  <div
                    key={i}
                    className={cn(
                      'relative overflow-hidden bg-secondary',
                      post.images!.length === 1 ? 'aspect-video' : 'aspect-square',
                      post.images!.length === 3 && i === 0 && 'row-span-2 aspect-auto',
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
            {post.external && post.external.thumb && (
              <div className="mt-3 rounded-xl border border-border overflow-hidden bg-secondary/30">
                <div className="aspect-[2/1] overflow-hidden bg-secondary">
                  <img
                    src={post.external.thumb}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>
                {post.external.title && (
                  <div className="px-3 py-2.5">
                    <p className="text-sm font-semibold leading-tight line-clamp-2">{post.external.title}</p>
                  </div>
                )}
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

        {/* Bluesky source link */}
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <BlueskyIcon className="size-3.5 text-sky-500" />
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors hover:underline"
          >
            View on Bluesky
          </a>
          <ExternalLink className="size-3" />
        </div>
      </article>

      {/* Comment compose modal */}
      {commentOpen && (
        <ReplyComposeModal
          open={commentOpen}
          onOpenChange={setCommentOpen}
          event={new URL(url)}
        />
      )}

      {/* Share compose modal */}
      {shareOpen && (
        <ReplyComposeModal
          open={shareOpen}
          onOpenChange={setShareOpen}
          initialContent={url}
          title="Share to feed"
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Wikipedia article header (rich display for Wikipedia URLs)
// ---------------------------------------------------------------------------

const WIKI_ARTICLE_MAX_HEIGHT = 160; // px — extract taller than this gets truncated

function WikipediaArticleHeader({ title, url }: { title: string; url: string }) {
  const { data: wiki, isLoading } = useWikipediaSummary(title);

  const contentRef = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const measure = useCallback(() => {
    const el = contentRef.current;
    if (el) setOverflows(el.scrollHeight > WIKI_ARTICLE_MAX_HEIGHT);
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border overflow-hidden">
        <Skeleton className="w-full aspect-[16/9]" />
        <div className="p-5 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="space-y-2 pt-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  // Fallback to generic link preview if Wikipedia API returned nothing
  if (!wiki) {
    return <LinkEmbed url={url} showActions={false} />;
  }

  const heroImage = wiki.originalImage?.source ?? wiki.thumbnail?.source;

  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      {/* Hero image */}
      {heroImage && (
        <div className="relative w-full overflow-hidden bg-gradient-to-br from-blue-500/10 to-indigo-500/10">
          <img
            src={heroImage}
            alt={wiki.title}
            className="w-full max-h-[320px] object-cover"
            loading="eager"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Article content */}
      <div className="p-5 sm:p-6">
        {/* Wikipedia badge */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
          <WikipediaIcon className="size-3.5 shrink-0" />
          <span>Wikipedia</span>
        </div>

        {/* Title */}
        <h2 className="text-2xl sm:text-3xl font-bold leading-snug mb-1">
          {wiki.title}
        </h2>

        {/* Description */}
        {wiki.description && (
          <p className="text-sm text-muted-foreground capitalize mb-4">
            {wiki.description}
          </p>
        )}

        {/* Extract with expand/collapse */}
        {wiki.extract && (
          <div className="space-y-2">
            <div className="relative">
              <p
                ref={contentRef}
                style={!expanded && overflows ? { maxHeight: WIKI_ARTICLE_MAX_HEIGHT, overflow: 'hidden' } : undefined}
                className="text-sm leading-relaxed text-muted-foreground"
              >
                {wiki.extract}
              </p>
              {!expanded && overflows && (
                <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent pointer-events-none" />
              )}
            </div>
            {overflows && (
              <button
                className="text-sm text-primary hover:underline"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer with Wikipedia link */}
      <div className="border-t border-border px-5 py-2.5">
        <a
          href={wiki.articleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <WikipediaIcon className="size-3.5" />
          <span>Read on Wikipedia</span>
          <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}

export function BookContentHeader({ isbn }: { isbn: string }) {
  const rawIsbn = isbn.replace('isbn:', '');
  const { data: book, isLoading } = useBookInfo(rawIsbn);
  const displayIsbn = formatIsbn(rawIsbn);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border overflow-hidden p-5">
        <div className="flex gap-5">
          <Skeleton className="w-[120px] h-[180px] rounded-lg shrink-0" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const coverUrl = book?.cover?.large || book?.cover?.medium;
  const authors = book?.authors?.map((a) => a.name).join(', ');
  const publishers = book?.publishers?.map((p) => p.name).join(', ');

  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      <div className="p-5">
        <div className="flex gap-5">
          {coverUrl ? (
            <div className="shrink-0">
              <img
                src={coverUrl}
                alt={book?.title || 'Book cover'}
                className="w-[120px] sm:w-[140px] rounded-lg shadow-md object-cover"
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            </div>
          ) : (
            <div className="shrink-0 w-[120px] sm:w-[140px] h-[180px] sm:h-[210px] rounded-lg bg-secondary flex items-center justify-center">
              <BookOpen className="size-10 text-muted-foreground/40" />
            </div>
          )}

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <BookOpen className="size-3.5 shrink-0" />
              <span>ISBN {displayIsbn}</span>
            </div>

            <h2 className="text-xl font-bold leading-snug line-clamp-3">
              {book?.title || 'Unknown Book'}
            </h2>

            {authors && (
              <p className="text-sm text-muted-foreground">
                by {authors}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
              {book?.publish_date && (
                <span>{book.publish_date}</span>
              )}
              {publishers && (
                <span>{publishers}</span>
              )}
              {book?.number_of_pages && (
                <span>{book.number_of_pages} pages</span>
              )}
            </div>

            {book?.subjects && book.subjects.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {book.subjects.map((s) => (
                  <span
                    key={s.name}
                    className="text-xs px-2.5 py-0.5 rounded-full bg-secondary text-muted-foreground"
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-border px-5 py-2.5">
        <a
          href={`https://openlibrary.org/isbn/${rawIsbn}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Globe className="size-3.5" />
          <span>View on OpenLibrary</span>
          <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}

const WIKI_MAX_HEIGHT = 100; // px — extract taller than this gets truncated

function WikipediaExtract({ extract, articleUrl }: { extract: string; articleUrl: string }) {
  const contentRef = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const measure = useCallback(() => {
    const el = contentRef.current;
    if (el) setOverflows(el.scrollHeight > WIKI_MAX_HEIGHT);
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return (
    <div className="mt-5 space-y-2">
      <div className="relative">
        <p
          ref={contentRef}
          style={!expanded && overflows ? { maxHeight: WIKI_MAX_HEIGHT, overflow: 'hidden' } : undefined}
          className="text-sm leading-relaxed text-muted-foreground"
        >
          {extract}
        </p>
        {!expanded && overflows && (
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        )}
      </div>
      <div className="flex items-center gap-3">
        {overflows && (
          <button
            className="text-sm text-primary hover:underline"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Show less' : 'Read more'}
          </button>
        )}
        <a
          href={articleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Globe className="size-3.5" />
          <span>Wikipedia</span>
          <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}

function WeatherWidget({ code }: { code: string }) {
  const { data: weather, isLoading } = useWeather(code);

  if (isLoading) {
    return (
      <div className="mt-5 rounded-xl bg-secondary/50 p-4">
        <div className="flex items-center gap-4">
          <Skeleton className="size-12 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </div>
    );
  }

  if (!weather) return null;

  return (
    <div className="mt-5 rounded-xl bg-gradient-to-br from-secondary/60 to-secondary/30 border border-border/50 p-4 transition-all hover:border-border">
      <div className="flex items-center gap-4">
        {/* Weather icon + temperature */}
        <div className="flex items-center gap-3">
          <span className="text-4xl leading-none" role="img" aria-label={weather.description}>
            {weather.icon}
          </span>
          <div>
            <p className="text-2xl font-bold tabular-nums leading-tight">
              {weather.temperature}°C
            </p>
            <p className="text-xs text-muted-foreground">
              {weather.description}
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="h-10 w-px bg-border/60 mx-1" />

        {/* Details */}
        <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="text-foreground/60">Feels like</span>
            <span className="font-medium text-foreground tabular-nums">{weather.apparentTemperature}°</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Droplets className="size-3 shrink-0" />
            <span className="font-medium text-foreground tabular-nums">{weather.humidity}%</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Wind className="size-3 shrink-0" />
            <span className="font-medium text-foreground tabular-nums">{weather.windSpeed} km/h</span>
          </span>
          {weather.city && (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{weather.city}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function CountryContentHeader({ code }: { code: string }) {
  const info = getCountryInfo(code);
  const wikiTitle = getWikipediaTitle(code);
  const { data: wiki, isLoading: wikiLoading } = useWikipediaSummary(wikiTitle);

  if (!info) {
    return (
      <div className="rounded-2xl border border-border p-5 text-center">
        <MapPin className="size-8 mx-auto mb-2 text-muted-foreground/40" />
        <p className="text-muted-foreground">Unknown country code: {code}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      {/* Flag + name */}
      <div className="p-6 sm:p-8">
        <div className="flex items-center gap-4">
          {info.subdivision && wiki?.thumbnail ? (
            <img
              src={wiki.thumbnail.source}
              alt={info.subdivisionName ?? info.subdivision}
              className="size-16 sm:size-20 rounded-md object-cover shadow-sm border border-border"
            />
          ) : (
            <span className="text-6xl sm:text-7xl leading-none" role="img" aria-label={`Flag of ${info.name}`}>
              {info.flag}
            </span>
          )}
          <div className="space-y-1">
            <h2 className="text-2xl sm:text-3xl font-bold leading-snug">
              {info.subdivisionName ?? info.name}
            </h2>
            {info.subdivision && (
              <p className="text-sm text-muted-foreground">
                {info.name}{info.subdivisionName ? '' : ` · ${info.subdivision}`}
              </p>
            )}
            {wiki?.description && (
              <p className="text-sm text-muted-foreground capitalize">
                {wiki.description}
              </p>
            )}
          </div>
        </div>

        {/* Current weather */}
        <WeatherWidget code={code} />

        {/* Wikipedia extract */}
        {wikiLoading ? (
          <div className="mt-5 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : wiki?.extract ? (
          <WikipediaExtract extract={wiki.extract} articleUrl={wiki.articleUrl} />
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact preview (used on nevent detail pages for kind 1111 comments)
// ---------------------------------------------------------------------------

/**
 * Compact preview of external content, shown above a kind 1111 comment
 * on its detail page. Links to the full /i/ page.
 */
export function ExternalContentPreview({ identifier }: { identifier: string }) {
  const content = useMemo(() => parseExternalUri(identifier), [identifier]);
  const link = `/i/${encodeURIComponent(identifier)}`;

  switch (content.type) {
    case 'url':
      return <UrlPreview url={content.value} link={link} />;
    case 'isbn':
      return <BookPreview isbn={content.value} link={link} />;
    case 'iso3166':
      return <CountryPreview code={content.code} link={link} />;
    default:
      return (
        <Link to={link} className="block px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors">
          <div className="flex items-center gap-3">
            <Globe className="size-5 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground truncate">{identifier}</span>
          </div>
        </Link>
      );
  }
}

function UrlPreview({ url, link }: { url: string; link: string }) {
  const youtubeId = useMemo(() => extractYouTubeId(url), [url]);
  const { data, isLoading } = useLinkPreview(url);

  const domain = useMemo(() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }, [url]);

  const title = data?.title;
  const image = data?.thumbnail_url;
  const providerName = data?.provider_name || domain;

  if (isLoading) {
    return (
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 rounded-lg shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  // YouTube gets a thumbnail from the video ID
  const thumbnail = youtubeId
    ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`
    : image;

  return (
    <Link
      to={link}
      className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors"
    >
      {thumbnail ? (
        <img
          src={thumbnail}
          alt=""
          className="size-12 rounded-lg object-cover shrink-0"
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLElement).style.display = 'none';
          }}
        />
      ) : (
        <div className="size-12 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <ExternalFavicon url={url} size={20} />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ExternalFavicon url={url} size={12} className="shrink-0" />
          <span className="truncate">{providerName}</span>
        </div>
        <p className="text-sm font-medium truncate mt-0.5">
          {title || url}
        </p>
      </div>

      <ExternalLink className="size-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

function BookPreview({ isbn, link }: { isbn: string; link: string }) {
  const rawIsbn = isbn.replace('isbn:', '');
  const { data: book, isLoading } = useBookInfo(rawIsbn);

  if (isLoading) {
    return (
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Skeleton className="w-9 h-12 rounded shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  const coverUrl = book?.cover?.medium || book?.cover?.large;
  const authors = book?.authors?.map((a) => a.name).join(', ');

  return (
    <Link
      to={link}
      className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors"
    >
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={book?.title || 'Book cover'}
          className="w-9 h-12 rounded object-cover shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="w-9 h-12 rounded bg-secondary flex items-center justify-center shrink-0">
          <BookOpen className="size-4 text-muted-foreground/40" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <BookOpen className="size-3 shrink-0" />
          <span>Book</span>
        </div>
        <p className="text-sm font-medium truncate mt-0.5">
          {book?.title || `ISBN ${rawIsbn}`}
        </p>
        {authors && (
          <p className="text-xs text-muted-foreground truncate">
            by {authors}
          </p>
        )}
      </div>

      <ExternalLink className="size-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

function CountryPreview({ code, link }: { code: string; link: string }) {
  const info = getCountryInfo(code);

  return (
    <Link
      to={link}
      className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors"
    >
      <span className="text-2xl leading-none shrink-0" role="img" aria-label={info ? `Flag of ${info.name}` : code}>
        {info?.flag ?? '🌍'}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          <span>Country</span>
        </div>
        <p className="text-sm font-medium truncate mt-0.5">
          {info?.name ?? code}
        </p>
      </div>

      <ExternalLink className="size-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

/**
 * Compact preview of a profile, shown above a kind 1111 comment
 * on its detail page when the root is a kind 0 profile event.
 * Links to the profile page.
 */
/**
 * Compact preview of a NIP-72 community, shown above a kind 1111 comment
 * on its detail page when the root is a kind 34550 community definition.
 * Links to the community detail page.
 */
export function CommunityPreview({ addr }: { addr: { kind: number; pubkey: string; identifier: string } }) {
  const { data: event, isLoading } = useAddrEvent(addr);

  const communityName = event?.tags.find(([n]) => n === 'name')?.[1]
    || event?.tags.find(([n]) => n === 'd')?.[1]
    || 'Community';
  const communityImage = event?.tags.find(([n]) => n === 'image')?.[1];
  const communityDescription = event?.tags.find(([n]) => n === 'description')?.[1];
  const moderatorCount = event?.tags.filter(([n, , , role]) => n === 'p' && role === 'moderator').length ?? 0;

  const link = useMemo(() => {
    return `/${nip19.naddrEncode({ kind: addr.kind, pubkey: addr.pubkey, identifier: addr.identifier })}`;
  }, [addr]);

  if (isLoading) {
    return (
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 rounded-lg shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link
      to={link}
      className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors"
    >
      {communityImage ? (
        <img
          src={communityImage}
          alt={communityName}
          className="size-12 rounded-lg object-cover shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Users className="size-5 text-primary/50" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-3 shrink-0" />
          <span>Community</span>
          {moderatorCount > 0 && (
            <span className="text-muted-foreground/60">&middot; {moderatorCount} mod{moderatorCount !== 1 ? 's' : ''}</span>
          )}
        </div>
        <p className="text-sm font-medium truncate mt-0.5">
          {communityName}
        </p>
        {communityDescription && (
          <p className="text-xs text-muted-foreground truncate">
            {communityDescription}
          </p>
        )}
      </div>
    </Link>
  );
}

export function ProfilePreview({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = metadata?.name ?? genUserName(pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);

  if (author.isLoading) {
    return (
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 rounded-full shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link
      to={profileUrl}
      className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors"
    >
      <Avatar shape={avatarShape} className="size-12 shrink-0">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary">
          <User className="size-5" />
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <User className="size-3 shrink-0" />
          <span>Profile</span>
        </div>
        <p className="text-sm font-medium truncate mt-0.5">
          {displayName}
        </p>
        {metadata?.nip05 && (
          <p className="text-xs text-muted-foreground truncate">
            {metadata.nip05}
          </p>
        )}
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Addressable event preview (vines, music, articles, etc.)
// ---------------------------------------------------------------------------

/** Extract a thumbnail URL from an addressable event's tags. */
function extractThumbnail(tags: string[][]): string | undefined {
  // 1. Explicit icon tag (used by zapstore kind 32267)
  const iconTag = tags.find(([n]) => n === 'icon')?.[1];
  if (iconTag) return iconTag;

  // 2. Explicit image/thumb tag
  const imageTag = tags.find(([n]) => n === 'image' || n === 'thumb')?.[1];
  if (imageTag) return imageTag;

  // 3. imeta tag (used by vines / kind 34236)
  const imetaTag = tags.find(([n]) => n === 'imeta');
  if (imetaTag) {
    for (let i = 1; i < imetaTag.length; i++) {
      const part = imetaTag[i];
      if (part.startsWith('image ')) return part.slice(6);
    }
  }

  return undefined;
}

/** Check if an event has video content (imeta with url containing video indicators). */
function hasVideo(tags: string[][]): boolean {
  const imetaTag = tags.find(([n]) => n === 'imeta');
  if (!imetaTag) return false;
  for (let i = 1; i < imetaTag.length; i++) {
    const part = imetaTag[i];
    if (part.startsWith('url ') || part.startsWith('m video/')) return true;
  }
  return false;
}

/** Fallback labels for well-known kinds not in EXTRA_KINDS. */
const WELL_KNOWN_KIND_LABELS: Record<number, string> = {
  3: 'Follow List',
  30000: 'Follow Set',
  31990: 'App',
  32267: 'Zapstore App',
  30063: 'Zapstore Release',
  3063: 'Zapstore Asset',
  15128: 'Nsite',
  35128: 'Nsite',
  31124: 'Blobbi',
};

export function AddressableEventPreview({ addr }: { addr: { kind: number; pubkey: string; identifier: string } }) {
  const { data: event, isLoading } = useAddrEvent(addr);
  const author = useAuthor(addr.pubkey);
  const authorMeta = author.data?.metadata;
  const authorName = authorMeta?.name ?? genUserName(addr.pubkey);

  const kindDef = useMemo(
    () => EXTRA_KINDS.find((d) => d.kind === addr.kind || d.subKinds?.some((s) => s.kind === addr.kind)),
    [addr.kind],
  );
  const kindLabel = useMemo(() => {
    if (kindDef) return kindDef.label;
    const sub = EXTRA_KINDS.flatMap((d) => d.subKinds ?? []).find((s) => s.kind === addr.kind);
    if (sub) return sub.label;
    return WELL_KNOWN_KIND_LABELS[addr.kind] ?? `Kind ${addr.kind}`;
  }, [kindDef, addr.kind]);

  const KindIcon = useMemo(() => {
    if (kindDef?.id) return CONTENT_KIND_ICONS[kindDef.id] ?? FileText;
    // Fallback icons for well-known kinds not in EXTRA_KINDS
    if (addr.kind === 31990 || addr.kind === 32267 || addr.kind === 30063 || addr.kind === 3063) return Package;
    if (addr.kind === 15128 || addr.kind === 35128) return Globe;
    if (addr.kind === 3 || addr.kind === 30000) return Users;
    return FileText;
  }, [kindDef, addr.kind]);

  const title = event?.tags.find(([n]) => n === 'title')?.[1]
    || event?.tags.find(([n]) => n === 'name')?.[1]
    || event?.tags.find(([n]) => n === 'd')?.[1]
    || kindLabel;
  const thumbnail = event ? extractThumbnail(event.tags) : undefined;
  const isVideo = event ? hasVideo(event.tags) : false;

  const link = useMemo(() => {
    return `/${nip19.naddrEncode({ kind: addr.kind, pubkey: addr.pubkey, identifier: addr.identifier })}`;
  }, [addr]);

  if (isLoading) {
    return (
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 rounded-lg shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link
      to={link}
      className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors"
    >
      {thumbnail ? (
        <div className="relative size-12 rounded-lg overflow-hidden shrink-0">
          <img
            src={thumbnail}
            alt={title}
            className="size-full object-cover"
            loading="lazy"
          />
          {isVideo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <Play className="size-4 text-white fill-white" />
            </div>
          )}
        </div>
      ) : (
        <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <KindIcon className="size-5 text-primary/50" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <KindIcon className="size-3 shrink-0" />
          <span>{kindLabel}</span>
          <span className="text-muted-foreground/60">&middot;</span>
          <span className="truncate">{authorName}</span>
        </div>
        <p className="text-sm font-medium truncate mt-0.5">
          {title}
        </p>
      </div>
    </Link>
  );
}
