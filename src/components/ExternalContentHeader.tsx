/* eslint-disable react-refresh/only-export-components */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ExternalLink, Globe, MapPin, User } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { LinkEmbed, extractYouTubeId, embedLabel } from '@/components/LinkEmbed';
import { useLinkPreview } from '@/hooks/useLinkPreview';
import { useBookInfo } from '@/hooks/useBookInfo';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { genUserName } from '@/lib/genUserName';
import { getCountryInfo } from '@/lib/countries';

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

/** Parsed external content identifier with its type. */
export type ExternalContent =
  | { type: 'url'; value: string }
  | { type: 'isbn'; value: string }
  | { type: 'iso3166'; value: string; code: string }
  | { type: 'unknown'; value: string };

/** Parse a URI string into a typed external content object. */
export function parseExternalUri(uri: string): ExternalContent {
  if (uri.startsWith('isbn:')) {
    return { type: 'isbn', value: uri };
  }
  if (uri.startsWith('iso3166:')) {
    const code = uri.slice('iso3166:'.length);
    return { type: 'iso3166', value: uri, code };
  }
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return { type: 'url', value: uri };
  }
  return { type: 'unknown', value: uri };
}

/** Format an ISBN with hyphens for display (simplified). */
export function formatIsbn(isbn: string): string {
  const digits = isbn.replace(/\D/g, '');
  if (digits.length === 13) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 4)}-${digits.slice(4, 9)}-${digits.slice(9, 12)}-${digits.slice(12)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 1)}-${digits.slice(1, 5)}-${digits.slice(5, 9)}-${digits.slice(9)}`;
  }
  return isbn;
}

/** Get a short label for the content type. */
export function headerLabel(content: ExternalContent): string {
  switch (content.type) {
    case 'url': {
      const label = embedLabel(content.value);
      if (label) return label;
      try {
        return new URL(content.value).hostname.replace(/^www\./, '');
      } catch {
        return 'Web Page';
      }
    }
    case 'isbn':
      return 'Book';
    case 'iso3166':
      return getCountryInfo(content.code)?.name ?? 'Country';
    default:
      return 'External Content';
  }
}

/** Get a page title for SEO. */
export function seoTitle(content: ExternalContent, appName: string): string {
  switch (content.type) {
    case 'url':
      try {
        return `${new URL(content.value).hostname.replace(/^www\./, '')} | ${appName}`;
      } catch {
        return `Web Page | ${appName}`;
      }
    case 'isbn': {
      const isbn = content.value.replace('isbn:', '');
      return `Book (ISBN ${isbn}) | ${appName}`;
    }
    case 'iso3166': {
      const info = getCountryInfo(content.code);
      return info ? `${info.name} | ${appName}` : `Country | ${appName}`;
    }
    default:
      return `External Content | ${appName}`;
  }
}

// ---------------------------------------------------------------------------
// Full-size content headers (used on /i/ page)
// ---------------------------------------------------------------------------

export function UrlContentHeader({ url }: { url: string }) {
  return <LinkEmbed url={url} showDiscuss={false} />;
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

export function CountryContentHeader({ code }: { code: string }) {
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
export function ProfilePreview({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
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
      <Avatar className="size-12 shrink-0">
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
