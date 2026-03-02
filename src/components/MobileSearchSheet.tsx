import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, UserRoundCheck, X } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { EmojifiedText } from '@/components/CustomEmoji';
import { useSearchProfiles, type SearchProfile } from '@/hooks/useSearchProfiles';
import { genUserName } from '@/lib/genUserName';
import { useNip05Verify } from '@/hooks/useNip05Verify';
import { getNostrIdentifierPath } from '@/lib/nostrIdentifier';
import { getProfileUrl } from '@/lib/profileUrl';
import { searchCountry, type CountryEntry } from '@/lib/countries';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface MobileSearchSheetProps {
  open: boolean;
  onClose: () => void;
}

export function MobileSearchSheet({ open, onClose }: MobileSearchSheetProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: profiles, isFetching, followedPubkeys } = useSearchProfiles(query);

  // Country suggestion (local, synchronous)
  const countryMatch = useMemo(() => searchCountry(query), [query]);
  const profileCount = profiles?.length ?? 0;
  const hasCountry = !!countryMatch;
  // Show country at top only for exact matches; otherwise at bottom (after profiles)
  const countryAtTop = hasCountry && (countryMatch.exact || profileCount === 0);
  const totalItems = profileCount + (hasCountry ? 1 : 0);
  const countryIndex = countryAtTop ? 0 : profileCount;
  const profileStartIndex = countryAtTop && hasCountry ? 1 : 0;

  // Focus input when opened
  useEffect(() => {
    if (open) {
      // Small delay to let the animation settle and keyboard to appear
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    } else {
      setQuery('');
      setSelectedIndex(-1);
    }
  }, [open]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [profiles]);

  const handleClose = useCallback(() => {
    setQuery('');
    onClose();
  }, [onClose]);

  const handleSelectCountry = useCallback((country: CountryEntry) => {
    handleClose();
    navigate(`/i/iso3166:${country.code}`);
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

    const identifierPath = getNostrIdentifierPath(query);
    if (identifierPath) {
      handleClose();
      navigate(identifierPath);
      return;
    }

    handleClose();
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
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
        if (hasCountry && selectedIndex === countryIndex) {
          handleSelectCountry(countryMatch!.country);
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

  const hasResults = query.trim().length > 0 && (hasCountry || (profiles && profiles.length > 0));

  if (!open) return null;

  return (
    <>
      {/* Backdrop — doesn't cover the bottom nav (z-30) */}
      <div
        className="fixed inset-0 z-40 bg-black/60 sidebar:hidden animate-in fade-in-0 duration-150"
        onClick={handleClose}
      />

      {/* Bottom sheet — sits above the bottom nav bar */}
      <div className="fixed left-0 right-0 z-50 sidebar:hidden animate-in slide-in-from-bottom-4 duration-200"
        style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Results list — reversed so closest to input = most relevant */}
        {hasResults && (
          <div className="flex flex-col-reverse bg-popover/95 rounded-2xl mx-6 mb-0.5 overflow-hidden max-h-[55vh] overflow-y-auto shadow-lg">
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
          </div>
        )}

        {/* Input bar */}
        <div className="flex items-center px-6 py-3">
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
          </div>
        </div>
      </div>
    </>
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
        <Avatar className="size-9">
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
