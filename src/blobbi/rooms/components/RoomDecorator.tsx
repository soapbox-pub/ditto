/**
 * RoomDecorator — decorating mode, Animal Crossing–style.
 *
 * The room itself is the editor: tap a piece to pick it up, drag it across
 * the floor or along the walls (BlobbiRoomShell + RoomScene snap it to the
 * grid and show green/red footprints). This file provides the chrome:
 *
 * - `RoomDecoratorOverlay`: a top bar (cancel, title, save) and a bottom tray
 *   with the furniture catalog in 3D thumbnails, plus wallpaper and flooring.
 * - `RoomDecoratorToolbar`: the floating buttons over the selected piece
 *   (turn, size, photo for frames, put away).
 *
 * Keyboard: the tray's arrow buttons pick each placed piece in turn; then R
 * turns, Delete puts away, Escape lets go, arrows nudge a tile.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { defineMessages, FormattedMessage, useIntl, type MessageDescriptor } from 'react-intl';
import { Armchair, Box, Check, ChevronLeft, ChevronRight, Clock, Grid3x3, Image, ImagePlus, Lamp, Minus, PaintRoller, Palette, Plus, RotateCw, Search, Sprout, Trash2, X, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

import { ROOM_META, type BlobbiRoomId } from '../lib/room-config';
import {
  CATEGORY_LABELS,
  getAvailableFurnitureByCategory,
  isOfficialFurnitureId,
  resolveFurniture,
  type FurnitureDefinition,
} from '../lib/furniture-registry';
import { MAX_FURNITURE_PER_ROOM, type FurniturePlacement, type FurnitureRotation } from '../lib/room-furniture-schema';
import { ROOM_GRID, WALL_HEIGHT } from '../lib/room-geometry';
import type { RoomLayout } from '../lib/room-layout-schema';
import { getThemeRoomDefaults } from '../lib/room-theme-defaults';
import { getOfficialFurnitureModel, useFurnitureModels, type FurnitureModel } from '../hooks/useFurnitureModels';
import type { RoomControl } from './BlobbiRoomShell';
import { FrameImageControls } from './FrameImageControls';
import { FurnitureThumbnail } from './FurnitureThumbnail';
import { RoomSurfaceEditor } from './RoomSurfaceEditor';

const SCALE_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];

type TrayTab = 'furniture' | 'decor' | 'plants' | 'clocks' | 'frames' | 'objects' | 'wall' | 'floor';

const TAB_ICONS: Record<TrayTab, LucideIcon> = {
  furniture: Armchair,
  decor: Lamp,
  plants: Sprout,
  clocks: Clock,
  frames: Image,
  objects: Box,
  wall: PaintRoller,
  floor: Grid3x3,
};

const surfaceTabLabels = defineMessages({
  wall: { id: 'blobbiRoom.decorator.wallpaper', defaultMessage: 'Wallpaper' },
  floor: { id: 'blobbiRoom.decorator.flooring', defaultMessage: 'Flooring' },
});

// ─── Overlay ──────────────────────────────────────────────────────────────────

interface RoomDecoratorOverlayProps {
  roomId: BlobbiRoomId;
  draft: FurniturePlacement[];
  onDraftChange: (draft: FurniturePlacement[]) => void;
  layout: RoomLayout;
  onLayoutChange: (layout: RoomLayout) => void;
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  invalid: Set<number>;
  /** `sno:` furniture IDs the user has added anywhere, offered under "3D Objects". */
  objectIds: string[];
  controlRef: React.MutableRefObject<RoomControl | null>;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

export function RoomDecoratorOverlay({
  roomId,
  draft,
  onDraftChange,
  layout,
  onLayoutChange,
  selectedIndex,
  onSelect,
  invalid,
  objectIds,
  controlRef,
  onSave,
  onCancel,
  isSaving,
}: RoomDecoratorOverlayProps) {
  const intl = useIntl();
  const { toast } = useToast();
  const trayId = useId();
  const [tab, setTab] = useState<TrayTab>('furniture');
  const catalog = useMemo(() => getAvailableFurnitureByCategory(roomId), [roomId]);
  const objectPlacements = useMemo<FurniturePlacement[]>(
    () => objectIds.map((id) => ({ id, at: 'floor', x: 0, y: 0 })),
    [objectIds],
  );
  const objectModels = useFurnitureModels(objectPlacements);
  const atLimit = draft.length >= MAX_FURNITURE_PER_ROOM;
  const roomMeta = ROOM_META[roomId];

  const tabs: { id: TrayTab; label: MessageDescriptor }[] = [
    ...catalog.map((g) => ({ id: g.category as TrayTab, label: g.label })),
    { id: 'objects', label: CATEGORY_LABELS.objects },
    { id: 'wall', label: surfaceTabLabels.wall },
    { id: 'floor', label: surfaceTabLabels.floor },
  ];
  const tabId = (id: TrayTab) => `${trayId}-tab-${id}`;
  const panelId = `${trayId}-panel`;

  const handleAdd = useCallback((def: FurnitureDefinition, model: FurnitureModel | null | undefined) => {
    if (atLimit) {
      toast({
        title: intl.formatMessage({ id: 'blobbiRoom.decorator.full', defaultMessage: 'This room is full' }),
        description: intl.formatMessage(
          { id: 'blobbiRoom.decorator.fullDescription', defaultMessage: 'Rooms hold up to {max} items.' },
          { max: MAX_FURNITURE_PER_ROOM },
        ),
      });
      return;
    }
    if (!model) return;
    const spot = controlRef.current?.findSpot({
      node: model.node,
      official: isOfficialFurnitureId(def.id),
      mount: def.mount,
    });
    if (controlRef.current && !spot) {
      toast({
        title: intl.formatMessage({ id: 'blobbiRoom.decorator.noSpace', defaultMessage: 'No space left' }),
        description: intl.formatMessage({ id: 'blobbiRoom.decorator.noSpaceDescription', defaultMessage: 'Move or put something away first.' }),
      });
      return;
    }
    const placement: FurniturePlacement = {
      id: def.id,
      ...(spot ?? (def.mount === 'wall' ? { at: 'left' as const, x: ROOM_GRID / 2, y: WALL_HEIGHT / 2 } : { at: 'floor' as const, x: ROOM_GRID / 2, y: ROOM_GRID / 2 })),
    };
    onDraftChange([...draft, placement]);
    onSelect(draft.length);
  }, [atLimit, controlRef, draft, onDraftChange, onSelect, toast, intl]);

  // Pick pieces one after another, for keyboards and screen readers
  const selectStep = useCallback((dir: 1 | -1) => {
    if (!draft.length) return;
    const from = selectedIndex ?? (dir === 1 ? -1 : 0);
    onSelect((from + dir + draft.length) % draft.length);
  }, [draft.length, selectedIndex, onSelect]);
  const selectedLabel = selectedIndex !== null && draft[selectedIndex] ? resolveFurniture(draft[selectedIndex].id)?.label : undefined;

  return (
    <>
      {/* Top bar */}
      <div data-room-top className="pointer-events-auto px-3 pt-3">
        <div className="flex items-center gap-2 rounded-full border border-border/50 bg-background/90 backdrop-blur-md shadow-md p-1.5">
          <Button variant="ghost" size="icon" onClick={onCancel} disabled={isSaving} aria-label={intl.formatMessage({ id: 'blobbiRoom.decorator.cancel', defaultMessage: 'Cancel decorating' })} className="shrink-0">
            <X className="!size-5" />
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-bold leading-tight">
              <FormattedMessage
                id="blobbiRoom.decorator.title"
                defaultMessage="Decorating {room}"
                values={{ room: intl.formatMessage(roomMeta.label) }}
              />
            </p>
            <p aria-live="polite" className={cn('truncate text-xs leading-tight', invalid.size ? 'text-destructive font-medium' : 'text-muted-foreground')}>
              {invalid.size ? (
                <FormattedMessage id="blobbiRoom.decorator.overlap" defaultMessage="Some pieces overlap — move them apart" />
              ) : selectedIndex === null ? (
                <FormattedMessage
                  id="blobbiRoom.decorator.hint"
                  defaultMessage="Tap a piece to pick it up · {count}/{max}"
                  values={{ count: draft.length, max: MAX_FURNITURE_PER_ROOM }}
                />
              ) : (
                <FormattedMessage
                  id="blobbiRoom.decorator.selectedHint"
                  defaultMessage="{piece} · drag or use the arrow keys to move"
                  values={{
                    piece: selectedLabel
                      ? intl.formatMessage(selectedLabel)
                      : intl.formatMessage({ id: 'blobbiRoom.decorator.piece', defaultMessage: 'Piece' }),
                  }}
                />
              )}
            </p>
          </div>
          <Button onClick={onSave} disabled={isSaving || invalid.size > 0} className="shrink-0">
            <Check />
            {isSaving
              ? <FormattedMessage id="blobbiRoom.decorator.saving" defaultMessage="Saving…" />
              : <FormattedMessage id="blobbiRoom.decorator.save" defaultMessage="Save" />}
          </Button>
        </div>
      </div>

      <div className="flex-1" />

      {/* Tray */}
      <div
        data-room-bottom
        className="pointer-events-auto mx-2 mb-2 sidebar:mb-3 max-sidebar:mb-[calc(var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px))+0.5rem)] rounded-3xl border border-border/50 bg-background/92 backdrop-blur-md shadow-lg overflow-hidden"
      >
        <div className="flex items-center gap-1 border-b border-border/40 p-1.5">
          <ScrollRow
            className="flex-1 min-w-0"
            innerClassName="gap-1"
            role="tablist"
            aria-label={intl.formatMessage({ id: 'blobbiRoom.decorator.catalog', defaultMessage: 'Catalog' })}
            onKeyDown={(e) => {
              // One tab stop; arrows move along the tabs
              const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
              if (!dir) return;
              e.preventDefault();
              const next = tabs[(tabs.findIndex((t) => t.id === tab) + dir + tabs.length) % tabs.length];
              setTab(next.id);
              document.getElementById(tabId(next.id))?.focus();
            }}
          >
            {tabs.map((t) => {
              const Icon = TAB_ICONS[t.id];
              return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={tabId(t.id)}
                tabIndex={tab === t.id ? 0 : -1}
                aria-selected={tab === t.id}
                aria-controls={panelId}
                onClick={() => setTab(t.id)}
                className={cn(
                  'shrink-0 h-9 rounded-full px-3.5 flex items-center gap-1.5 text-sm font-medium transition-colors [&_svg]:size-4',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  tab === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon aria-hidden />
                {intl.formatMessage(t.label)}
              </button>
              );
            })}
          </ScrollRow>
          {/* Keyboard users pick placed pieces in turn; hidden until focused, since pointers just tap them */}
          <div className="flex shrink-0 gap-1 [&:not(:focus-within)]:sr-only">
            <Button variant="ghost" size="icon" onClick={() => selectStep(-1)} disabled={!draft.length} aria-label={intl.formatMessage({ id: 'blobbiRoom.decorator.previousPiece', defaultMessage: 'Select previous piece' })}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => selectStep(1)} disabled={!draft.length} aria-label={intl.formatMessage({ id: 'blobbiRoom.decorator.nextPiece', defaultMessage: 'Select next piece' })}>
              <ChevronRight />
            </Button>
          </div>
        </div>

        {tab === 'wall' || tab === 'floor' ? (
          <div id={panelId} role="tabpanel" aria-labelledby={tabId(tab)} className="max-h-[38dvh] overflow-y-auto px-4 py-3">
            <RoomSurfaceEditor
              type={tab}
              value={layout[tab]}
              onChange={(value) => onLayoutChange({ ...layout, [tab]: value })}
            />
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 text-muted-foreground"
              onClick={() => onLayoutChange({ ...layout, [tab]: getThemeRoomDefaults()[roomId][tab] })}
            >
              <Palette />
              <FormattedMessage id="blobbiRoom.decorator.matchTheme" defaultMessage="Match my theme" />
            </Button>
          </div>
        ) : (
          <ScrollRow key={tab} id={panelId} role="tabpanel" aria-labelledby={tabId(tab)} innerClassName="gap-1 p-2">
            {tab === 'objects'
              ? objectIds.map((id, i) => {
                const def = resolveFurniture(id);
                const model = objectModels.get(i);
                if (!def) return null;
                return (
                  <CatalogTile
                    key={id}
                    id={id}
                    label={model?.missing
                      ? intl.formatMessage({ id: 'blobbiRoom.decorator.couldNotLoad', defaultMessage: 'Couldn’t load' })
                      : model?.name || intl.formatMessage(def.label)}
                    model={model}
                    disabled={atLimit || !model || model.missing}
                    onClick={() => handleAdd(def, model)}
                  />
                );
              })
              : catalog.find((g) => g.category === tab)?.items.map((def) => (
                <CatalogTile
                  key={def.id}
                  id={def.id}
                  label={intl.formatMessage(def.label)}
                  disabled={atLimit}
                  onClick={() => handleAdd(def, getOfficialFurnitureModel(def.id))}
                />
              ))}
            {tab === 'objects' && <FindMoreTile empty={!objectIds.length} />}
          </ScrollRow>
        )}
      </div>
    </>
  );
}

/**
 * A row that scrolls sideways by swipe, mouse wheel, or the arrow buttons at
 * either end, which show while there's more that way.
 */
function ScrollRow({ className, innerClassName, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { innerClassName?: string }) {
  const intl = useIntl();
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const left = el.scrollLeft > 2;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    // Tiles and tabs come and go (and 3D thumbnails load in)
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener('scroll', check);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: reduce ? 'auto' : 'smooth' });
  };

  // A vertical wheel scrolls the row sideways; the room behind doesn't scroll
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
  };

  const arrow = 'absolute top-1/2 -translate-y-1/2 z-10 size-9 rounded-full flex items-center justify-center border border-border/50 bg-background shadow-md text-foreground/80 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-5';

  return (
    <div className={cn('relative', className)}>
      <div ref={ref} onWheel={onWheel} className={cn('flex overflow-x-auto scrollbar-none', innerClassName)} {...props}>
        {children}
      </div>
      {edges.left && (
        <button type="button" tabIndex={-1} onClick={() => page(-1)} className={cn(arrow, 'left-1')} aria-label={intl.formatMessage({ id: 'blobbiRoom.decorator.scrollBack', defaultMessage: 'Scroll back' })}>
          <ChevronLeft />
        </button>
      )}
      {edges.right && (
        <button type="button" tabIndex={-1} onClick={() => page(1)} className={cn(arrow, 'right-1')} aria-label={intl.formatMessage({ id: 'blobbiRoom.decorator.scrollForward', defaultMessage: 'Scroll forward' })}>
          <ChevronRight />
        </button>
      )}
    </div>
  );
}

/** Last tile under 3D Objects: to the feed of them, where "Add to Blobbi room" lives. */
function FindMoreTile({ empty }: { empty: boolean }) {
  return (
    <Link
      to="/objects"
      className={cn(
        'shrink-0 flex flex-col items-center justify-center gap-1 rounded-2xl p-1.5 text-center text-primary',
        'transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        empty ? 'w-auto flex-row gap-2 px-4 py-6 text-sm font-medium' : 'w-[5.5rem]',
      )}
    >
      {empty ? (
        <>
          <Search className="size-5" />
          <FormattedMessage id="blobbiRoom.decorator.findObjectsEmpty" defaultMessage="Find 3D objects to add from the feed" />
        </>
      ) : (
        <>
          <span className="size-16 rounded-full bg-primary/10 flex items-center justify-center"><Search className="size-6" /></span>
          <span className="w-full truncate text-xs font-medium leading-tight">
            <FormattedMessage id="blobbiRoom.decorator.findMore" defaultMessage="Find more" />
          </span>
        </>
      )}
    </Link>
  );
}

function CatalogTile({ id, label, model, disabled, onClick }: {
  id: string;
  label: string;
  model?: FurnitureModel;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'shrink-0 w-[5.5rem] flex flex-col items-center gap-1 rounded-2xl p-1.5',
        'transition-colors hover:bg-accent active:scale-95 motion-reduce:active:scale-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40',
      )}
    >
      <FurnitureThumbnail id={id} model={model} alt="" className="size-16" />
      <span className="w-full truncate text-center text-xs font-medium leading-tight">{label}</span>
    </button>
  );
}

// ─── Floating toolbar ─────────────────────────────────────────────────────────

interface RoomDecoratorToolbarProps {
  draft: FurniturePlacement[];
  onDraftChange: (draft: FurniturePlacement[]) => void;
  selectedIndex: number;
  onSelect: (index: number | null) => void;
}

export function RoomDecoratorToolbar({ draft, onDraftChange, selectedIndex, onSelect }: RoomDecoratorToolbarProps) {
  const intl = useIntl();
  const item = draft[selectedIndex];
  const def = item ? resolveFurniture(item.id) : undefined;

  const update = useCallback((patch: Partial<FurniturePlacement>) => {
    onDraftChange(draft.map((p, i) => (i === selectedIndex ? { ...p, ...patch } : p)));
  }, [draft, onDraftChange, selectedIndex]);

  const rotate = useCallback(() => {
    if (!item || item.at !== 'floor') return;
    update({ rot: (((item.rot ?? 0) + 1) % 4) as FurnitureRotation });
  }, [item, update]);

  const resize = useCallback((dir: 1 | -1) => {
    if (!item) return;
    const current = SCALE_STEPS.reduce((best, s) => (Math.abs(s - (item.scale ?? 1)) < Math.abs(best - (item.scale ?? 1)) ? s : best));
    const next = SCALE_STEPS[Math.max(0, Math.min(SCALE_STEPS.length - 1, SCALE_STEPS.indexOf(current) + dir))];
    update({ scale: next === 1 ? undefined : next });
  }, [item, update]);

  const remove = useCallback(() => {
    onDraftChange(draft.filter((_, i) => i !== selectedIndex));
    onSelect(null);
  }, [draft, onDraftChange, onSelect, selectedIndex]);

  // Keyboard: R turns, Delete puts away, Escape lets go, arrows nudge
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Already handled, e.g. Escape closing the photo popover
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (!item) return;
      // Delete/Backspace or arrows on another control (a tray tile, a tab) aren't aimed at the piece; on its toolbar they are
      const onControl = !!target?.closest('button, a[href], [role="button"], [role="tab"]') && !target?.closest('[role="toolbar"]');
      const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (e.key === 'r' || e.key === 'R') rotate();
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (onControl) return;
        remove();
      }
      else if (e.key === 'Escape') onSelect(null);
      else if (step[e.key]) {
        if (onControl) return;
        const [dx, dy] = step[e.key];
        const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
        // On the floor, a tile along x or z; on walls, half a tile along the wall or up/down
        if (item.at === 'floor') update({ x: clamp(item.x + dx, ROOM_GRID), y: clamp(item.y + dy, ROOM_GRID) });
        else update({ x: clamp(item.x + (item.at === 'left' ? -dx : dx) * 0.5, ROOM_GRID), y: clamp(item.y - dy * 0.5, WALL_HEIGHT) });
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, rotate, remove, onSelect, update]);

  if (!item || !def) return null;
  const scale = item.scale ?? 1;

  return (
    <div
      className="flex items-center gap-0.5 rounded-full border border-border/60 bg-background/95 p-1 shadow-xl backdrop-blur-md motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 motion-safe:duration-150"
      role="toolbar"
      aria-label={intl.formatMessage(
        { id: 'blobbiRoom.decorator.pieceActions', defaultMessage: '{piece} actions' },
        { piece: intl.formatMessage(def.label) },
      )}
    >
      {item.at === 'floor' && (
        <ToolButton label={intl.formatMessage({ id: 'blobbiRoom.decorator.turn', defaultMessage: 'Turn (R)' })} onClick={rotate}><RotateCw /></ToolButton>
      )}
      <ToolButton label={intl.formatMessage({ id: 'blobbiRoom.decorator.smaller', defaultMessage: 'Smaller' })} onClick={() => resize(-1)} disabled={scale <= SCALE_STEPS[0]}><Minus /></ToolButton>
      <ToolButton label={intl.formatMessage({ id: 'blobbiRoom.decorator.bigger', defaultMessage: 'Bigger' })} onClick={() => resize(1)} disabled={scale >= SCALE_STEPS[SCALE_STEPS.length - 1]}><Plus /></ToolButton>
      {def.isFrame && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={intl.formatMessage({ id: 'blobbiRoom.decorator.photo', defaultMessage: 'Photo' })}
              title={intl.formatMessage({ id: 'blobbiRoom.decorator.photo', defaultMessage: 'Photo' })}
              className={TOOL_CLASS}
            >
              <ImagePlus />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72" side="top">
            <FrameImageControls
              imageUrl={item.content?.imageUrl}
              onImageChange={(imageUrl) => update({ content: imageUrl ? { imageUrl } : undefined })}
            />
          </PopoverContent>
        </Popover>
      )}
      <div className="mx-0.5 h-6 w-px bg-border" aria-hidden />
      <ToolButton label={intl.formatMessage({ id: 'blobbiRoom.decorator.putAway', defaultMessage: 'Put away (Delete)' })} onClick={remove} className="text-destructive hover:bg-destructive/10"><Trash2 /></ToolButton>
    </div>
  );
}

const TOOL_CLASS = cn(
  'size-11 rounded-full flex items-center justify-center text-foreground/80 transition-colors [&_svg]:size-5',
  'hover:bg-accent hover:text-foreground disabled:opacity-35',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
);

function ToolButton({ label, onClick, disabled, className, children }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className={cn(TOOL_CLASS, className)}>
      {children}
    </button>
  );
}
