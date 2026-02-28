import { useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, BookOpen, ExternalLink, Globe, MapPin, MessageSquare } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { NoteCard } from '@/components/NoteCard';
import { CommentForm } from '@/components/comments/CommentForm';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { YouTubeEmbed } from '@/components/YouTubeEmbed';
import { useComments } from '@/hooks/useComments';
import { useLinkPreview } from '@/hooks/useLinkPreview';
import { useBookInfo } from '@/hooks/useBookInfo';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { getCountryInfo } from '@/lib/countries';
import { cn, STICKY_HEADER_CLASS } from '@/lib/utils';
import NotFound from './NotFound';

/** Parsed external content identifier with its type. */
type ExternalContent =
  | { type: 'url'; value: string }
  | { type: 'isbn'; value: string }
  | { type: 'iso3166'; value: string; code: string }
  | { type: 'unknown'; value: string };

/** Parse a URI string into a typed external content object. */
function parseExternalUri(uri: string): ExternalContent {
  // ISBN - "isbn:9780765382030"
  if (uri.startsWith('isbn:')) {
    return { type: 'isbn', value: uri, };
  }

  // ISO 3166 country/subdivision - "iso3166:US" or "iso3166:US-CA"
  if (uri.startsWith('iso3166:')) {
    const code = uri.slice('iso3166:'.length);
    return { type: 'iso3166', value: uri, code };
  }

  // URL - starts with http:// or https://
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return { type: 'url', value: uri };
  }

  return { type: 'unknown', value: uri };
}

/** Extract a YouTube video ID from a URL, or null if not a YouTube link. */
function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if ((u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com' || u.hostname === 'm.youtube.com') && u.pathname === '/watch') {
      return u.searchParams.get('v');
    }
    if ((u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') && u.pathname.startsWith('/embed/')) {
      return u.pathname.split('/')[2] || null;
    }
    if ((u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') && u.pathname.startsWith('/shorts/')) {
      return u.pathname.split('/')[2] || null;
    }
    if (u.hostname === 'youtu.be') {
      return u.pathname.slice(1) || null;
    }
  } catch {
    // not a valid URL
  }
  return null;
}

/** Format an ISBN with hyphens for display (simplified). */
function formatIsbn(isbn: string): string {
  const digits = isbn.replace(/\D/g, '');
  if (digits.length === 13) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 4)}-${digits.slice(4, 9)}-${digits.slice(9, 12)}-${digits.slice(12)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 1)}-${digits.slice(1, 5)}-${digits.slice(5, 9)}-${digits.slice(9)}`;
  }
  return isbn;
}

// ---------------------------------------------------------------------------
// URL content header
// ---------------------------------------------------------------------------

function UrlContentHeader({ url }: { url: string }) {
  const youtubeId = useMemo(() => extractYouTubeId(url), [url]);
  const { data, isLoading } = useLinkPreview(url);

  const domain = useMemo(() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }, [url]);

  if (isLoading && !youtubeId) {
    return (
      <div className="rounded-2xl border border-border overflow-hidden">
        <Skeleton className="w-full h-[220px] rounded-none" />
        <div className="p-5 space-y-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
    );
  }

  const title = data?.title;
  const author = data?.author_name;
  const providerName = data?.provider_name || domain;

  // YouTube URLs get the interactive embed player
  if (youtubeId) {
    return (
      <div className="space-y-0 rounded-2xl border border-border overflow-hidden">
        <YouTubeEmbed videoId={youtubeId} className="border-0 rounded-none" />

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="group block p-5 space-y-2 hover:bg-secondary/40 transition-colors"
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ExternalFavicon url={url} size={14} className="shrink-0" />
            <span className="truncate">{providerName}</span>
            <ExternalLink className="size-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {title && (
            <h2 className="text-xl font-bold leading-snug line-clamp-3">
              {title}
            </h2>
          )}

          {author && (
            <p className="text-sm text-muted-foreground">
              by {author}
            </p>
          )}
        </a>
      </div>
    );
  }

  // Generic URL link preview
  const image = data?.thumbnail_url;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group block rounded-2xl border border-border overflow-hidden',
        'hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300',
      )}
    >
      {image && (
        <div className="w-full overflow-hidden">
          <img
            src={image}
            alt=""
            className="w-full h-[220px] object-cover group-hover:scale-[1.02] transition-transform duration-500"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      )}

      <div className="p-5 space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ExternalFavicon url={url} size={14} className="shrink-0" />
          <span className="truncate">{providerName}</span>
          <ExternalLink className="size-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {title && (
          <h2 className="text-xl font-bold leading-snug line-clamp-3">
            {title}
          </h2>
        )}

        {!title && (
          <h2 className="text-xl font-bold leading-snug break-all line-clamp-2 text-muted-foreground">
            {url}
          </h2>
        )}

        {author && (
          <p className="text-sm text-muted-foreground">
            by {author}
          </p>
        )}
      </div>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Book content header
// ---------------------------------------------------------------------------

function BookContentHeader({ isbn }: { isbn: string }) {
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
          {/* Book cover */}
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

          {/* Book details */}
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

      {/* OpenLibrary link */}
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

// ---------------------------------------------------------------------------
// Country content header
// ---------------------------------------------------------------------------

function CountryContentHeader({ code }: { code: string }) {
  const info = getCountryInfo(code);

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
      <div className="p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <span className="text-6xl sm:text-7xl leading-none" role="img" aria-label={`Flag of ${info.name}`}>
            {info.flag}
          </span>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />
              <span>ISO 3166 {info.subdivision ? `(${info.subdivision})` : `(${code.toUpperCase()})`}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold leading-snug">
              {info.name}
            </h2>
            {info.subdivision && (
              <p className="text-sm text-muted-foreground">
                Subdivision: {info.subdivision}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-border px-5 py-2.5">
        <a
          href={`https://en.wikipedia.org/wiki/ISO_3166-2:${code.toUpperCase()}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Globe className="size-3.5" />
          <span>View on Wikipedia</span>
          <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page header label
// ---------------------------------------------------------------------------

function headerLabel(content: ExternalContent): string {
  switch (content.type) {
    case 'url':
      if (extractYouTubeId(content.value)) return 'YouTube';
      try {
        return new URL(content.value).hostname.replace(/^www\./, '');
      } catch {
        return 'Web Page';
      }
    case 'isbn':
      return 'Book';
    case 'iso3166':
      return getCountryInfo(content.code)?.name ?? 'Country';
    default:
      return 'External Content';
  }
}

function seoTitle(content: ExternalContent): string {
  switch (content.type) {
    case 'url':
      try {
        return `${new URL(content.value).hostname.replace(/^www\./, '')} | Ditto`;
      } catch {
        return 'Web Page | Ditto';
      }
    case 'isbn': {
      const isbn = content.value.replace('isbn:', '');
      return `Book (ISBN ${isbn}) | Ditto`;
    }
    case 'iso3166': {
      const info = getCountryInfo(content.code);
      return info ? `${info.name} | Ditto` : 'Country | Ditto';
    }
    default:
      return 'External Content | Ditto';
  }
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export function ExternalContentPage() {
  const { '*': rawUri } = useParams();
  const location = useLocation();

  // Support both encoded URLs (/i/https%3A%2F%2F...) and bare URLs (/i/https://...?q=x).
  // For bare URLs the browser splits the target's query string into location.search,
  // so we reattach it. For encoded URLs we decode the whole thing.
  const uri = useMemo(() => {
    if (!rawUri) return '';
    // If the wildcard param looks already encoded (no "://" present), decode it.
    if (!rawUri.includes('://')) {
      return decodeURIComponent(rawUri);
    }
    // Otherwise it's a bare URL — reattach any query string the browser separated out.
    return rawUri + location.search;
  }, [rawUri, location.search]);

  const content = useMemo(() => {
    if (!uri) return null;
    return parseExternalUri(uri);
  }, [uri]);

  useSeoMeta({ title: content ? seoTitle(content) : 'External Content | Ditto' });

  // Build the NIP-73 identifier for comments.
  // For URLs, the raw URL is used. For others, the full prefixed identifier.
  const commentRoot = useMemo(() => {
    if (!content) return undefined;
    return new URL(content.value);
  }, [content]);

  const { muteItems } = useMuteList();
  const { data: commentsData, isLoading: commentsLoading } = useComments(commentRoot, 500);

  // Build a reply tree: direct replies each paired with their first sub-reply.
  const orderedReplies = useMemo(() => {
    const topLevel = commentsData?.topLevelComments ?? [];
    const filteredTopLevel = muteItems.length > 0
      ? topLevel.filter((r) => !isEventMuted(r, muteItems))
      : topLevel;

    // Sort oldest-first for threaded conversation view (useComments returns newest-first)
    const sorted = [...filteredTopLevel].sort((a, b) => a.created_at - b.created_at);

    return sorted.map((reply) => {
      const directReplies = commentsData?.getDirectReplies(reply.id) ?? [];
      return {
        reply,
        firstSubReply: directReplies[0] as import('@nostrify/nostrify').NostrEvent | undefined,
      };
    });
  }, [commentsData, muteItems]);

  if (!content || !uri || !commentRoot) {
    return <NotFound />;
  }

  return (
    <main className="min-h-screen">
      {/* Sticky header */}
      <div className={cn(STICKY_HEADER_CLASS, 'flex items-center gap-4 px-4 mt-4 mb-5 bg-background/80 backdrop-blur-md z-10')}>
        <Link to="/" className="p-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-xl font-bold truncate">{headerLabel(content)}</h1>
      </div>

      <div className="px-4 space-y-6 pb-8">
        {/* Content-specific header */}
        {content.type === 'url' && <UrlContentHeader url={content.value} />}
        {content.type === 'isbn' && <BookContentHeader isbn={content.value} />}
        {content.type === 'iso3166' && <CountryContentHeader code={content.code} />}
        {content.type === 'unknown' && (
          <div className="rounded-2xl border border-border p-5 text-center">
            <Globe className="size-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground break-all">{content.value}</p>
          </div>
        )}

        {/* Comment compose form */}
        <CommentForm root={commentRoot} />
      </div>

      {/* Threaded comments list */}
      <div>
        {commentsLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex gap-3">
                  <Skeleton className="size-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : orderedReplies.length > 0 ? (
          orderedReplies.map(({ reply, firstSubReply }) => (
            <div key={reply.id}>
              <NoteCard event={reply} threaded={!!firstSubReply} />
              {firstSubReply && (
                <NoteCard event={firstSubReply} threadedLast />
              )}
            </div>
          ))
        ) : (
          <div className="py-12 text-center text-muted-foreground text-sm">
            <MessageSquare className="size-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium mb-2">No comments yet</p>
            <p>Be the first to share your thoughts about this!</p>
          </div>
        )}
      </div>
    </main>
  );
}
