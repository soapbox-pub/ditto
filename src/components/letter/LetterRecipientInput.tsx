import { useState, useRef, useEffect } from 'react';
import { nip19 } from 'nostr-tools';
import { Loader2, X } from 'lucide-react';
import { useSearchProfiles, type SearchProfile } from '@/hooks/useSearchProfiles';
import { useFollowList } from '@/hooks/useFollowActions';
import { genUserName } from '@/lib/genUserName';

const MAX_RESULTS = 5;

interface LetterRecipientInputProps {
  /** Called when a profile is selected or a valid npub/hex is pasted */
  onSelect: (pubkey: string) => void;
  /** Pre-fill with a known npub (shows it as the initial value) */
  initialNpub?: string;
  /** When true, only show friends (followed users) in suggestions and search results */
  friendsOnly?: boolean;
  className?: string;
}

export function LetterRecipientInput({ onSelect, initialNpub, friendsOnly = false, className = '' }: LetterRecipientInputProps) {
  const [query, setQuery] = useState(initialNpub ?? '');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<SearchProfile | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasFocused = useRef(false);

  const { data: searchResults, isLoading } = useSearchProfiles(selected ? '' : query);
  const followListData = useFollowList();
  const followedPubkeys = new Set(followListData.data?.pubkeys ?? []);

  const profiles = (() => {
    const all = searchResults ?? [];
    const results = friendsOnly
      ? all.filter((p) => followedPubkeys.has(p.pubkey))
      : all;
    const followed = results.filter((p) => followedPubkeys.has(p.pubkey));
    const others = results.filter((p) => !followedPubkeys.has(p.pubkey));
    return [...followed, ...others].slice(0, MAX_RESULTS);
  })();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Show dropdown when there are results
  useEffect(() => {
    if (!hasFocused.current) return;
    if (profiles.length > 0 && !selected) setOpen(true);
    else if (profiles.length === 0 && query.trim()) setOpen(false);
  }, [profiles, selected, query]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    setSelected(null);

    if (val.startsWith('npub1')) {
      try {
        const decoded = nip19.decode(val);
        if (decoded.type === 'npub') {
          onSelect(decoded.data);
          return;
        }
      } catch { /* not valid yet */ }
    }
    if (/^[0-9a-f]{64}$/i.test(val)) {
      onSelect(val);
    }
  }

  function handleSelect(profile: SearchProfile) {
    const name = profile.metadata.display_name || profile.metadata.name || genUserName(profile.pubkey);
    setQuery(name);
    setSelected(profile);
    setOpen(false);
    onSelect(profile.pubkey);
    inputRef.current?.blur();
  }

  function handleClear() {
    setQuery('');
    setSelected(null);
    setOpen(false);
    inputRef.current?.focus();
  }

  const displayName = selected
    ? (selected.metadata.display_name || selected.metadata.name || genUserName(selected.pubkey))
    : null;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-muted/60 focus-within:ring-2 focus-within:ring-primary/20">
        {selected && (
          selected.metadata.picture
            ? <img src={selected.metadata.picture} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
            : <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                {(displayName ?? '?').charAt(0).toUpperCase()}
              </div>
        )}

        <input
          ref={inputRef}
          value={query}
          onChange={handleChange}
          onFocus={() => { hasFocused.current = true; if (profiles.length > 0 && !selected) setOpen(true); }}
          placeholder="who is this for?"
          className="flex-1 bg-transparent border-none text-xl placeholder:text-muted-foreground/50 focus:outline-none min-w-0"
        />

        {isLoading && <Loader2 className="w-3.5 h-3.5 text-muted-foreground/40 animate-spin shrink-0" />}

        {selected && (
          <button
            onClick={handleClear}
            className="text-muted-foreground hover:text-foreground shrink-0 transition-colors p-1"
          >
            <X className="w-4 h-4" strokeWidth={3} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && profiles.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
          {profiles.map((profile) => {
            const name = profile.metadata.display_name || profile.metadata.name || genUserName(profile.pubkey);
            const sub = profile.metadata.nip05 || nip19.npubEncode(profile.pubkey).slice(0, 20) + '...';
            return (
              <button
                key={profile.pubkey}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(profile); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/60 transition-colors text-left"
              >
                <div className="relative shrink-0">
                  {profile.metadata.picture
                    ? <img src={profile.metadata.picture} alt="" className="w-11 h-11 rounded-full object-cover" />
                    : <div className="w-11 h-11 rounded-full bg-primary/15 flex items-center justify-center text-sm font-bold text-primary">
                        {name.charAt(0).toUpperCase()}
                      </div>
                  }
                  {followedPubkeys.has(profile.pubkey) && (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-green-400 border-2 border-card"
                      title="You follow this person"
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-semibold truncate">{name}</p>
                  <p className="text-sm text-muted-foreground truncate font-mono">{sub}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
