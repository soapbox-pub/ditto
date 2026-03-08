/**
 * SavedFeedFiltersEditor
 *
 * A controlled component that renders filter controls for a standard
 * NIP-01 filter object (TabFilter). Used on the Search page filter
 * popover and in the Settings > Feed saved-feed edit panel.
 *
 * Edits the following filter fields:
 * - `kinds` (array of kind numbers)
 * - `authors` (array of pubkeys)
 * - `search` (NIP-50 search string)
 */
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Globe, UserSearch,
  ChevronDown, ChevronUp,
  Hash, Search as SearchIcon,
  X, Check, User,
} from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ProfileSearchDropdown } from '@/components/ProfileSearchDropdown';
import { useAuthor } from '@/hooks/useAuthor';
import { useUserLists, useMatchedListId } from '@/hooks/useUserLists';
import { useFollowPacks } from '@/hooks/useFollowPacks';
import { EXTRA_KINDS } from '@/lib/extraKinds';
import { CONTENT_KIND_ICONS } from '@/lib/sidebarItems';
import { cn } from '@/lib/utils';
import type { TabFilter } from '@/contexts/AppContext';
import type { SearchProfile } from '@/hooks/useSearchProfiles';
import type { UserList } from '@/hooks/useUserLists';
import type { FollowPack } from '@/hooks/useFollowPacks';

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
            {value === 'all' ? 'All' : value === 'custom' ? 'Custom...' : (selected?.label ?? value)}
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
            placeholder="Search kinds..."
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
            <KindPickerItem icon={Hash} label="Custom kind..." active={value === 'custom'} onClick={() => handleSelect('custom')} />
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

// ─── MultiKindPicker ─────────────────────────────────────────────────────────

export function MultiKindPicker({ selectedKinds, options, onChange }: {
  selectedKinds: string[];
  options: KindOption[];
  onChange: (kinds: string[]) => void;
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

  const isAllKinds = selectedKinds.length === 0;

  const toggleKind = (value: string) => {
    if (selectedKinds.includes(value)) {
      onChange(selectedKinds.filter((k) => k !== value));
    } else {
      onChange([...selectedKinds, value]);
    }
  };

  const selectAll = () => {
    onChange([]);
    setOpen(false);
    setSearch('');
  };

  const triggerLabel = useMemo(() => {
    if (isAllKinds) return 'All kinds';
    if (selectedKinds.length === 1) {
      const opt = options.find((o) => o.value === selectedKinds[0]);
      return opt?.label ?? `Kind ${selectedKinds[0]}`;
    }
    return `${selectedKinds.length} kinds selected`;
  }, [isAllKinds, selectedKinds, options]);

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(''); }}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              'w-full h-9 px-3 rounded-lg border bg-secondary/50 text-sm flex items-center gap-2 text-left transition-colors hover:bg-secondary border-border',
              open && 'border-ring ring-1 ring-ring',
            )}
          >
            <Hash className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">{triggerLabel}</span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          className="w-64 p-0 flex flex-col overflow-hidden"
          style={{ maxHeight: 'min(320px, var(--radix-popover-content-available-height, 320px))' }}
        >
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
            <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
              placeholder="Search kinds..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {canScrollUp && (
            <KindScrollCaret direction="up" onMouseEnter={() => startScroll('up')} onMouseLeave={stopScroll} />
          )}

          <div ref={refCallback} className="overflow-y-auto flex-1 min-h-0" onScroll={onScroll}>
            {!search && (
              <button
                onClick={selectAll}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left',
                  isAllKinds ? 'bg-primary/10 text-primary' : 'hover:bg-secondary/60 text-foreground',
                )}
              >
                <span className="size-4 shrink-0" />
                <span className="flex-1 truncate">All kinds</span>
                {isAllKinds && <Check className="size-3.5 shrink-0 ml-auto text-primary" />}
              </button>
            )}

            {filtered.map((opt) => {
              const isSelected = selectedKinds.includes(opt.value);
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  onClick={() => toggleKind(opt.value)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left',
                    isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-secondary/60 text-foreground',
                  )}
                >
                  <div className={cn(
                    'size-4 shrink-0 rounded border flex items-center justify-center transition-colors',
                    isSelected ? 'bg-primary border-primary' : 'border-border bg-background',
                  )}>
                    {isSelected && <Check className="size-3 text-primary-foreground" />}
                  </div>
                  {Icon
                    ? <Icon className="size-4 shrink-0 text-muted-foreground" />
                    : <span className="size-4 shrink-0" />}
                  <span className="flex-1 truncate">{opt.label}</span>
                </button>
              );
            })}

            {filtered.length === 0 && search && (
              <p className="text-sm text-muted-foreground text-center py-6">No kinds match</p>
            )}
          </div>

          {canScrollDown && (
            <KindScrollCaret direction="down" onMouseEnter={() => startScroll('down')} onMouseLeave={stopScroll} />
          )}

          {selectedKinds.length > 0 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-border shrink-0">
              <span className="text-xs text-muted-foreground">{selectedKinds.length} selected</span>
              <button
                onClick={() => { setOpen(false); setSearch(''); }}
                className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {selectedKinds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedKinds.map((kindValue) => {
            const opt = options.find((o) => o.value === kindValue);
            const Icon = opt?.icon;
            const label = opt ? opt.label : `Kind ${kindValue}`;
            return (
              <span
                key={kindValue}
                className="inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-full bg-secondary border border-border text-xs max-w-[180px]"
              >
                {Icon && <Icon className="size-3 shrink-0 text-muted-foreground" />}
                <span className="truncate">{label}</span>
                <button
                  onClick={() => toggleKind(kindValue)}
                  className="shrink-0 size-4 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary-foreground/10 transition-colors"
                  aria-label={`Remove ${label}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── ScopeToggle ─────────────────────────────────────────────────────────────

export interface ScopeOption<T extends string> {
  value: T;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** Generic segmented toggle for choosing an author scope. */
export function ScopeToggle<T extends string>({
  value,
  options,
  onChange,
  size = 'sm',
}: {
  value: T;
  options: ScopeOption<T>[];
  onChange: (scope: T) => void;
  /** 'sm' = xs text + py-1.5 (feed modal), 'md' = sm text + py-2 (profile modal) */
  size?: 'sm' | 'md';
}) {
  return (
    <div className="flex rounded-lg border border-border overflow-hidden">
      {options.map(({ value: scope, label, icon: Icon }) => (
        <button
          key={scope}
          onClick={() => onChange(scope)}
          className={cn(
            'flex-1 flex items-center justify-center font-medium transition-colors',
            size === 'sm' ? 'py-1.5 gap-1 text-xs' : 'py-2 gap-1.5 text-sm',
            value === scope
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground',
          )}
        >
          <Icon className="size-3.5 shrink-0" />
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── ListPackPicker ───────────────────────────────────────────────────────────

interface ListPackPickerProps {
  lists: UserList[];
  followPacks: FollowPack[];
  value: string;
  onSelectPubkeys: (pubkeys: string[]) => void;
  className?: string;
}

/**
 * A <Select> that lets the user pick a Follow Set or Follow Pack to populate
 * author pubkeys. Used in FeedEditModal, SavedFeedFiltersEditor, and SearchPage.
 */
export function ListPackPicker({ lists, followPacks, value, onSelectPubkeys, className }: ListPackPickerProps) {
  const hasAny = lists.length > 0 || followPacks.length > 0;
  if (!hasAny) return null;

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        let pubkeys: string[] = [];
        if (v.startsWith('set:')) {
          pubkeys = lists.find((l) => l.id === v.slice(4))?.pubkeys ?? [];
        } else if (v.startsWith('pack:')) {
          pubkeys = followPacks.find((p) => p.id === v.slice(5))?.pubkeys ?? [];
        }
        if (pubkeys.length > 0) onSelectPubkeys(pubkeys);
      }}
    >
      <SelectTrigger className={cn('w-full bg-secondary/50 h-8 text-xs', className)}>
        <SelectValue placeholder="Or choose a list..." />
      </SelectTrigger>
      <SelectContent>
        {lists.length > 0 && (
          <SelectGroup>
            {followPacks.length > 0 && <SelectLabel>Follow Sets</SelectLabel>}
            {lists.map((l) => (
              <SelectItem key={`set:${l.id}`} value={`set:${l.id}`}>
                {l.title} ({l.pubkeys.length})
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {followPacks.length > 0 && (
          <SelectGroup>
            {lists.length > 0 && <SelectLabel>Follow Packs</SelectLabel>}
            {followPacks.map((p) => (
              <SelectItem key={`pack:${p.id}`} value={`pack:${p.id}`}>
                {p.title} ({p.pubkeys.length})
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}

// ─── parseSelectedKinds ───────────────────────────────────────────────────────

/** Parse a TabFilter's kinds array into an array of string kind values. */
export function parseSelectedKinds(filter: TabFilter): string[] {
  const kinds = filter.kinds;
  if (!Array.isArray(kinds) || kinds.length === 0) return [];
  return kinds.map(String);
}

// ─── AuthorChip ───────────────────────────────────────────────────────────────

export function AuthorChip({ pubkey, onRemove }: { pubkey: string; onRemove: () => void }) {
  const hexPubkey = useMemo(() => {
    if (/^[0-9a-f]{64}$/i.test(pubkey)) return pubkey;
    try { const d = nip19.decode(pubkey); return d.type === 'npub' ? d.data : pubkey; } catch { return pubkey; }
  }, [pubkey]);
  const author = useAuthor(hexPubkey);
  const name = author.data?.metadata?.display_name || author.data?.metadata?.name || pubkey.slice(0, 10) + '...';
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
    const label = profile.metadata.display_name || profile.metadata.name || profile.pubkey.slice(0, 16) + '...';
    onCommit(profile.pubkey, label);
  }, [onCommit]);

  return (
    <ProfileSearchDropdown
      placeholder="Search by name or npub..."
      onSelect={handleSelect}
      hideCountry
      inputClassName="rounded-lg bg-secondary/50 border border-border focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 text-sm h-9"
      className="w-full"
    />
  );
}

// ─── Helper: parse kinds from filter ──────────────────────────────────────────

/** Get the kindFilter string representation from a TabFilter's kinds array. */
function kindsToKindFilter(filter: TabFilter): string {
  const kinds = filter.kinds;
  if (!Array.isArray(kinds) || kinds.length === 0) return 'all';
  return kinds.map(String).join(',');
}

/** Get the author scope from a TabFilter. */
function getAuthorScope(filter: TabFilter): 'anyone' | 'people' {
  const authors = filter.authors;
  if (Array.isArray(authors) && authors.length > 0) return 'people';
  return 'anyone';
}

// ─── SavedFeedFiltersEditor ───────────────────────────────────────────────────

interface SavedFeedFiltersEditorProps {
  /** Current filter values */
  value: TabFilter;
  /** Called on every field change with the updated filter */
  onChange: (filter: TabFilter) => void;
  /** When true, the query input is shown at the top (default: true) */
  showQuery?: boolean;
  /** Hide the From / author scope section (e.g. profile tabs where author is implicit) */
  hideFrom?: boolean;
  /** Optional: pre-built kind options (pass to avoid rebuilding) */
  kindOptions?: KindOption[];
}

export function SavedFeedFiltersEditor({
  value,
  onChange,
  showQuery = true,
  hideFrom = false,
  kindOptions: kindOptionsProp,
}: SavedFeedFiltersEditorProps) {
  const kindOptions = useMemo(() => kindOptionsProp ?? buildKindOptions(), [kindOptionsProp]);
  const { lists } = useUserLists();
  const { data: followPacks = [] } = useFollowPacks();

  const listPickerValue = useMatchedListId(
    Array.isArray(value.authors) ? (value.authors as string[]) : [],
  );

  const search = typeof value.search === 'string' ? value.search : '';
  const authorPubkeys = Array.isArray(value.authors) ? (value.authors as string[]) : [];
  // Local scope state so clicking "People" immediately shows the panel,
  // even before any authors have been added. Initialised from the filter value.
  const [authorScope, setAuthorScopeState] = useState<'anyone' | 'people'>(
    () => getAuthorScope(value),
  );
  const kindFilter = kindsToKindFilter(value);
  const [customKindText, setCustomKindText] = useState('');

  const addAuthor = useCallback((pubkey: string, _label: string) => {
    const next = authorPubkeys.includes(pubkey) ? authorPubkeys : [...authorPubkeys, pubkey];
    setAuthorScopeState('people');
    onChange({ ...value, authors: next });
  }, [authorPubkeys, onChange, value]);

  const removeAuthor = useCallback((pubkey: string) => {
    const next = authorPubkeys.filter((p) => p !== pubkey);
    const updated = { ...value };
    if (next.length > 0) {
      updated.authors = next;
    } else {
      delete updated.authors;
    }
    onChange(updated);
  }, [authorPubkeys, onChange, value]);

  const setAuthorScope = useCallback((scope: 'anyone' | 'people') => {
    setAuthorScopeState(scope);
    if (scope === 'anyone') {
      const updated = { ...value };
      delete updated.authors;
      onChange(updated);
    }
  }, [onChange, value]);

  const handleKindChange = useCallback((v: string) => {
    const updated = { ...value };
    if (v === 'all') {
      delete updated.kinds;
      setCustomKindText('');
    } else if (v === 'custom') {
      setCustomKindText(Array.isArray(value.kinds) ? (value.kinds as number[]).join(', ') : '');
    } else {
      updated.kinds = [parseInt(v, 10)];
      setCustomKindText('');
    }
    onChange(updated);
  }, [onChange, value]);

  const handleCustomKindChange = useCallback((text: string) => {
    setCustomKindText(text);
    const kinds = text.split(/[\s,]+/).map(Number).filter((n) => !isNaN(n) && n > 0);
    if (kinds.length > 0) {
      onChange({ ...value, kinds });
    }
  }, [onChange, value]);

  const handleSearchChange = useCallback((newSearch: string) => {
    const updated = { ...value };
    if (newSearch.trim()) {
      updated.search = newSearch;
    } else {
      delete updated.search;
    }
    onChange(updated);
  }, [onChange, value]);

  return (
    <div className="space-y-3">
      {/* Query */}
      {showQuery && (
        <>
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Search query</span>
            <Input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
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
                <ListPackPicker
                  lists={lists}
                  followPacks={followPacks}
                  value={listPickerValue}
                  onSelectPubkeys={(pubkeys) => {
                    const updated = { ...value };
                    if (pubkeys.length > 0) {
                      updated.authors = pubkeys;
                    } else {
                      delete updated.authors;
                    }
                    onChange(updated);
                  }}
                />
              </div>
            )}
          </div>
          <Separator />
        </>
      )}

      {/* Kind */}
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Kind</span>
        <KindPicker value={kindFilter} options={kindOptions} onChange={handleKindChange} />
      </div>

      {kindFilter === 'custom' && (
        <Input
          type="text"
          inputMode="numeric"
          placeholder="e.g. 1, 30023"
          value={customKindText}
          onChange={(e) => handleCustomKindChange(e.target.value)}
          className="bg-secondary/50 border-border focus-visible:ring-1 rounded-lg text-xs h-8"
        />
      )}
    </div>
  );
}
