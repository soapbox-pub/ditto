import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ExternalLink, Globe, MapPin, User, Users } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { LinkEmbed } from '@/components/LinkEmbed';
import { extractYouTubeId } from '@/lib/linkEmbed';
import { useLinkPreview } from '@/hooks/useLinkPreview';
import { useBookInfo } from '@/hooks/useBookInfo';
import { useAddrEvent } from '@/hooks/useEvent';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { genUserName } from '@/lib/genUserName';
import { getCountryInfo, getWikipediaTitle } from '@/lib/countries';
import { useWikipediaSummary } from '@/hooks/useWikipediaSummary';
import { parseExternalUri, formatIsbn } from '@/lib/externalContent';

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
      {/* Thumbnail banner */}
      {wiki?.thumbnail && (
        <div className="relative w-full h-40 sm:h-52 overflow-hidden bg-secondary">
          <img
            src={wiki.originalImage?.source ?? wiki.thumbnail.source}
            alt={info.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        </div>
      )}

      {/* Flag + name */}
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
            {wiki?.description && !info.subdivision && (
              <p className="text-sm text-muted-foreground capitalize">
                {wiki.description}
              </p>
            )}
          </div>
        </div>

        {/* Wikipedia extract */}
        {wikiLoading ? (
          <div className="mt-5 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : wiki?.extract ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {wiki.extract}
            </p>
            <a
              href={wiki.articleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Globe className="size-3.5" />
              <span>Read more on Wikipedia</span>
              <ExternalLink className="size-3" />
            </a>
          </div>
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
