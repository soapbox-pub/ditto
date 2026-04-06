import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, UserRoundCheck, X, MessageSquare, FileText, Hash, Archive } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { EmojifiedText } from '@/components/CustomEmoji';
import { useSearchProfiles, type SearchProfile } from '@/hooks/useSearchProfiles';
import { genUserName } from '@/lib/genUserName';
import { useNip05Verify } from '@/hooks/useNip05Verify';
import { isFullUrl, detectIdentifier, type IdentifierMatch } from '@/lib/nostrIdentifier';
import { getProfileUrl } from '@/lib/profileUrl';
import { searchCountry, type CountryEntry } from '@/lib/countries';
import { useLinkPreview } from '@/hooks/useLinkPreview';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { useQueryClient } from '@tanstack/react-query';
import { useNip05Resolve } from '@/hooks/useNip05Resolve';
import { useAuthor } from '@/hooks/useAuthor';
import { useEvent, useAddrEvent, type AddrCoords } from '@/hooks/useEvent';
import { useWikipediaSearch, type WikipediaSearchResult } from '@/hooks/useWikipediaSearch';
import { useArchiveSearch, type ArchiveSearchResult } from '@/hooks/useArchiveSearch';
import { WikipediaIcon } from '@/components/icons/WikipediaIcon';
import { searchSidebarItems, type SidebarItemDef } from '@/lib/sidebarItems';
import { cn } from '@/lib/utils';

interface MobileSearchSheetProps {
  hidden: boolean;
  onClose: () => void;
  buddyMode: boolean;
  onToggleBuddy: () => void;
}

export function MobileSearchSheet({ hidden, onClose, buddyMode, onToggleBuddy }: MobileSearchSheetProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: rawProfiles, isFetching, followedPubkeys } = useSearchProfiles(query);

  // Wikipedia & Archive search (async, debounced by their hooks at >=2 chars)
  const { data: wikipediaResults } = useWikipediaSearch(query);
  const { data: archiveResults } = useArchiveSearch(query);

  // Take at most 1 result from each external source
  const wikipediaResult: WikipediaSearchResult | null = wikipediaResults?.[0] ?? null;
  const archiveResult: ArchiveSearchResult | null = archiveResults?.[0] ?? null;

  // Country suggestion (local, synchronous)
  const countryMatch = useMemo(() => searchCountry(query), [query]);

  // Nav item suggestions (local, synchronous)
  const navItems = useMemo(() => searchSidebarItems(query), [query]);

  // URL detection — show "Comment on" option when query is a full URL
  const queryIsUrl = useMemo(() => isFullUrl(query), [query]);
  const hasUrlComment = queryIsUrl;

  // Identifier detection — NIP-05, NIP-19, hex
  const identifierMatch = useMemo(() => detectIdentifier(query), [query]);

  // Resolve NIP-05 identifier pubkey for deduplication
  const nip05Identifier = identifierMatch?.type === 'nip05' ? identifierMatch.identifier : undefined;
  const { data: nip05Pubkey } = useNip05Resolve(nip05Identifier);

  // The pubkey that the identifier item will show (for deduplication)
  const identifierPubkey = useMemo(() => {
    if (!identifierMatch) return undefined;
    if (identifierMatch.type === 'npub' || identifierMatch.type === 'nprofile') return identifierMatch.pubkey;
    if (identifierMatch.type === 'nip05' && nip05Pubkey) return nip05Pubkey;
    return undefined;
  }, [identifierMatch, nip05Pubkey]);

  // Filter out the identifier-resolved profile from search results
  const profiles = useMemo(() => {
    if (!rawProfiles || !identifierPubkey) return rawProfiles;
    return rawProfiles.filter((p) => p.pubkey !== identifierPubkey);
  }, [rawProfiles, identifierPubkey]);

  const profileCount = profiles?.length ?? 0;
  const hasCountry = !!countryMatch;
  // Show country at top only for exact matches; otherwise at bottom (after profiles)
  const countryAtTop = hasCountry && (countryMatch.exact || profileCount === 0);
  const hasIdentifier = !!identifierMatch;
  const hasWikipedia = !!wikipediaResult;
  const hasArchive = !!archiveResult;
  const navItemCount = navItems.length;

  const totalItems = navItemCount + profileCount + (hasCountry ? 1 : 0) + (hasUrlComment ? 1 : 0) + (hasIdentifier ? 1 : 0) + (hasWikipedia ? 1 : 0) + (hasArchive ? 1 : 0);

  // Order: [...navItems, identifier?, commentUrl?, country?(top), ...profiles, country?(bottom), wikipedia?, archive?]
  let nextMobileIdx = 0;
  const navItemStartIndex = nextMobileIdx;
  nextMobileIdx += navItemCount;
  const identifierIndex = hasIdentifier ? nextMobileIdx++ : -1;
  const urlCommentIndex = hasUrlComment ? nextMobileIdx++ : -1;
  const countryTopIndex = (hasCountry && countryAtTop) ? nextMobileIdx++ : -1;
  const profileStartIndex = nextMobileIdx;
  nextMobileIdx += profileCount;
  const countryBottomIndex = (hasCountry && !countryAtTop) ? nextMobileIdx++ : -1;
  const countryIndex = countryAtTop ? countryTopIndex : countryBottomIndex;
  const wikipediaIndex = hasWikipedia ? nextMobileIdx++ : -1;
  const archiveIndex = hasArchive ? nextMobileIdx++ : -1;

  // Lock body scroll while the search sheet is open.
  // overflow:hidden alone is unreliable on mobile Safari, so we also
  // block touchmove on the document (except inside the results scroller).
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const preventScroll = (e: TouchEvent) => {
      // Allow scrolling inside the results list
      const target = e.target as HTMLElement;
      if (target.closest?.('[data-mobile-search-results]')) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', preventScroll, { passive: false });

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('touchmove', preventScroll);
    };
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (!hidden) {
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [hidden]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [profiles]);

  const handleClose = useCallback(() => {
    setQuery('');
    onClose();
  }, [onClose]);

  const handleCommentOnUrl = useCallback(() => {
    if (!queryIsUrl) return;
    handleClose();
    navigate(`/i/${encodeURIComponent(query.trim())}`);
  }, [queryIsUrl, query, navigate, handleClose]);

  const handleSelectCountry = useCallback((country: CountryEntry) => {
    handleClose();
    navigate(`/i/iso3166:${country.code}`);
  }, [navigate, handleClose]);

  const handleSelectIdentifier = useCallback((path: string) => {
    handleClose();
    navigate(path);
  }, [navigate, handleClose]);

  const handleSelectNavItem = useCallback((item: SidebarItemDef) => {
    handleClose();
    navigate(item.path);
  }, [navigate, handleClose]);

  const handleSelectWikipedia = useCallback((result: WikipediaSearchResult) => {
    handleClose();
    navigate(`/i/${encodeURIComponent(result.url)}`);
  }, [navigate, handleClose]);

  const handleSelectArchive = useCallback((result: ArchiveSearchResult) => {
    handleClose();
    navigate(`/i/${encodeURIComponent(`https://archive.org/details/${result.identifier}`)}`);
  }, [navigate, handleClose]);

  const handleSelect = useCallback((profile: SearchProfile) => {
    const nip05 = profile.metadata.nip05;
    const nip05Verified = !!nip05 && queryClient.getQueryData<boolean>(['nip05-verify', nip05, profile.pubkey]) === true;
    const profileUrl = getProfileUrl(profile.pubkey, profile.metadata, nip05Verified);
    handleClose();
    navigate(profileUrl);
  }, [navigate, handleClose, queryClient]);

  const handleTextSearch = useCallback(() => {
    if (!query.trim()) return;

    handleClose();
    navigate(`/discover?tab=posts&q=${encodeURIComponent(query.trim())}`);
  }, [query, navigate, handleClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < totalItems) {
        if (navItemCount > 0 && selectedIndex >= navItemStartIndex && selectedIndex < navItemStartIndex + navItemCount) {
          handleSelectNavItem(navItems[selectedIndex - navItemStartIndex]);
        } else if (hasIdentifier && selectedIndex === identifierIndex) {
          // Identifier item navigation path is determined by the component
          // Trigger via its onClick handler
          const sheet = document.querySelector('[data-mobile-search-results]');
          const items = sheet?.querySelectorAll('[data-search-item]');
          (items?.[selectedIndex] as HTMLElement)?.click();
        } else if (hasUrlComment && selectedIndex === urlCommentIndex) {
          handleCommentOnUrl();
        } else if (hasCountry && selectedIndex === countryIndex) {
          handleSelectCountry(countryMatch!.country);
        } else if (hasWikipedia && selectedIndex === wikipediaIndex) {
          handleSelectWikipedia(wikipediaResult!);
        } else if (hasArchive && selectedIndex === archiveIndex) {
          handleSelectArchive(archiveResult!);
        } else {
          handleSelect(profiles![selectedIndex - profileStartIndex]);
        }
      } else {
        handleTextSearch();
      }
      return;
    }
    if (totalItems === 0) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
    }
  };

  const hasResults = query.trim().length > 0 && (navItemCount > 0 || hasIdentifier || hasUrlComment || hasCountry || hasWikipedia || hasArchive || (profiles && profiles.length > 0));

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 sidebar:hidden animate-in fade-in-0 duration-150"
        onClick={handleClose}
      />

      {/* Bottom sheet — sits at the bottom of the screen with safe area clearance */}
      <div className={cn('fixed left-0 right-0 bottom-0 z-[49] sidebar:hidden animate-in slide-in-from-bottom-4 duration-200 pb-6', hidden && 'hidden')}>

        {/* Results list — reversed so closest to input = most relevant */}
        {hasResults && (
          <div data-mobile-search-results className="flex flex-col-reverse bg-popover/95 rounded-2xl mx-6 mb-0.5 overflow-hidden max-h-[55vh] overflow-y-auto shadow-lg">
            {navItems.map((item, index) => (
              <MobileNavItem
                key={item.id}
                item={item}
                isSelected={index + navItemStartIndex === selectedIndex}
                onClick={handleSelectNavItem}
              />
            ))}
            {hasIdentifier && (
              <MobileIdentifierItem
                match={identifierMatch!}
                isSelected={selectedIndex === identifierIndex}
                onNavigate={handleSelectIdentifier}
              />
            )}
            {hasUrlComment && (
              <MobileCommentOnUrlItem
                url={query.trim()}
                isSelected={selectedIndex === urlCommentIndex}
                onClick={handleCommentOnUrl}
              />
            )}
            {hasCountry && countryAtTop && (
              <SearchCountryItem
                country={countryMatch!.country}
                isSelected={selectedIndex === countryIndex}
                onClick={handleSelectCountry}
              />
            )}
            {profiles && profiles.map((profile, index) => (
              <SearchProfileItem
                key={profile.pubkey}
                profile={profile}
                isSelected={index + profileStartIndex === selectedIndex}
                isFollowed={followedPubkeys.has(profile.pubkey)}
                onClick={handleSelect}
              />
            ))}
            {hasCountry && !countryAtTop && (
              <SearchCountryItem
                country={countryMatch!.country}
                isSelected={selectedIndex === countryIndex}
                onClick={handleSelectCountry}
              />
            )}
            {hasWikipedia && (
              <MobileWikipediaItem
                result={wikipediaResult!}
                isSelected={selectedIndex === wikipediaIndex}
                onClick={handleSelectWikipedia}
              />
            )}
            {hasArchive && (
              <MobileArchiveItem
                result={archiveResult!}
                isSelected={selectedIndex === archiveIndex}
                onClick={handleSelectArchive}
              />
            )}
          </div>
        )}

        {/* Input bar */}
        <div className="flex items-center px-6 py-3 safe-area-bottom">
          <div className="flex items-center gap-2 flex-1 bg-secondary rounded-full px-4 py-2.5">
            {isFetching ? (
              <svg
                className="size-4 shrink-0 text-muted-foreground"
                style={{ animation: 'spin 1s linear infinite' }}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <Search strokeWidth={4} className="size-4 shrink-0 text-muted-foreground" />
            )}
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search people or topics..."
              className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            {query.length > 0 && (
              <button
                onClick={() => setQuery('')}
                className="size-5 shrink-0 flex items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
              >
                <X strokeWidth={4} className="size-3" />
              </button>
            )}
            <button
              onClick={onToggleBuddy}
              className={cn(
                'shrink-0 font-mono text-xs transition-colors',
                buddyMode ? 'text-primary' : 'text-muted-foreground hover:text-muted-foreground/80',
              )}
              onMouseDown={(e) => e.preventDefault()}
            >
              {'<[o_o]>'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function MobileNavItem({
  item,
  isSelected,
  onClick,
}: {
  item: SidebarItemDef;
  isSelected: boolean;
  onClick: (item: SidebarItemDef) => void;
}) {
  const Icon = item.icon;

  return (
    <button
      data-search-item
      role="option"
      aria-selected={isSelected}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={() => onClick(item)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="size-9 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
        <Icon className="size-3.5 text-primary" />
      </div>
      <span className="font-semibold text-sm truncate">{item.label}</span>
    </button>
  );
}

/**
 * Mobile autocomplete item for a detected Nostr identifier.
 */
function MobileIdentifierItem({
  match,
  isSelected,
  onNavigate,
}: {
  match: IdentifierMatch;
  isSelected: boolean;
  onNavigate: (path: string) => void;
}) {
  switch (match.type) {
    case 'nip05':
      return <MobileNip05Item identifier={match.identifier} isSelected={isSelected} onNavigate={onNavigate} />;
    case 'npub':
    case 'nprofile':
      return <MobilePubkeyItem pubkey={match.pubkey} raw={match.raw} isSelected={isSelected} onNavigate={onNavigate} />;
    case 'note':
      return <MobileEventItem eventId={match.eventId} raw={match.raw} isSelected={isSelected} onNavigate={onNavigate} />;
    case 'nevent':
      return <MobileEventItem eventId={match.eventId} relays={match.relays} authorHint={match.authorHint} raw={match.raw} isSelected={isSelected} onNavigate={onNavigate} />;
    case 'naddr':
      return <MobileAddrItem addr={match.addr} relays={match.relays} raw={match.raw} isSelected={isSelected} onNavigate={onNavigate} />;
    case 'hex':
      return <MobileHexItem hex={match.hex} isSelected={isSelected} onNavigate={onNavigate} />;
  }
}

function MobileNip05Item({
  identifier,
  isSelected,
  onNavigate,
}: {
  identifier: string;
  isSelected: boolean;
  onNavigate: (path: string) => void;
}) {
  const { data: pubkey, isLoading } = useNip05Resolve(identifier);
  const author = useAuthor(pubkey ?? undefined);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || metadata?.display_name || (pubkey ? genUserName(pubkey) : identifier);
  const tags = author.data?.event?.tags ?? [];

  if (isLoading) {
    return (
      <div data-search-item className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
        isSelected ? 'bg-accent text-accent-foreground' : '',
      )}>
        <div className="size-9 shrink-0 rounded-full bg-secondary animate-pulse" />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="h-4 w-24 bg-secondary animate-pulse rounded" />
          <div className="h-3 w-32 bg-secondary animate-pulse rounded" />
        </div>
      </div>
    );
  }

  if (!pubkey) return null;

  return (
    <button
      data-search-item
      role="option"
      aria-selected={isSelected}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={() => onNavigate(`/${identifier}`)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <Avatar shape={getAvatarShape(metadata)} className="size-9 shrink-0">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-sm">
          {displayName[0]?.toUpperCase() || '?'}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-sm truncate block">
          <EmojifiedText tags={tags}>{displayName}</EmojifiedText>
        </span>
        <span className="text-xs text-muted-foreground truncate block">{identifier}</span>
      </div>
    </button>
  );
}

function MobilePubkeyItem({
  pubkey,
  raw,
  isSelected,
  onNavigate,
}: {
  pubkey: string;
  raw: string;
  isSelected: boolean;
  onNavigate: (path: string) => void;
}) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || metadata?.display_name || genUserName(pubkey);
  const tags = author.data?.event?.tags ?? [];

  return (
    <button
      data-search-item
      role="option"
      aria-selected={isSelected}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={() => onNavigate(`/${raw}`)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <Avatar shape={getAvatarShape(metadata)} className="size-9 shrink-0">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-sm">
          {displayName[0]?.toUpperCase() || '?'}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-sm truncate block">
          {author.isLoading ? (
            <span className="text-muted-foreground">Loading profile...</span>
          ) : (
            <EmojifiedText tags={tags}>{displayName}</EmojifiedText>
          )}
        </span>
        <span className="text-xs text-muted-foreground truncate block font-mono">
          {raw.slice(0, 8)}...{raw.slice(-4)}
        </span>
      </div>
    </button>
  );
}

function MobileEventItem({
  eventId,
  relays,
  authorHint,
  raw,
  isSelected,
  onNavigate,
}: {
  eventId: string;
  relays?: string[];
  authorHint?: string;
  raw: string;
  isSelected: boolean;
  onNavigate: (path: string) => void;
}) {
  const { data: event, isLoading } = useEvent(eventId, relays, authorHint);
  const author = useAuthor(event?.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || metadata?.display_name || (event ? genUserName(event.pubkey) : undefined);

  return (
    <button
      data-search-item
      role="option"
      aria-selected={isSelected}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={() => onNavigate(`/${raw}`)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="size-9 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
        <FileText className="size-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        {isLoading ? (
          <span className="text-sm text-muted-foreground">Loading event...</span>
        ) : event ? (
          <>
            <span className="text-sm truncate block">{event.content.slice(0, 80) || `Kind ${event.kind} event`}</span>
            <span className="text-xs text-muted-foreground truncate block">
              {displayName ? `by ${displayName}` : raw.slice(0, 8) + '...' + raw.slice(-4)}
            </span>
          </>
        ) : (
          <>
            <span className="text-sm font-medium truncate block">Go to event</span>
            <span className="text-xs text-muted-foreground truncate block font-mono">
              {raw.slice(0, 8)}...{raw.slice(-4)}
            </span>
          </>
        )}
      </div>
    </button>
  );
}

function MobileAddrItem({
  addr,
  relays,
  raw,
  isSelected,
  onNavigate,
}: {
  addr: AddrCoords;
  relays?: string[];
  raw: string;
  isSelected: boolean;
  onNavigate: (path: string) => void;
}) {
  const { data: event, isLoading } = useAddrEvent(addr, relays);
  const author = useAuthor(event?.pubkey ?? addr.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || metadata?.display_name || genUserName(addr.pubkey);
  const title = event?.tags.find(([t]) => t === 'title')?.[1];

  return (
    <button
      data-search-item
      role="option"
      aria-selected={isSelected}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={() => onNavigate(`/${raw}`)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="size-9 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
        <FileText className="size-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        {isLoading ? (
          <span className="text-sm text-muted-foreground">Loading...</span>
        ) : (
          <>
            <span className="text-sm truncate block">
              {title || event?.content.slice(0, 80) || `Kind ${addr.kind} event`}
            </span>
            <span className="text-xs text-muted-foreground truncate block">
              by {displayName}
            </span>
          </>
        )}
      </div>
    </button>
  );
}

function MobileHexItem({
  hex,
  isSelected,
  onNavigate,
}: {
  hex: string;
  isSelected: boolean;
  onNavigate: (path: string) => void;
}) {
  return (
    <button
      data-search-item
      role="option"
      aria-selected={isSelected}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={() => onNavigate(`/${hex}`)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="size-9 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
        <Hash className="size-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate block">Go to identifier</span>
        <span className="text-xs text-muted-foreground truncate block font-mono">
          {hex.slice(0, 8)}...{hex.slice(-4)}
        </span>
      </div>
    </button>
  );
}

function SearchCountryItem({
  country,
  isSelected,
  onClick,
}: {
  country: CountryEntry;
  isSelected: boolean;
  onClick: (country: CountryEntry) => void;
}) {
  return (
    <button
      role="option"
      aria-selected={isSelected}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={() => onClick(country)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="size-9 shrink-0 rounded-full bg-secondary flex items-center justify-center">
        <span className="text-lg leading-none" role="img" aria-label={`Flag of ${country.name}`}>
          {country.flag}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-sm truncate">{country.name}</span>
        <div className="text-xs text-muted-foreground">{country.code}</div>
      </div>
    </button>
  );
}

function MobileCommentOnUrlItem({
  url,
  isSelected,
  onClick,
}: {
  url: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { data: preview } = useLinkPreview(url);
  const thumbnailUrl = preview?.thumbnail_url;

  return (
    <button
      role="option"
      aria-selected={isSelected}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="size-9 shrink-0 rounded-lg overflow-hidden bg-primary/10 flex items-center justify-center">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            className="size-9 object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
            }}
          />
        ) : null}
        <div
          className={cn('items-center justify-center size-9', thumbnailUrl ? 'hidden' : 'flex')}
        >
          <ExternalFavicon url={url} size={16} fallback={<MessageSquare className="size-3.5 text-primary" />} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate block">
          {preview?.title ?? 'Comment on this link'}
        </span>
        <span className="text-xs text-muted-foreground truncate block">
          {(() => {
            try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
          })()}
        </span>
      </div>
    </button>
  );
}

function SearchProfileItem({
  profile,
  isSelected,
  isFollowed,
  onClick,
}: {
  profile: SearchProfile;
  isSelected: boolean;
  isFollowed: boolean;
  onClick: (profile: SearchProfile) => void;
}) {
  const { metadata, pubkey } = profile;
  const displayName = metadata.display_name || metadata.name || genUserName(pubkey);
  const nip05 = metadata.nip05;
  const { data: nip05Verified } = useNip05Verify(nip05, pubkey);
  const nip05Display = nip05Verified && nip05 ? (nip05.startsWith('_@') ? nip05.slice(2) : nip05) : undefined;
  const identifier = nip05Display || nip19.npubEncode(pubkey);

  return (
    <button
      role="option"
      aria-selected={isSelected}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={() => onClick(profile)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="relative shrink-0">
        <Avatar shape={getAvatarShape(metadata)} className="size-9">
          <AvatarImage src={metadata.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-sm">
            {displayName[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        {isFollowed && (
          <span className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-primary flex items-center justify-center ring-2 ring-popover">
            <UserRoundCheck className="size-2.5 text-primary-foreground" strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-sm truncate">
            <EmojifiedText tags={profile.event.tags}>{displayName}</EmojifiedText>
          </span>
          {metadata.bot && <span className="text-xs text-primary">🤖</span>}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {nip05Display
            ? <span>{identifier}</span>
            : <span className="font-mono text-[11px]">{identifier}</span>
          }
        </div>
      </div>
    </button>
  );
}

function MobileWikipediaItem({
  result,
  isSelected,
  onClick,
}: {
  result: WikipediaSearchResult;
  isSelected: boolean;
  onClick: (result: WikipediaSearchResult) => void;
}) {
  return (
    <button
      data-search-item
      role="option"
      aria-selected={isSelected}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={() => onClick(result)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="size-9 shrink-0 rounded-full bg-secondary flex items-center justify-center">
        {result.thumbnail ? (
          <img
            src={result.thumbnail}
            alt=""
            className="size-9 rounded-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
            }}
          />
        ) : null}
        <div className={cn('items-center justify-center size-9', result.thumbnail ? 'hidden' : 'flex')}>
          <WikipediaIcon className="size-3.5 text-muted-foreground" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-sm truncate block">{result.title}</span>
        <div className="text-xs text-muted-foreground truncate">Wikipedia</div>
      </div>
    </button>
  );
}

function MobileArchiveItem({
  result,
  isSelected,
  onClick,
}: {
  result: ArchiveSearchResult;
  isSelected: boolean;
  onClick: (result: ArchiveSearchResult) => void;
}) {
  const thumbnail = `https://archive.org/services/img/${result.identifier}`;

  return (
    <button
      data-search-item
      role="option"
      aria-selected={isSelected}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={() => onClick(result)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="size-9 shrink-0 rounded-full bg-secondary flex items-center justify-center overflow-hidden">
        <img
          src={thumbnail}
          alt=""
          className="size-9 rounded-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
          }}
        />
        <div className="hidden items-center justify-center size-9">
          <Archive className="size-3.5 text-muted-foreground" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-sm truncate block">{result.title}</span>
        <div className="text-xs text-muted-foreground truncate">Internet Archive</div>
      </div>
    </button>
  );
}
