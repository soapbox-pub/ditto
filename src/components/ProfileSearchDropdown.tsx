import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, UserRoundCheck } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { EmojifiedText } from '@/components/CustomEmoji';
import { useSearchProfiles, type SearchProfile } from '@/hooks/useSearchProfiles';
import { genUserName } from '@/lib/genUserName';
import { useNip05Verify } from '@/hooks/useNip05Verify';
import { getNostrIdentifierPath } from '@/lib/nostrIdentifier';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { getProfileUrl } from '@/lib/profileUrl';
import { searchCountry, type CountryEntry } from '@/lib/countries';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface ProfileSearchDropdownProps {
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  onSelect?: (profile: SearchProfile) => void;
  /** When true, pressing Enter without a profile selected navigates to the search page */
  enableTextSearch?: boolean;
}

export function ProfileSearchDropdown({
  placeholder = 'Search people...',
  className,
  inputClassName,
  autoFocus,
  onSelect,
  enableTextSearch,
}: ProfileSearchDropdownProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: profiles, isFetching, followedPubkeys } = useSearchProfiles(query);

  // Country suggestion (local, synchronous)
  const countryMatch = useMemo(() => searchCountry(query), [query]);
  const profileCount = profiles?.length ?? 0;
  // Show country at top only for exact matches; otherwise at bottom (after profiles)
  const countryAtTop = !!countryMatch && (countryMatch.exact || profileCount === 0);

  // Show dropdown when we have results, or when text search is enabled and there's a query
  useEffect(() => {
    if (query.trim().length > 0) {
      if (enableTextSearch || (profiles && profiles.length > 0) || countryMatch) {
        setOpen(true);
      }
    }
  }, [profiles, query, enableTextSearch, countryMatch]);

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

    // If the input is a Nostr identifier (NIP-19 or NIP-05), navigate directly
    const identifierPath = getNostrIdentifierPath(query);
    if (identifierPath) {
      navigate(identifierPath);
      return;
    }

    if (!enableTextSearch) return;
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  }, [enableTextSearch, query, navigate]);

  // Total selectable items: profiles + optional country
  const hasCountry = !!countryMatch;
  const totalItems = profileCount + (hasCountry ? 1 : 0);

  // Map selectedIndex to what it refers to.
  // When countryAtTop: [country, ...profiles]
  // When country at bottom: [...profiles, country]
  const countryIndex = countryAtTop ? 0 : profileCount;
  const profileStartIndex = countryAtTop && hasCountry ? 1 : 0;

  const handleSelectCountry = useCallback((country: CountryEntry) => {
    setOpen(false);
    setQuery('');
    navigate(`/i/iso3166:${country.code}`);
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
        if (hasCountry && selectedIndex === countryIndex) {
          handleSelectCountry(countryMatch!.country);
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
      {!enableTextSearch && open && (hasCountry || (profiles && profiles.length > 0)) && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-xl border border-border bg-popover shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150"
        >
          <div className="max-h-[320px] overflow-y-auto py-1">
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
          </div>
        </div>
      )}

      {/* Empty state — only when text search is not enabled */}
      {!enableTextSearch && open && query.trim().length > 0 && !isFetching && !hasCountry && profiles && profiles.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-xl border border-border bg-popover shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150">
          <div className="py-6 text-center text-sm text-muted-foreground">
            No profiles found
          </div>
        </div>
      )}
    </div>
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
        <Avatar className="size-10">
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
