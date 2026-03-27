import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { NostrEvent } from '@nostrify/nostrify';
import {
  STATIONERY_PRESETS,
  COLOR_MOMENT_KIND,
  THEME_KIND,
  type Stationery,
  colorMomentToStationery,
  themeToStationery,
  presetToStationery,
  resolveStationery,
} from '@/lib/letterTypes';
import { useColorMomentsPage, useThemesPage } from '@/hooks/useStationery';
import { useFollowList } from '@/hooks/useFollowActions';
import { StationeryPreview } from './StationeryBackground';

const PAGE_SIZE = 24;
const PRESET_ENTRIES = Object.entries(STATIONERY_PRESETS);

// ---------------------------------------------------------------------------
// Paginated color moments grid with infinite scroll
// ---------------------------------------------------------------------------

function ColorMomentsGrid({
  selectedStationery,
  onSelect,
  authors,
}: {
  selectedStationery?: Stationery;
  onSelect: (s: Stationery) => void;
  authors?: string[];
}) {
  const [pages, setPages] = useState<NostrEvent[][]>([]);
  const [until, setUntil] = useState<number | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const lastUntilRef = useRef<number | 'init' | undefined>('init');

  const { data: page, isLoading } = useColorMomentsPage(PAGE_SIZE, until, authors);

  useEffect(() => {
    if (!page || isLoading) return;
    if (lastUntilRef.current === until) return;
    lastUntilRef.current = until;
    if (page.length > 0) {
      setPages((prev) => [...prev, page]);
      if (page.length < PAGE_SIZE) setHasMore(false);
    } else {
      setHasMore(false);
    }
  }, [page, isLoading, until]);

  const allItems = pages.flat();
  const initialized = pages.length > 0 || (!isLoading && lastUntilRef.current !== 'init');

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading || allItems.length === 0) return;
    setUntil(allItems[allItems.length - 1].created_at - 1);
  }, [hasMore, isLoading, allItems]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelCallback = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      if (!node) return;
      observerRef.current = new IntersectionObserver(
        (entries) => { if (entries[0].isIntersecting) loadMore(); },
        { threshold: 0.1 }
      );
      observerRef.current.observe(node);
    },
    [loadMore]
  );

  if (!initialized && isLoading) {
    return (
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-2xl" />)}
      </div>
    );
  }

  if (initialized && allItems.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">none found — try presets</p>;
  }

  return (
    <div className="overflow-y-auto rounded-xl" style={{ height: 160 }}>
      <div className="grid grid-cols-5 gap-2">
        {allItems.map((event) => {
          const stationery = colorMomentToStationery(event);
          const isSelected = selectedStationery?.event?.id === event.id;
          const name = event.tags.find(([n]) => n === 'name')?.[1];
          return (
            <button
              key={event.id}
              onClick={() => onSelect(stationery)}
              title={name}
              className="relative aspect-square rounded-2xl overflow-hidden transition-all hover:scale-105 active:scale-95"
            >
              <StationeryPreview
                stationery={stationery}
                selected={isSelected}
                className="w-full h-full"
              />
            </button>
          );
        })}
        {hasMore && (
          <div ref={sentinelCallback} className="col-span-5 h-2">
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-2xl" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paginated themes grid with infinite scroll
// ---------------------------------------------------------------------------

function ThemesGrid({
  selectedStationery,
  onSelect,
  authors,
}: {
  selectedStationery?: Stationery;
  onSelect: (s: Stationery) => void;
  authors?: string[];
}) {
  const [pages, setPages] = useState<NostrEvent[][]>([]);
  const [until, setUntil] = useState<number | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const lastUntilRef = useRef<number | 'init' | undefined>('init');

  const { data: page, isLoading } = useThemesPage(PAGE_SIZE, until, authors);

  useEffect(() => {
    if (!page || isLoading) return;
    if (lastUntilRef.current === until) return;
    lastUntilRef.current = until;
    if (page.length > 0) {
      setPages((prev) => [...prev, page]);
      if (page.length < PAGE_SIZE) setHasMore(false);
    } else {
      setHasMore(false);
    }
  }, [page, isLoading, until]);

  const allItems = pages.flat();
  const initialized = pages.length > 0 || (!isLoading && lastUntilRef.current !== 'init');

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading || allItems.length === 0) return;
    setUntil(allItems[allItems.length - 1].created_at - 1);
  }, [hasMore, isLoading, allItems]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelCallback = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      if (!node) return;
      observerRef.current = new IntersectionObserver(
        (entries) => { if (entries[0].isIntersecting) loadMore(); },
        { threshold: 0.1 }
      );
      observerRef.current.observe(node);
    },
    [loadMore]
  );

  if (!initialized && isLoading) {
    return (
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-2xl" />)}
      </div>
    );
  }

  if (initialized && allItems.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">none found — try presets</p>;
  }

  return (
    <div className="overflow-y-auto rounded-xl" style={{ height: 160 }}>
      <div className="grid grid-cols-5 gap-2">
        {allItems.map((event) => {
          const stationery = themeToStationery(event);
          const isSelected = selectedStationery?.event?.id === event.id;
          const title = event.tags.find(([n]) => n === 'title')?.[1];
          return (
            <button
              key={event.id}
              onClick={() => onSelect(stationery)}
              title={title}
              className="relative aspect-square rounded-2xl overflow-hidden transition-all hover:scale-105 active:scale-95"
            >
              <StationeryPreview
                stationery={stationery}
                selected={isSelected}
                className="w-full h-full"
              />
            </button>
          );
        })}
        {hasMore && (
          <div ref={sentinelCallback} className="col-span-5 h-2">
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-2xl" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main StationeryPicker
// ---------------------------------------------------------------------------

interface StationeryPickerProps {
  selected?: Stationery;
  onSelect: (stationery: Stationery) => void;
}

type Tab = 'presets' | 'colors' | 'themes';

export function StationeryPicker({ selected, onSelect }: StationeryPickerProps) {
  const [tab, setTab] = useState<Tab>('presets');
  const [scope, setScope] = useState<'everyone' | 'friends' | 'mine'>('everyone');
  const [infoOpen, setInfoOpen] = useState(false);

  const { user } = useCurrentUser();
  const followListData = useFollowList();
  const followPubkeyArray = followListData.data?.pubkeys;
  const followList = useMemo(() => new Set(followPubkeyArray ?? []), [followPubkeyArray]);

  const scopedAuthors = useMemo(() => {
    if (scope === 'mine') return user ? [user.pubkey] : undefined;
    if (scope === 'friends') return followList.size > 0 ? Array.from(followList) : undefined;
    return undefined;
  }, [scope, user, followList]);

  const resolved = selected ? resolveStationery(selected) : undefined;
  const emojiMode = selected?.emojiMode ?? 'tile';
  const hasEmoji = !!resolved?.emoji;
  const isColorMoment = selected?.event?.kind === COLOR_MOMENT_KIND;
  const isTheme = selected?.event?.kind === THEME_KIND;
  const isSingleColor = isColorMoment && selected?.colors !== undefined && selected.colors.length === 0;

  const toggleSingleColor = () => {
    if (!selected || !isColorMoment) return;
    if (isSingleColor) {
      const { colors: _, ...rest } = selected;
      onSelect(rest as Stationery);
    } else {
      onSelect({ ...selected, colors: [] });
    }
  };

  const toggleEmojiMode = () => {
    if (!selected) return;
    onSelect({ ...selected, emojiMode: emojiMode === 'tile' ? 'emblem' : 'tile' });
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'presets', label: 'presets' },
    { id: 'colors',  label: 'moments' },
    { id: 'themes',  label: 'themes' },
  ];

  const isMomentsTab = tab === 'colors';
  const isThemesTab = tab === 'themes';
  const showInfoButton = isMomentsTab || isThemesTab;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setScope('everyone'); }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
              tab === t.id
                ? 'bg-foreground text-background border-foreground'
                : 'bg-secondary text-muted-foreground hover:text-foreground border-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
        {showInfoButton && (
          <button
            onClick={() => setInfoOpen(true)}
            className="ml-auto opacity-70 hover:opacity-100 transition-opacity text-xs text-muted-foreground font-medium px-2 py-1 rounded-full bg-secondary"
          >
            {isMomentsTab ? 'about' : 'about'}
          </button>
        )}
      </div>

      {showInfoButton && (
        <div className="flex gap-1">
          {(['everyone', 'friends', ...(user ? ['mine' as const] : [])] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                scope === s
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground border-secondary'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div>
        {tab === 'presets' && (
          <div className="rounded-xl">
            <div className="grid grid-cols-5 gap-2">
              {PRESET_ENTRIES.map(([key, preset]) => {
                const stationery: Stationery = { color: preset.color, emoji: preset.emoji };
                return (
                  <button
                    key={key}
                    onClick={() => onSelect(presetToStationery(key) ?? stationery)}
                    title={preset.name}
                    className="relative aspect-square rounded-2xl overflow-hidden transition-all hover:scale-105 active:scale-95"
                  >
                    <StationeryPreview
                      stationery={stationery}
                      selected={selected?.color === preset.color && !selected?.event}
                      className="w-full h-full"
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'colors' && <ColorMomentsGrid key={scope} selectedStationery={selected} onSelect={onSelect} authors={scopedAuthors} />}
        {tab === 'themes' && <ThemesGrid key={scope} selectedStationery={selected} onSelect={onSelect} authors={scopedAuthors} />}
      </div>

      {((hasEmoji && !isTheme) || isColorMoment) && (
        <div className="flex items-center gap-4 px-1 pt-1">
          {hasEmoji && !isTheme && (
            <label className="flex items-center gap-1.5">
              <Switch checked={emojiMode === 'emblem'} onCheckedChange={toggleEmojiMode} />
              <span className="text-sm text-muted-foreground font-medium">emblem</span>
            </label>
          )}
          {isColorMoment && (
            <label className="flex items-center gap-1.5">
              <Switch checked={isSingleColor} onCheckedChange={toggleSingleColor} />
              <span className="text-sm text-muted-foreground font-medium">flat</span>
            </label>
          )}
        </div>
      )}

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-xs rounded-2xl">
          {isMomentsTab && (
            <>
              <DialogHeader>
                <DialogTitle>Color moments</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Color moments are beautiful color combinations created and shared by the community. Each one gives your letter a unique palette and mood.
                </p>
                <p>
                  <Link
                    to="/colors"
                    onClick={() => setInfoOpen(false)}
                    className="text-foreground font-medium underline underline-offset-2 hover:no-underline"
                  >
                    Discover and create color moments
                  </Link>
                </p>
              </div>
            </>
          )}
          {isThemesTab && (
            <>
              <DialogHeader>
                <DialogTitle>Ditto themes</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Ditto themes are UI themes shared by the community. Letters borrows their colors and fonts to style your letter.
                </p>
                <p>
                  <Link
                    to="/themes"
                    onClick={() => setInfoOpen(false)}
                    className="text-foreground font-medium underline underline-offset-2 hover:no-underline"
                  >
                    Browse and create themes
                  </Link>
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
