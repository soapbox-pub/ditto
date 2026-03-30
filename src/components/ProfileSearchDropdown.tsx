import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, UserRoundCheck, MessageSquare, FileText, Hash, Archive } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { EmojifiedText } from '@/components/CustomEmoji';
import { useSearchProfiles, type SearchProfile } from '@/hooks/useSearchProfiles';
import { genUserName } from '@/lib/genUserName';
import { useNip05Verify } from '@/hooks/useNip05Verify';
import { isFullUrl, detectIdentifier, type IdentifierMatch } from '@/lib/nostrIdentifier';
import { useProfileUrl } from '@/hooks/useProfileUrl';
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

interface ProfileSearchDropdownProps {
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  onSelect?: (profile: SearchProfile) => void;
  /** When true, pressing Enter without a profile selected navigates to the search page */
  enableTextSearch?: boolean;
  /** When true, country suggestions are hidden from the dropdown */
  hideCountry?: boolean;
}

export function ProfileSearchDropdown({
  placeholder = 'Search people...',
  className,
  inputClassName,
  autoFocus,
  onSelect,
  enableTextSearch,
  hideCountry = false,
}: ProfileSearchDropdownProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: rawProfiles, isFetching, followedPubkeys } = useSearchProfiles(query);

  // Wikipedia & Archive search (async, debounced by their hooks at >=2 chars)
  const { data: wikipediaResults } = useWikipediaSearch(query);
  const { data: archiveResults } = useArchiveSearch(query);

  // Take at most 1 result from each external source
  const wikipediaResult: WikipediaSearchResult | null = wikipediaResults?.[0] ?? null;
  const archiveResult: ArchiveSearchResult | null = archiveResults?.[0] ?? null;

  // Country suggestion (local, synchronous) — suppressed when hideCountry is true
  const countryMatchRaw = useMemo(() => searchCountry(query), [query]);
  const countryMatch = hideCountry ? null : countryMatchRaw;

  // Nav item suggestions (local, synchronous)
  const navItems = useMemo(() => searchSidebarItems(query), [query]);

  // URL detection — show "Comment on" option when query is a full URL
  const queryIsUrl = useMemo(() => isFullUrl(query), [query]);

  // Identifier detection — NIP-05, NIP-19, hex
  const identifierMatch = useMemo(() => detectIdentifier(query), [query]);

  // Resolve NIP-05 identifier pubkey at the parent so we can deduplicate
  const nip05Identifier = identifierMatch?.type === 'nip05' ? identifierMatch.identifier : undefined;
  const { data: nip05Pubkey } = useNip05Resolve(nip05Identifier);

  // The pubkey that the identifier item will show (for deduplication)
  const identifierPubkey = useMemo(() => {
    if (!identifierMatch) return undefined;
    if (identifierMatch.type === 'npub' || identifierMatch.type === 'nprofile') return identifierMatch.pubkey;
    if (identifierMatch.type === 'nip05' && nip05Pubkey) return nip05Pubkey;
    return undefined;
  }, [identifierMatch, nip05Pubkey]);

  // Filter out the identifier-resolved profile from search results to avoid duplication
  const profiles = useMemo(() => {
    if (!rawProfiles || !identifierPubkey) return rawProfiles;
    return rawProfiles.filter((p) => p.pubkey !== identifierPubkey);
  }, [rawProfiles, identifierPubkey]);

  const profileCount = profiles?.length ?? 0;
  // Show country at top only for exact matches; otherwise at bottom (after profiles)
  const countryAtTop = !!countryMatch && (countryMatch.exact || profileCount === 0);

  // Show dropdown when we have results, or when text search is enabled and there's a query
  useEffect(() => {
    if (query.trim().length > 0) {
      if (enableTextSearch || (profiles && profiles.length > 0) || countryMatch || navItems.length > 0 || wikipediaResult || archiveResult) {
        setOpen(true);
      }
    }
  }, [profiles, query, enableTextSearch, countryMatch, navItems, wikipediaResult, archiveResult]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [profiles]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback((profile: SearchProfile, profileUrl: string) => {
    setOpen(false);
    setQuery('');
    if (onSelect) {
      onSelect(profile);
    } else {
      navigate(profileUrl);
    }
  }, [navigate, onSelect]);

  const handleTextSearch = useCallback(() => {
    if (!query.trim()) return;
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();

    if (!enableTextSearch) return;
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  }, [enableTextSearch, query, navigate]);

  // Total selectable items: navItems + identifier? + URL comment? + country?(top) + profiles + country?(bottom) + wikipedia? + archive?
  const hasCountry = !!countryMatch;
  const hasUrlComment = queryIsUrl && enableTextSearch;
  const hasIdentifier = !!identifierMatch;
  const hasWikipedia = !!wikipediaResult;
  const hasArchive = !!archiveResult;
  const navItemCount = navItems.length;
  const totalItems = navItemCount + profileCount + (hasCountry ? 1 : 0) + (hasUrlComment ? 1 : 0) + (hasIdentifier ? 1 : 0) + (hasWikipedia ? 1 : 0) + (hasArchive ? 1 : 0);

  // Map selectedIndex to what it refers to.
  // Order: [...navItems, identifier?, commentUrl?, country?(top), ...profiles, country?(bottom), wikipedia?, archive?]
  let nextIdx = 0;
  const navItemStartIndex = nextIdx;
  nextIdx += navItemCount;
  const identifierIndex = hasIdentifier ? nextIdx++ : -1;
  const urlCommentIndex = hasUrlComment ? nextIdx++ : -1;
  const countryTopIndex = (hasCountry && countryAtTop) ? nextIdx++ : -1;
  const profileStartIndex = nextIdx;
  nextIdx += profileCount;
  const countryBottomIndex = (hasCountry && !countryAtTop) ? nextIdx++ : -1;
  const countryIndex = countryAtTop ? countryTopIndex : countryBottomIndex;
  const wikipediaIndex = hasWikipedia ? nextIdx++ : -1;
  const archiveIndex = hasArchive ? nextIdx++ : -1;

  const handleCommentOnUrl = useCallback(() => {
    if (!queryIsUrl) return;
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
    navigate(`/i/${encodeURIComponent(query.trim())}`);
  }, [queryIsUrl, query, navigate]);

  const handleSelectCountry = useCallback((country: CountryEntry) => {
    setOpen(false);
    setQuery('');
    navigate(`/i/iso3166:${country.code}`);
  }, [navigate]);

  const handleSelectWikipedia = useCallback((result: WikipediaSearchResult) => {
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
    navigate(`/i/${encodeURIComponent(result.url)}`);
  }, [navigate]);

  const handleSelectArchive = useCallback((result: ArchiveSearchResult) => {
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
    navigate(`/i/${encodeURIComponent(`https://archive.org/details/${result.identifier}`)}`);
  }, [navigate]);

  const handleSelectIdentifier = useCallback((path: string) => {
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
    navigate(path);
  }, [navigate]);

  const handleSelectNavItem = useCallback((item: SidebarItemDef) => {
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
    navigate(item.path);
  }, [navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (open && selectedIndex >= 0 && selectedIndex < totalItems) {
        if (navItemCount > 0 && selectedIndex >= navItemStartIndex && selectedIndex < navItemStartIndex + navItemCount) {
          handleSelectNavItem(navItems[selectedIndex - navItemStartIndex]);
        } else if (hasIdentifier && selectedIndex === identifierIndex) {
          // Handled by the IdentifierItem component via its onClick
          // which calls handleSelectIdentifier — trigger via DOM click
          const items = listRef.current?.querySelectorAll('[data-search-item]');
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
          const profileIdx = selectedIndex - profileStartIndex;
          const profile = profiles![profileIdx];
          const nip05 = profile.metadata.nip05;
          const nip05Verified = !!nip05 && queryClient.getQueryData<boolean>(['nip05-verify', nip05, profile.pubkey]) === true;
          handleSelect(profile, getProfileUrl(profile.pubkey, profile.metadata, nip05Verified));
        }
      } else {
        handleTextSearch();
      }
      return;
    }

    if (!open || totalItems === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
        break;
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-search-item]');
      items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Search input */}
      <div className="relative flex items-center">
        <Search className="absolute left-3 size-4 text-muted-foreground pointer-events-none" />
        {isFetching && (
          <svg
            className="absolute right-3 size-4 text-muted-foreground"
            style={{ animation: 'spin 1s linear infinite' }}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.trim().length === 0) {
              setOpen(false);
            }
          }}
          onFocus={() => {
            if (query.trim().length > 0 && (enableTextSearch || (profiles && profiles.length > 0))) {
              setOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={cn(
            'pl-10 pr-10 rounded-full bg-secondary border-0 focus-visible:ring-0 focus-visible:ring-offset-0',
            inputClassName,
          )}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-autocomplete="list"
        />
      </div>

      {/* Dropdown results — only when text search is not enabled */}
      {!enableTextSearch && open && (navItemCount > 0 || hasIdentifier || hasCountry || hasWikipedia || hasArchive || (profiles && profiles.length > 0)) && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-xl border border-border bg-popover shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150"
        >
          <div className="max-h-[320px] overflow-y-auto py-1">
            {navItems.map((item, index) => (
              <NavItem
                key={item.id}
                item={item}
                isSelected={index + navItemStartIndex === selectedIndex}
                onClick={handleSelectNavItem}
              />
            ))}
            {hasIdentifier && (
              <IdentifierItem
                match={identifierMatch!}
                isSelected={selectedIndex === identifierIndex}
                onNavigate={handleSelectIdentifier}
              />
            )}
            {hasCountry && countryAtTop && (
              <CountryItem
                country={countryMatch!.country}
                isSelected={selectedIndex === countryIndex}
                onClick={handleSelectCountry}
              />
            )}
            {profiles && profiles.map((profile, index) => (
              <ProfileItem
                key={profile.pubkey}
                profile={profile}
                isSelected={index + profileStartIndex === selectedIndex}
                isFollowed={followedPubkeys.has(profile.pubkey)}
                onClick={handleSelect}
              />
            ))}
            {hasCountry && !countryAtTop && (
              <CountryItem
                country={countryMatch!.country}
                isSelected={selectedIndex === countryIndex}
                onClick={handleSelectCountry}
              />
            )}
            {hasWikipedia && (
              <WikipediaItem
                result={wikipediaResult!}
                isSelected={selectedIndex === wikipediaIndex}
                onClick={handleSelectWikipedia}
              />
            )}
            {hasArchive && (
              <ArchiveItem
                result={archiveResult!}
                isSelected={selectedIndex === archiveIndex}
                onClick={handleSelectArchive}
              />
            )}
          </div>
        </div>
      )}

      {/* Text search option */}
      {enableTextSearch && open && query.trim().length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-xl border border-border bg-popover shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150">
          <div ref={listRef} className="max-h-[320px] overflow-y-auto py-1">
            {/* Search text option */}
            <button
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer',
                (totalItems === 0 || selectedIndex === -1) ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
              )}
              onClick={handleTextSearch}
              onMouseDown={(e) => e.preventDefault()}
            >
              <div className="size-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                <Search className="size-4 text-primary" />
              </div>
              <span className="text-sm font-medium truncate">
                Search for "{query.trim()}"
              </span>
            </button>

            {/* Nav item results — sidebar pages matching query */}
            {navItems.map((item, index) => (
              <NavItem
                key={item.id}
                item={item}
                isSelected={index + navItemStartIndex === selectedIndex}
                onClick={handleSelectNavItem}
              />
            ))}

            {/* Identifier suggestion — NIP-05, NIP-19, hex */}
            {hasIdentifier && (
              <IdentifierItem
                match={identifierMatch!}
                isSelected={selectedIndex === identifierIndex}
                onNavigate={handleSelectIdentifier}
              />
            )}

            {/* Comment on URL option — shown when query is a full URL */}
            {hasUrlComment && (
              <CommentOnUrlItem
                url={query.trim()}
                isSelected={selectedIndex === urlCommentIndex}
                onClick={handleCommentOnUrl}
              />
            )}

            {/* Country result (top — exact match only) */}
            {hasCountry && countryAtTop && (
              <CountryItem
                country={countryMatch!.country}
                isSelected={selectedIndex === countryIndex}
                onClick={handleSelectCountry}
              />
            )}

            {/* Profile results */}
            {profiles && profiles.length > 0 && profiles.map((profile, index) => (
              <ProfileItem
                key={profile.pubkey}
                profile={profile}
                isSelected={index + profileStartIndex === selectedIndex}
                isFollowed={followedPubkeys.has(profile.pubkey)}
                onClick={handleSelect}
              />
            ))}

            {/* Country result (bottom — prefix match with profiles present) */}
            {hasCountry && !countryAtTop && (
              <CountryItem
                country={countryMatch!.country}
                isSelected={selectedIndex === countryIndex}
                onClick={handleSelectCountry}
              />
            )}

            {/* Wikipedia result — always after profiles */}
            {hasWikipedia && (
              <WikipediaItem
                result={wikipediaResult!}
                isSelected={selectedIndex === wikipediaIndex}
                onClick={handleSelectWikipedia}
              />
            )}

            {/* Archive result — always after profiles */}
            {hasArchive && (
              <ArchiveItem
                result={archiveResult!}
                isSelected={selectedIndex === archiveIndex}
                onClick={handleSelectArchive}
              />
            )}
          </div>
        </div>
      )}

      {/* Empty state — only when text search is not enabled */}
      {!enableTextSearch && open && query.trim().length > 0 && !isFetching && !hasIdentifier && !hasCountry && !hasWikipedia && !hasArchive && navItemCount === 0 && profiles && profiles.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-xl border border-border bg-popover shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150">
          <div className="py-6 text-center text-sm text-muted-foreground">
            No profiles found
          </div>
        </div>
      )}
    </div>
  );
}

function NavItem({
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
        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={() => onClick(item)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="size-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
        <Icon className="size-4 text-primary" />
      </div>
      <span className="font-semibold text-sm truncate">{item.label}</span>
    </button>
  );
}

/**
 * Autocomplete item for a detected Nostr identifier (NIP-05, NIP-19, hex).
 * Resolves the identifier in the background and renders a profile or event preview.
 */
function IdentifierItem({
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
      return <Nip05IdentifierItem identifier={match.identifier} isSelected={isSelected} onNavigate={onNavigate} />;
    case 'npub':
    case 'nprofile':
      return <PubkeyIdentifierItem pubkey={match.pubkey} raw={match.raw} isSelected={isSelected} onNavigate={onNavigate} />;
    case 'note':
      return <EventIdentifierItem eventId={match.eventId} raw={match.raw} isSelected={isSelected} onNavigate={onNavigate} />;
    case 'nevent':
      return <EventIdentifierItem eventId={match.eventId} relays={match.relays} authorHint={match.authorHint} raw={match.raw} isSelected={isSelected} onNavigate={onNavigate} />;
    case 'naddr':
      return <AddrIdentifierItem addr={match.addr} relays={match.relays} raw={match.raw} isSelected={isSelected} onNavigate={onNavigate} />;
    case 'hex':
      return <HexIdentifierItem hex={match.hex} isSelected={isSelected} onNavigate={onNavigate} />;
  }
}

function Nip05IdentifierItem({
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
        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
        isSelected ? 'bg-accent text-accent-foreground' : '',
      )}>
        <div className="size-10 shrink-0 rounded-full bg-secondary animate-pulse" />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="h-4 w-24 bg-secondary animate-pulse rounded" />
          <div className="h-3 w-32 bg-secondary animate-pulse rounded" />
        </div>
      </div>
    );
  }

  if (!pubkey) return null; // NIP-05 didn't resolve — don't show

  return (
    <button
      data-search-item
      role="option"
      aria-selected={isSelected}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={() => onNavigate(`/${identifier}`)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <Avatar shape={getAvatarShape(metadata)} className="size-10 shrink-0">
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

function PubkeyIdentifierItem({
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
        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={() => onNavigate(`/${raw}`)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <Avatar shape={getAvatarShape(metadata)} className="size-10 shrink-0">
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

function EventIdentifierItem({
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
        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={() => onNavigate(`/${raw}`)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="size-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
        <FileText className="size-4 text-primary" />
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

function AddrIdentifierItem({
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

  // Try to get a title from tags
  const title = event?.tags.find(([t]) => t === 'title')?.[1];

  return (
    <button
      data-search-item
      role="option"
      aria-selected={isSelected}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={() => onNavigate(`/${raw}`)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="size-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
        <FileText className="size-4 text-primary" />
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

function HexIdentifierItem({
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
        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={() => onNavigate(`/${hex}`)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="size-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
        <Hash className="size-4 text-primary" />
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

function CountryItem({
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
      data-search-item
      role="option"
      aria-selected={isSelected}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={() => onClick(country)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="size-10 shrink-0 rounded-full bg-secondary flex items-center justify-center">
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

function CommentOnUrlItem({
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
      data-search-item
      role="option"
      aria-selected={isSelected}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="size-10 shrink-0 rounded-lg overflow-hidden bg-primary/10 flex items-center justify-center">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            className="size-10 object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
            }}
          />
        ) : null}
        <div
          className={cn('items-center justify-center size-10', thumbnailUrl ? 'hidden' : 'flex')}
        >
          <ExternalFavicon url={url} size={18} fallback={<MessageSquare className="size-4 text-primary" />} />
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

function ProfileItem({
  profile,
  isSelected,
  isFollowed,
  onClick,
}: {
  profile: SearchProfile;
  isSelected: boolean;
  isFollowed: boolean;
  onClick: (profile: SearchProfile, profileUrl: string) => void;
}) {
  const { metadata, pubkey } = profile;
  const displayName = metadata.display_name || metadata.name || genUserName(pubkey);
  const nip05 = metadata.nip05;
  const { data: nip05Verified } = useNip05Verify(nip05, pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);

  // Format nip05 for display — strip leading underscore prefix; only show when verified
  const nip05Display = nip05Verified && nip05 ? (nip05.startsWith('_@') ? nip05.slice(2) : nip05) : undefined;

  // Show NIP-05 if verified, otherwise show npub
  const identifier = nip05Display || nip19.npubEncode(pubkey);

  return (
    <button
      data-search-item
      role="option"
      aria-selected={isSelected}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={() => onClick(profile, profileUrl)}
      onMouseDown={(e) => e.preventDefault()} // Prevent input blur
    >
      <div className="relative shrink-0">
        <Avatar shape={getAvatarShape(metadata)} className="size-10">
          <AvatarImage src={metadata.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-sm">
            {displayName[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        {isFollowed && (
          <span
            className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-primary flex items-center justify-center ring-2 ring-popover"
            title="Following"
          >
            <UserRoundCheck className="size-2.5 text-primary-foreground" strokeWidth={3} />
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-sm truncate">
            <EmojifiedText tags={profile.event.tags}>{displayName}</EmojifiedText>
          </span>
          {metadata.bot && (
            <span className="text-xs text-primary" title="Bot account">🤖</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {nip05Display ? (
            <span className="truncate">{identifier}</span>
          ) : (
            <span className="truncate font-mono text-[11px]">{identifier}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function WikipediaItem({
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
        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={() => onClick(result)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="size-10 shrink-0 rounded-full bg-secondary flex items-center justify-center">
        {result.thumbnail ? (
          <img
            src={result.thumbnail}
            alt=""
            className="size-10 rounded-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
            }}
          />
        ) : null}
        <div className={cn('items-center justify-center size-10', result.thumbnail ? 'hidden' : 'flex')}>
          <WikipediaIcon className="size-4 text-muted-foreground" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-sm truncate block">{result.title}</span>
        <div className="text-xs text-muted-foreground truncate">Wikipedia</div>
      </div>
    </button>
  );
}

function ArchiveItem({
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
        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={() => onClick(result)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="size-10 shrink-0 rounded-full bg-secondary flex items-center justify-center overflow-hidden">
        <img
          src={thumbnail}
          alt=""
          className="size-10 rounded-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
          }}
        />
        <div className="hidden items-center justify-center size-10">
          <Archive className="size-4 text-muted-foreground" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-sm truncate block">{result.title}</span>
        <div className="text-xs text-muted-foreground truncate">Internet Archive</div>
      </div>
    </button>
  );
}
