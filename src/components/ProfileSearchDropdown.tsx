import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useSearchProfiles, type SearchProfile } from '@/hooks/useSearchProfiles';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';

interface ProfileSearchDropdownProps {
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  onSelect?: (profile: SearchProfile) => void;
}

export function ProfileSearchDropdown({
  placeholder = 'Search people...',
  className,
  inputClassName,
  autoFocus,
  onSelect,
}: ProfileSearchDropdownProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: profiles, isFetching } = useSearchProfiles(query);

  // Show dropdown when we have results
  useEffect(() => {
    if (profiles && profiles.length > 0 && query.trim().length > 0) {
      setOpen(true);
    }
  }, [profiles, query]);

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

  const handleSelect = useCallback((profile: SearchProfile) => {
    setOpen(false);
    setQuery('');
    if (onSelect) {
      onSelect(profile);
    } else {
      const npub = nip19.npubEncode(profile.pubkey);
      navigate(`/${npub}`);
    }
  }, [navigate, onSelect]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || !profiles || profiles.length === 0) {
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev < profiles.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : profiles.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < profiles.length) {
          handleSelect(profiles[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        inputRef.current?.blur();
        break;
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-profile-item]');
      items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        {isFetching && (
          <svg
            className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
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
            if (profiles && profiles.length > 0 && query.trim().length > 0) {
              setOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={cn(
            'pl-10 pr-10 rounded-full bg-secondary border-0 focus-visible:ring-1 focus-visible:ring-primary',
            inputClassName,
          )}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-autocomplete="list"
        />
      </div>

      {/* Dropdown results */}
      {open && profiles && profiles.length > 0 && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-xl border border-border bg-popover shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150"
        >
          <div className="max-h-[320px] overflow-y-auto py-1">
            {profiles.map((profile, index) => (
              <ProfileItem
                key={profile.pubkey}
                profile={profile}
                isSelected={index === selectedIndex}
                onClick={() => handleSelect(profile)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {open && query.trim().length > 0 && !isFetching && profiles && profiles.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-xl border border-border bg-popover shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150">
          <div className="py-6 text-center text-sm text-muted-foreground">
            No profiles found
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileItem({
  profile,
  isSelected,
  onClick,
}: {
  profile: SearchProfile;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { metadata, pubkey } = profile;
  const displayName = metadata.display_name || metadata.name || genUserName(pubkey);
  const username = metadata.name;
  const nip05 = metadata.nip05;

  // Format nip05 for display — strip leading underscore prefix
  const nip05Display = nip05?.startsWith('_@') ? nip05.slice(2) : nip05;

  return (
    <button
      data-profile-item
      role="option"
      aria-selected={isSelected}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()} // Prevent input blur
    >
      <Avatar className="size-10 shrink-0">
        <AvatarImage src={metadata.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-sm">
          {displayName[0]?.toUpperCase() || '?'}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-sm truncate">{displayName}</span>
          {metadata.bot && (
            <span className="text-xs text-primary" title="Bot account">🤖</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {username && (
            <span className="truncate">@{username}</span>
          )}
          {nip05Display && nip05Display !== username && (
            <>
              {username && <span>·</span>}
              <span className="truncate">{nip05Display}</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}
