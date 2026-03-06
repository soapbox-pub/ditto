/**
 * ProfileTabEditModal
 *
 * Modal for adding or editing a custom profile tab (kind 16769).
 * Opens with an optional existing tab to edit; otherwise creates a new one.
 *
 * Streamlined for profile tabs: only Search Query, Author Scope (Me / Contacts / Global),
 * and multi-select Kind picker.
 */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Loader2, Check, ChevronDown, ChevronUp,
  Hash, Search as SearchIcon, X, Globe, Users, User,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { buildKindOptions } from '@/components/SavedFeedFiltersEditor';
import { cn } from '@/lib/utils';
import type { ProfileTab, TabFilter } from '@/lib/profileTabsEvent';

type KindOption = {
  value: string;
  label: string;
  description: string;
  parentId: string;
  icon: React.ComponentType<{ className?: string }> | undefined;
};

interface ProfileTabEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing tab to edit. If undefined, creates a new tab. */
  tab?: ProfileTab;
  /** The profile owner's pubkey — used to pre-populate authors when scope is 'me'. */
  ownerPubkey: string;
  /** Called with the resulting tab on save. */
  onSave: (tab: ProfileTab) => Promise<void>;
  isPending?: boolean;
}

// ─── Author scope type for the simplified 3-way toggle ────────────────────────

type ProfileAuthorScope = 'me' | 'contacts' | 'global';

/** Map from simplified scope to filter fields. */
function scopeToFilter(scope: ProfileAuthorScope, ownerPubkey: string): Partial<TabFilter> {
  switch (scope) {
    case 'me':
      return { authors: [ownerPubkey] };
    case 'contacts':
      // Uses $follows variable — handled at event level via var tags
      return { authors: ['$follows'] };
    case 'global':
      return {};
  }
}

/** Derive the simplified scope from a TabFilter. */
function filterToScope(filter: TabFilter, ownerPubkey: string): ProfileAuthorScope {
  const authors = Array.isArray(filter.authors) ? filter.authors as string[] : [];
  if (authors.length === 1 && authors[0] === ownerPubkey) return 'me';
  if (authors.includes('$follows')) return 'contacts';
  if (authors.length > 0) return 'me'; // has specific authors
  return 'global';
}

/** Parse kinds from filter into selected kind value strings. */
function parseSelectedKinds(filter: TabFilter): string[] {
  const kinds = filter.kinds;
  if (!Array.isArray(kinds) || kinds.length === 0) return [];
  return kinds.map(String);
}

/** Serialize selected kind values into a kinds array for the filter. */
function serializeSelectedKinds(kinds: string[]): number[] {
  return kinds.map(Number).filter((n) => !isNaN(n) && n > 0);
}

// ─── Multi-Select Kind Picker ─────────────────────────────────────────────────

function useScrollCarets() {
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

function MultiKindPicker({ selectedKinds, options, onChange }: {
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

  // Build the trigger label
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
          {/* Search bar */}
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
            <button
              className="flex cursor-default items-center justify-center py-0.5 w-full shrink-0 text-muted-foreground hover:text-foreground"
              onMouseEnter={() => startScroll('up')}
              onMouseLeave={stopScroll}
            >
              <ChevronUp className="size-3.5" />
            </button>
          )}

          <div ref={refCallback} className="overflow-y-auto flex-1 min-h-0" onScroll={onScroll}>
            {/* "All kinds" option */}
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
            <button
              className="flex cursor-default items-center justify-center py-0.5 w-full shrink-0 text-muted-foreground hover:text-foreground"
              onMouseEnter={() => startScroll('down')}
              onMouseLeave={stopScroll}
            >
              <ChevronDown className="size-3.5" />
            </button>
          )}

          {/* Footer with count + done */}
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

      {/* Selected kind chips */}
      {selectedKinds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedKinds.map((kindValue) => {
            const opt = options.find((o) => o.value === kindValue);
            const Icon = opt?.icon;
            const label = opt ? opt.label : `Kind ${kindValue}`;
            return (
              <span
                key={kindValue}
                className="inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-full bg-secondary border border-border text-xs max-w-[180px] group"
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

// ─── Author Scope Toggle ──────────────────────────────────────────────────────

const SCOPE_OPTIONS: { value: ProfileAuthorScope; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'me', label: 'Me', icon: User },
  { value: 'contacts', label: 'Contacts', icon: Users },
  { value: 'global', label: 'Global', icon: Globe },
];

function AuthorScopeToggle({ value, onChange }: {
  value: ProfileAuthorScope;
  onChange: (scope: ProfileAuthorScope) => void;
}) {
  return (
    <div className="flex rounded-lg border border-border overflow-hidden">
      {SCOPE_OPTIONS.map(({ value: scope, label, icon: Icon }) => (
        <button
          key={scope}
          onClick={() => onChange(scope)}
          className={cn(
            'flex-1 py-2 flex items-center justify-center gap-1.5 text-sm font-medium transition-all',
            value === scope
              ? 'bg-primary text-primary-foreground shadow-sm'
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

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function ProfileTabEditModal({
  open,
  onOpenChange,
  tab,
  ownerPubkey,
  onSave,
  isPending = false,
}: ProfileTabEditModalProps) {
  const kindOptions = useMemo(() => buildKindOptions(), []);
  const isNew = !tab;

  const initialFilter = useMemo<TabFilter>(() => {
    if (tab) return tab.filter;
    return { authors: [ownerPubkey] };
  }, [tab, ownerPubkey]);

  const [label, setLabel] = useState(tab?.label ?? '');
  const [query, setQuery] = useState(
    typeof initialFilter.search === 'string' ? initialFilter.search : '',
  );
  const [authorScope, setAuthorScope] = useState<ProfileAuthorScope>(
    filterToScope(initialFilter, ownerPubkey),
  );
  const [selectedKinds, setSelectedKinds] = useState<string[]>(
    parseSelectedKinds(initialFilter),
  );

  // Reset state when modal opens
  const handleOpenChange = (o: boolean) => {
    if (o) {
      setLabel(tab?.label ?? '');
      const f = tab ? tab.filter : { authors: [ownerPubkey] };
      setQuery(typeof f.search === 'string' ? f.search : '');
      setAuthorScope(filterToScope(f, ownerPubkey));
      setSelectedKinds(parseSelectedKinds(f));
    }
    onOpenChange(o);
  };

  const handleSave = async () => {
    if (!label.trim() || isPending) return;

    const filter: TabFilter = {
      ...scopeToFilter(authorScope, ownerPubkey),
    };

    if (query.trim()) {
      filter.search = query.trim();
    }

    const kinds = serializeSelectedKinds(selectedKinds);
    if (kinds.length > 0) {
      filter.kinds = kinds;
    }

    await onSave({ label: label.trim(), filter });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add profile tab' : 'Edit tab'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Tab name */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tab name</span>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              placeholder="e.g. My Art, Bitcoin posts..."
              autoFocus
              className="h-9"
            />
          </div>

          <Separator />

          {/* Search query */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Search query</span>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. photography, travel..."
              className="bg-secondary/50 border-border focus-visible:ring-1 h-9 text-sm"
            />
          </div>

          <Separator />

          {/* Author scope */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Authors</span>
            <AuthorScopeToggle value={authorScope} onChange={setAuthorScope} />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {authorScope === 'me' && 'Only show your own posts.'}
              {authorScope === 'contacts' && 'Show posts from people you follow.'}
              {authorScope === 'global' && 'Show posts from everyone.'}
            </p>
          </div>

          <Separator />

          {/* Kind multi-select */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Kinds</span>
            <MultiKindPicker
              selectedKinds={selectedKinds}
              options={kindOptions}
              onChange={setSelectedKinds}
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 pt-3 sm:flex-col">
          <Button className="w-full gap-2" onClick={handleSave} disabled={!label.trim() || isPending}>
            {isPending
              ? <Loader2 className="size-4 animate-spin" />
              : <Check className="size-4" />}
            {isNew ? 'Add tab' : 'Save changes'}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
