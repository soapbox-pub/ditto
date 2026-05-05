import { Link } from 'react-router-dom';
import { Plus, Pencil, Check, SeparatorHorizontal, Search, ChevronDown, ChevronUp, LinkIcon } from 'lucide-react';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { sidebarItemIcon, itemPath } from '@/lib/sidebarItems';
import type { HiddenSidebarItem } from '@/hooks/useFeedSettings';
import { nip19 } from 'nostr-tools';
import { parseNsiteSubdomain } from '@/lib/nsiteSubdomain';

interface SidebarMoreMenuProps {
  editing: boolean;
  hiddenItems: HiddenSidebarItem[];
  onDoneEditing: () => void;
  onStartEditing: () => void;
  onAdd: (id: string) => void;
  onAddDivider: () => void;
  onNavigate?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sidebar item ID configured as the homepage. */
  homePage?: string;
}

function useScrollCarets(centerOnOpen = false) {
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
    // Disconnect previous observer if any
    roRef.current?.disconnect();
    roRef.current = null;
    (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (!el) return;
    if (centerOnOpen) {
      el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    roRef.current = ro;
    update();
  }, [centerOnOpen, update]);

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
      // stop automatically when the limit is reached
      const atLimit = direction === 'up' ? el.scrollTop <= 0 : el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      if (atLimit) stopScroll();
    }, 16);
  }, [update, stopScroll]);

  // clean up interval on unmount
  useEffect(() => stopScroll, [stopScroll]);

  return { scrollRef, refCallback, canScrollUp, canScrollDown, onScroll: update, startScroll, stopScroll };
}

function ScrollCaret({ direction, onMouseEnter, onMouseLeave }: { direction: 'up' | 'down'; onMouseEnter: () => void; onMouseLeave: () => void }) {
  return (
    <button className="flex cursor-default items-center justify-center py-1 w-full shrink-0" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {direction === 'up' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
    </button>
  );
}

function ItemRow({ item, onAdd, onClose }: { item: HiddenSidebarItem; onAdd: (id: string) => void; onClose: () => void }) {
  return (
    <div className="flex items-center">
      <button
        onClick={() => { onAdd(item.id); onClose(); }}
        className="flex items-center gap-3 flex-1 min-w-0 px-2 py-2 rounded-sm text-sm hover:bg-secondary/60 transition-colors cursor-pointer"
      >
        {sidebarItemIcon(item.id, 'size-5 shrink-0')}
        <span className="truncate" style={{ fontFamily: 'var(--title-font-family, inherit)' }}>{item.label}</span>
      </button>
      <button
        onClick={() => { onAdd(item.id); onClose(); }}
        className="size-8 flex items-center justify-center shrink-0 rounded-sm text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
        title={`Add ${item.label} to sidebar`}
      >
        <Plus className="size-4" strokeWidth={4} />
      </button>
    </div>
  );
}

export function SidebarMoreMenu({
  editing, hiddenItems, onDoneEditing, onStartEditing, onAdd, onAddDivider, onNavigate, open, onOpenChange, homePage,
}: SidebarMoreMenuProps) {
  const [query, setQuery] = useState('');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [linkInput, setLinkInput] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [linkError, setLinkError] = useState('');

  const filtered = hiddenItems.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));
  const addFiltered = hiddenItems.filter((item) => item.label.toLowerCase().includes(addQuery.toLowerCase()));

  const handleAddLink = () => {
    const raw = linkValue.trim();
    if (!raw) return;

    // External content: URLs
    if (raw.startsWith('https://') || raw.startsWith('http://')) {
      onAdd(raw);
      setLinkInput(false);
      setLinkValue('');
      setLinkError('');
      return;
    }

    // External content: iso3166 codes
    if (raw.startsWith('iso3166:')) {
      const code = raw.slice('iso3166:'.length);
      if (!/^[A-Za-z]{2}(-[A-Za-z0-9]+)?$/.test(code)) {
        setLinkError('Invalid country/region code');
        return;
      }
      onAdd(raw);
      setLinkInput(false);
      setLinkValue('');
      setLinkError('');
      return;
    }

    // External content: isbn
    if (raw.startsWith('isbn:')) {
      onAdd(raw);
      setLinkInput(false);
      setLinkValue('');
      setLinkError('');
      return;
    }

    // Nsite URI: nsite://<subdomain>
    if (raw.startsWith('nsite://')) {
      const subdomain = raw.slice('nsite://'.length);
      const parsed = parseNsiteSubdomain(subdomain);
      if (!parsed || parsed.kind !== 35128) {
        setLinkError('Invalid nsite identifier (only named sites are supported)');
        return;
      }
      onAdd(raw);
      setLinkInput(false);
      setLinkValue('');
      setLinkError('');
      return;
    }

    // Nostr: strip "nostr:" prefix if present for validation
    const bech32 = raw.startsWith('nostr:') ? raw.slice(6) : raw;

    // Validate it's a valid NIP-19 identifier
    try {
      const decoded = nip19.decode(bech32);
      const validTypes = ['npub', 'nprofile', 'note', 'nevent', 'naddr'];
      if (!validTypes.includes(decoded.type)) {
        setLinkError('Unsupported identifier type');
        return;
      }
    } catch {
      setLinkError('Invalid identifier');
      return;
    }

    // Normalize to "nostr:" prefixed form
    const nostrUri = `nostr:${bech32}`;
    onAdd(nostrUri);
    setLinkInput(false);
    setLinkValue('');
    setLinkError('');
  };

  const main = useScrollCarets(true);
  const add = useScrollCarets();

  if (editing) {
    return (
      <div className="flex flex-col gap-0.5">
        <DropdownMenu open={addMenuOpen} onOpenChange={(o) => { setAddMenuOpen(o); if (!o) setAddQuery(''); }}>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-4 px-4 py-2.5 rounded-full transition-colors text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 bg-background/85">
              <Plus className="size-4" />
              <span>Add</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" collisionPadding={8} className="w-[240px] p-1 flex flex-col max-h-[calc(var(--radix-dropdown-menu-content-available-height)-12px)]">
            <div className="flex items-center gap-3 px-2 py-2 shrink-0">
              <Search className="size-5 shrink-0" />
              <input value={addQuery} onChange={(e) => setAddQuery(e.target.value)} placeholder="Search..." className="flex-1 min-w-0 bg-transparent text-base md:text-sm outline-none placeholder:text-muted-foreground/60" autoFocus />
            </div>
            <div className="h-px bg-border mb-1 shrink-0" />
            {add.canScrollUp && <ScrollCaret direction="up" onMouseEnter={() => add.startScroll('up')} onMouseLeave={add.stopScroll} />}
            <div ref={add.refCallback} className="overflow-y-auto flex-1 min-h-0" onScroll={add.onScroll}>
              {addFiltered.map((item) => <ItemRow key={item.id} item={item} onAdd={onAdd} onClose={() => setAddMenuOpen(false)} />)}
              {addFiltered.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground text-center">No results</p>}
            </div>
            {add.canScrollDown && <ScrollCaret direction="down" onMouseEnter={() => add.startScroll('down')} onMouseLeave={add.stopScroll} />}
          </DropdownMenuContent>
        </DropdownMenu>
        <button onClick={onAddDivider} className="flex items-center gap-4 px-4 py-2.5 rounded-full transition-colors text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 bg-background/85">
          <SeparatorHorizontal className="size-4" />
          <span>Add divider</span>
        </button>
        {linkInput ? (
          <div className="flex flex-col gap-1 px-4 py-2 bg-background/85 rounded-2xl">
            <div className="flex items-center gap-2">
              <LinkIcon className="size-4 text-muted-foreground shrink-0" />
              <input
                value={linkValue}
                onChange={(e) => { setLinkValue(e.target.value); setLinkError(''); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddLink();
                  } else if (e.key === 'Escape') {
                    setLinkInput(false);
                    setLinkValue('');
                    setLinkError('');
                  }
                }}
                placeholder="URL, npub1..., nsite://..., ..."
                className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                autoFocus
              />
            </div>
            {linkError && <p className="text-xs text-destructive pl-6">{linkError}</p>}
            <div className="flex items-center gap-1.5 pl-6">
              <button
                onClick={handleAddLink}
                className="text-xs font-medium text-primary hover:underline"
              >
                Add
              </button>
              <button
                onClick={() => { setLinkInput(false); setLinkValue(''); setLinkError(''); }}
                className="text-xs text-muted-foreground hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setLinkInput(true)}
            className="flex items-center gap-4 px-4 py-2.5 rounded-full transition-colors text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 bg-background/85"
          >
            <LinkIcon className="size-4" />
            <span>Add link</span>
          </button>
        )}
        <button onClick={onDoneEditing} className="flex items-center gap-4 px-4 py-2.5 rounded-full transition-colors text-sm text-primary font-medium hover:bg-primary/10 bg-background/85">
          <Check className="size-4" />
          <span>Done editing</span>
        </button>
      </div>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setQuery(''); }}>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-4 px-4 py-2.5 rounded-full transition-colors text-sm text-muted-foreground/60 hover:text-muted-foreground hover:bg-secondary/40 bg-background/85">
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          <span>More...</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" collisionPadding={8} className="w-[240px] p-1 flex flex-col max-h-[calc(var(--radix-dropdown-menu-content-available-height)-12px)]">
        <div className="flex items-center gap-3 px-2 py-2 shrink-0">
          <Search className="size-5 shrink-0" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." className="flex-1 min-w-0 bg-transparent text-base md:text-sm outline-none placeholder:text-muted-foreground/60" autoFocus />
        </div>
        <div className="h-px bg-border mb-1 shrink-0" />
        {main.canScrollUp && <ScrollCaret direction="up" onMouseEnter={() => main.startScroll('up')} onMouseLeave={main.stopScroll} />}
        <div ref={main.refCallback} className="overflow-y-auto flex-1 min-h-0" onScroll={main.onScroll}>
          {filtered.map((item) => (
            <div key={item.id} className="flex items-center">
              <Link to={itemPath(item.id, undefined, homePage)} onClick={() => { onOpenChange(false); onNavigate?.(); }} className="flex items-center gap-3 flex-1 min-w-0 px-2 py-2 rounded-sm text-sm hover:bg-secondary/60 transition-colors">
                {sidebarItemIcon(item.id, 'size-5 shrink-0')}
                <span className="truncate" style={{ fontFamily: 'var(--title-font-family, inherit)' }}>{item.label}</span>
              </Link>
              <button onClick={() => { onAdd(item.id); onOpenChange(false); }} className="size-8 flex items-center justify-center shrink-0 rounded-sm text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title={`Add ${item.label} to sidebar`}>
                <Plus className="size-4" strokeWidth={4} />
              </button>
            </div>
          ))}
          {filtered.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground text-center">No results</p>}
        </div>
        {main.canScrollDown && <ScrollCaret direction="down" onMouseEnter={() => main.startScroll('down')} onMouseLeave={main.stopScroll} />}
        <div className="h-px bg-border my-1 shrink-0" />
        <button onClick={() => { onStartEditing(); onOpenChange(false); }} className="flex items-center gap-3 w-full px-2 py-2 rounded-sm text-sm hover:bg-secondary/60 transition-colors cursor-pointer shrink-0">
          <Pencil className="size-5" />
          <span>Edit sidebar</span>
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
