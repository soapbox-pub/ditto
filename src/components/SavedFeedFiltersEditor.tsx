/**
 * SavedFeedFiltersEditor
 *
 * A controlled component that renders the full set of search/feed filter
 * controls (query, author scope, sort, media, platform, language, kind).
 * Used both on the Search page filter popover and in the Settings > Feed
 * saved-feed edit panel.
 */
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Globe, Users, UserSearch,
  Clock, Flame, TrendingUp,
  ChevronDown, ChevronUp,
  Hash, Search as SearchIcon,
  X, Check, Info, User,
} from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ProfileSearchDropdown } from '@/components/ProfileSearchDropdown';
import { useAuthor } from '@/hooks/useAuthor';
import { EXTRA_KINDS } from '@/lib/extraKinds';
import { CONTENT_KIND_ICONS } from '@/lib/sidebarItems';
import { cn } from '@/lib/utils';
import type { SavedFeedFilters } from '@/contexts/AppContext';
import type { SearchProfile } from '@/hooks/useSearchProfiles';

// ─── Types ───────────────────────────────────────────────────────────────────

type KindOption = {
  value: string;
  label: string;
  description: string;
  parentId: string;
  icon: React.ComponentType<{ className?: string }> | undefined;
};

// ─── Kind options (built once) ───────────────────────────────────────────────

export function buildKindOptions(): KindOption[] {
  const options: KindOption[] = [];
  for (const def of EXTRA_KINDS) {
    if (def.subKinds) {
      for (const sub of def.subKinds) {
        options.push({
          value: String(sub.kind),
          label: `${sub.label} (${sub.kind})`,
          description: sub.description,
          parentId: def.id,
          icon: CONTENT_KIND_ICONS[def.id],
        });
      }
    } else {
      options.push({
        value: String(def.kind),
        label: `${def.label} (${def.kind})`,
        description: def.description,
        parentId: def.id,
        icon: CONTENT_KIND_ICONS[def.id],
      });
    }
  }
  const seen = new Set<string>();
  return options.filter((o) => {
    if (seen.has(o.value)) return false;
    seen.add(o.value);
    return true;
  });
}

// ─── useScrollCarets ─────────────────────────────────────────────────────────

export function useScrollCarets() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 0);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }, []);

  const refCallback = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    roRef.current = ro;
    update();
  }, [update]);

  const stopScroll = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const startScroll = useCallback((direction: 'up' | 'down') => {
    stopScroll();
    intervalRef.current = setInterval(() => {
      const el = scrollRef.current;
      if (!el) return stopScroll();
      el.scrollBy({ top: direction === 'up' ? -8 : 8 });
      update();
      const atLimit = direction === 'up' ? el.scrollTop <= 0 : el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      if (atLimit) stopScroll();
    }, 16);
  }, [update, stopScroll]);

  useEffect(() => stopScroll, [stopScroll]);

  return { refCallback, canScrollUp, canScrollDown, onScroll: update, startScroll, stopScroll };
}

// ─── KindPicker ──────────────────────────────────────────────────────────────

export function KindScrollCaret({ direction, onMouseEnter, onMouseLeave }: {
  direction: 'up' | 'down';
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  return (
    <button
      className="flex cursor-default items-center justify-center py-0.5 w-full shrink-0 text-muted-foreground hover:text-foreground"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {direction === 'up' ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
    </button>
  );
}

export function KindPickerItem({ icon: Icon, label, active, onClick }: {
  icon: React.ComponentType<{ className?: string }> | null;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-2.5 py-1.5 text-xs transition-colors text-left',
        active ? 'bg-primary/10 text-primary' : 'hover:bg-secondary/60 text-foreground',
      )}
    >
      {Icon
        ? <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        : <span className="size-3.5 shrink-0" />}
      <span className="truncate">{label}</span>
      {active && <Check className="size-3 shrink-0 ml-auto text-primary" />}
    </button>
  );
}

export function KindPicker({ value, options, onChange }: {
  value: string;
  options: KindOption[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { refCallback, canScrollUp, canScrollDown, onScroll, startScroll, stopScroll } = useScrollCarets();

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.description.toLowerCase().includes(q) || o.value.includes(q),
    );
  }, [options, search]);

  const selected = value === 'all' || value === 'custom' ? null : options.find((o) => o.value === value);
  const SelectedIcon = selected?.icon;

  const handleSelect = (v: string) => { onChange(v); setOpen(false); setSearch(''); };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(''); }}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'w-full h-8 px-2.5 rounded-md border bg-secondary/50 text-xs flex items-center gap-1.5 text-left transition-colors hover:bg-secondary border-border',
            open && 'border-ring ring-1 ring-ring',
          )}
        >
          {SelectedIcon
            ? <SelectedIcon className="size-3.5 shrink-0 text-muted-foreground" />
            : <Hash className="size-3.5 shrink-0 text-muted-foreground" />}
          <span className="flex-1 truncate">
            {value === 'all' ? 'All' : value === 'custom' ? 'Custom…' : (selected?.label ?? value)}
          </span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-56 p-0 flex flex-col overflow-hidden"
        style={{ maxHeight: 'min(280px, var(--radix-popover-content-available-height, 280px))' }}
      >
        <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-border shrink-0">
          <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
            placeholder="Search kinds…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
              <X className="size-3" />
            </button>
          )}
        </div>
        {canScrollUp && <KindScrollCaret direction="up" onMouseEnter={() => startScroll('up')} onMouseLeave={stopScroll} />}
        <div ref={refCallback} className="overflow-y-auto flex-1 min-h-0" onScroll={onScroll}>
          {!search && <KindPickerItem icon={null} label="All kinds" active={value === 'all'} onClick={() => handleSelect('all')} />}
          {filtered.map((opt) => (
            <KindPickerItem key={opt.value} icon={opt.icon ?? null} label={opt.label} active={value === opt.value} onClick={() => handleSelect(opt.value)} />
          ))}
          {(!search || 'custom'.includes(search.toLowerCase())) && (
            <KindPickerItem icon={Hash} label="Custom kind…" active={value === 'custom'} onClick={() => handleSelect('custom')} />
          )}
          {filtered.length === 0 && search && (
            <p className="text-xs text-muted-foreground text-center py-4">No kinds match</p>
          )}
        </div>
        {canScrollDown && <KindScrollCaret direction="down" onMouseEnter={() => startScroll('down')} onMouseLeave={stopScroll} />}
      </PopoverContent>
    </Popover>
  );
}

// ─── AuthorChip ───────────────────────────────────────────────────────────────

export function AuthorChip({ pubkey, onRemove }: { pubkey: string; onRemove: () => void }) {
  const hexPubkey = useMemo(() => {
    if (/^[0-9a-f]{64}$/i.test(pubkey)) return pubkey;
    try { const d = nip19.decode(pubkey); return d.type === 'npub' ? d.data : pubkey; } catch { return pubkey; }
  }, [pubkey]);
  const author = useAuthor(hexPubkey);
  const name = author.data?.metadata?.display_name || author.data?.metadata?.name || pubkey.slice(0, 10) + '…';
  const picture = author.data?.metadata?.picture;
  return (
    <span className="inline-flex items-center gap-1.5 pl-1.5 pr-1 py-0.5 rounded-full bg-secondary border border-border text-xs max-w-[160px]">
      {picture
        ? <img src={picture} alt="" className="size-4 rounded-full shrink-0 object-cover" />
        : <User className="size-3 shrink-0 text-muted-foreground" />}
      <span className="truncate">{name}</span>
      <button onClick={onRemove} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors" aria-label="Remove">
        <X className="size-3" />
      </button>
    </span>
  );
}

// ─── AuthorFilterDropdown ─────────────────────────────────────────────────────

export function AuthorFilterDropdown({ onCommit }: { onCommit: (pubkey: string, _label: string) => void }) {
  const handleSelect = useCallback((profile: SearchProfile) => {
    const npub = nip19.npubEncode(profile.pubkey);
    const label = profile.metadata.display_name || profile.metadata.name || npub.slice(0, 16) + '…';
    onCommit(npub, label);
  }, [onCommit]);

  return (
    <ProfileSearchDropdown
      placeholder="Search by name or npub…"
      onSelect={handleSelect}
      hideCountry
      inputClassName="rounded-lg bg-secondary/50 border border-border focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 text-sm h-9"
      className="w-full"
    />
  );
}

// ─── SavedFeedFiltersEditor ───────────────────────────────────────────────────

interface SavedFeedFiltersEditorProps {
  /** Current filter values */
  value: SavedFeedFilters;
  /** Called on every field change with a partial update merged into value */
  onChange: (patch: Partial<SavedFeedFilters>) => void;
  /** When true, the query input is shown at the top (default: true) */
  showQuery?: boolean;
  /** Hide the From / author scope section (e.g. profile tabs where author is implicit) */
  hideFrom?: boolean;
  /** Hide the Sort section */
  hideSort?: boolean;
  /** Optional: pre-built kind options (pass to avoid rebuilding) */
  kindOptions?: KindOption[];
}

export function SavedFeedFiltersEditor({
  value,
  onChange,
  showQuery = true,
  hideFrom = false,
  hideSort = false,
  kindOptions: kindOptionsProp,
}: SavedFeedFiltersEditorProps) {
  const kindOptions = useMemo(() => kindOptionsProp ?? buildKindOptions(), [kindOptionsProp]);

  const { authorScope, authorPubkeys, sort, mediaType, platform, language, kindFilter, customKindText, query } = value;

  const hasKindMediaConflict = kindFilter !== 'all' && kindFilter !== 'custom' && mediaType !== 'all';

  const addAuthor = useCallback((pubkey: string, _label: string) => {
    const next = authorPubkeys.includes(pubkey) ? authorPubkeys : [...authorPubkeys, pubkey];
    onChange({ authorPubkeys: next, authorScope: 'people' });
  }, [authorPubkeys, onChange]);

  const removeAuthor = useCallback((pubkey: string) => {
    const next = authorPubkeys.filter((p) => p !== pubkey);
    onChange({ authorPubkeys: next, authorScope: next.length > 0 ? 'people' : 'anyone' });
  }, [authorPubkeys, onChange]);

  const setAuthorScope = useCallback((scope: SavedFeedFilters['authorScope']) => {
    onChange({ authorScope: scope, ...(scope !== 'people' ? { authorPubkeys: [] } : {}) });
  }, [onChange]);

  return (
    <div className="space-y-3">
      {/* Query */}
      {showQuery && (
        <>
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Search query</span>
            <Input
              value={query}
              onChange={(e) => onChange({ query: e.target.value })}
              placeholder="e.g. bitcoin"
              className="bg-secondary/50 border-border focus-visible:ring-1 h-8 text-sm"
            />
          </div>
          <Separator />
        </>
      )}

      {/* Author scope */}
      {!hideFrom && (
        <>
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">From</span>
            <div className="flex rounded-lg border border-border overflow-hidden">
              {([
                ['anyone', 'Anyone', Globe],
                ['follows', 'Follows', Users],
                ['people', 'People', UserSearch],
              ] as const).map(([scope, label, Icon]) => (
                <button
                  key={scope}
                  onClick={() => setAuthorScope(scope)}
                  className={cn(
                    'flex-1 py-1.5 flex items-center justify-center gap-1 text-xs font-medium transition-colors',
                    authorScope === scope
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  {label}
                </button>
              ))}
            </div>
            {authorScope === 'people' && (
              <div className="space-y-1.5">
                {authorPubkeys.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {authorPubkeys.map((pk) => (
                      <AuthorChip key={pk} pubkey={pk} onRemove={() => removeAuthor(pk)} />
                    ))}
                  </div>
                )}
                <AuthorFilterDropdown onCommit={addAuthor} />
              </div>
            )}
          </div>
          <Separator />
        </>
      )}

      {/* Sort */}
      {!hideSort && (
        <>
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sort</span>
            <div className="flex rounded-lg border border-border overflow-hidden">
              {([
                ['recent', 'Recent', Clock],
                ['hot', 'Hot', Flame],
                ['trending', 'Trending', TrendingUp],
              ] as const).map(([s, label, Icon]) => (
                <button
                  key={s}
                  onClick={() => onChange({ sort: s })}
                  className={cn(
                    'flex-1 py-1.5 flex items-center justify-center gap-1 text-xs font-medium transition-colors',
                    sort === s
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Separator />
        </>
      )}

      {/* Media + Platform */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Media</span>
          <Select value={mediaType} onValueChange={(v) => onChange({ mediaType: v as SavedFeedFilters['mediaType'] })}>
            <SelectTrigger className="w-full bg-secondary/50 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="images">Images</SelectItem>
              <SelectItem value="videos">Videos</SelectItem>
              <SelectItem value="vines">Shorts</SelectItem>
              <SelectItem value="none">No media</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Platform</span>
          <Select value={platform} onValueChange={(v) => onChange({ platform: v as SavedFeedFilters['platform'] })}>
            <SelectTrigger className="w-full bg-secondary/50 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nostr">Nostr</SelectItem>
              <SelectItem value="activitypub">Mastodon</SelectItem>
              <SelectItem value="atproto">Bluesky</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Language + Kind */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Language</span>
          <Select value={language} onValueChange={(v) => onChange({ language: v })}>
            <SelectTrigger className="w-full bg-secondary/50 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Global</SelectItem>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="es">Spanish</SelectItem>
              <SelectItem value="fr">French</SelectItem>
              <SelectItem value="de">German</SelectItem>
              <SelectItem value="ja">Japanese</SelectItem>
              <SelectItem value="zh">Chinese</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Kind</span>
          <KindPicker value={kindFilter} options={kindOptions} onChange={(v) => onChange({ kindFilter: v, ...(v !== 'custom' ? { customKindText: '' } : {}) })} />
        </div>
      </div>

      {kindFilter === 'custom' && (
        <Input
          type="text"
          inputMode="numeric"
          placeholder="e.g. 1, 30023"
          value={customKindText}
          onChange={(e) => onChange({ customKindText: e.target.value })}
          className="bg-secondary/50 border-border focus-visible:ring-1 rounded-lg text-xs h-8"
        />
      )}

      {hasKindMediaConflict && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
          <Info className="size-3.5 shrink-0 mt-0.5" />
          Media + Kind filters may conflict. Kind takes precedence.
        </p>
      )}

    </div>
  );
}
