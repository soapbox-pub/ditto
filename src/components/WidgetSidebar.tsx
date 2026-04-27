import { useCallback, useMemo, useState, lazy, Suspense, memo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus } from 'lucide-react';

import { WidgetCard } from '@/components/WidgetCard';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LinkFooter } from '@/components/LinkFooter';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppContext } from '@/hooks/useAppContext';
import { useInstalledTiles } from '@/hooks/useInstalledTiles';
import { getDTag } from '@/lib/nostr-canvas/identifiers';
import { getWidgetDefinition } from '@/lib/sidebarWidgets';
import type { WidgetConfig } from '@/contexts/AppContext';
import type { WidgetDefinition } from '@/lib/sidebarWidgets';
import { LayoutGrid } from 'lucide-react';

// ── Lazy-loaded widget components ────────────────────────────────────────────

const TrendingWidget = lazy(() => import('@/components/widgets/TrendingWidget').then((m) => ({ default: m.TrendingWidget })));
const HotPostsWidget = lazy(() => import('@/components/widgets/HotPostsWidget').then((m) => ({ default: m.HotPostsWidget })));
const BlobbiWidget = lazy(() => import('@/components/widgets/BlobbiWidget').then((m) => ({ default: m.BlobbiWidget })));
const StatusWidget = lazy(() => import('@/components/widgets/StatusWidget').then((m) => ({ default: m.StatusWidget })));
const AIChatWidget = lazy(() => import('@/components/widgets/AIChatWidget').then((m) => ({ default: m.AIChatWidget })));
const WikipediaWidget = lazy(() => import('@/components/widgets/WikipediaWidget').then((m) => ({ default: m.WikipediaWidget })));
const BlueskyWidget = lazy(() => import('@/components/widgets/BlueskyWidget').then((m) => ({ default: m.BlueskyWidget })));
const PhotoWidget = lazy(() => import('@/components/widgets/PhotoWidget').then((m) => ({ default: m.PhotoWidget })));
const MusicWidget = lazy(() => import('@/components/widgets/MusicWidget').then((m) => ({ default: m.MusicWidget })));
const FeedWidget = lazy(() => import('@/components/widgets/FeedWidget').then((m) => ({ default: m.FeedWidget })));
const TileWidget = lazy(() => import('@/components/widgets/TileWidget').then((m) => ({ default: m.TileWidget })));

const WidgetPickerDialog = lazy(() => import('@/components/WidgetPickerDialog').then((m) => ({ default: m.WidgetPickerDialog })));

// ── Widget content resolver ──────────────────────────────────────────────────

function WidgetContent({ config }: { config: WidgetConfig }) {
  // Tile widgets are keyed by `tile:<identifier>` so multiple tiles can
  // coexist in the sidebar without id collisions. Everything else uses
  // its flat widget id directly.
  if (config.id === 'tile' || config.id.startsWith('tile:')) {
    return <TileWidget tileIdentifier={config.tileIdentifier} />;
  }
  switch (config.id) {
    case 'trends':
      return <TrendingWidget />;
    case 'hot-posts':
      return <HotPostsWidget />;
    case 'blobbi':
      return <BlobbiWidget />;
    case 'status':
      return <StatusWidget />;
    case 'ai-chat':
      return <AIChatWidget />;
    case 'wikipedia':
      return <WikipediaWidget />;
    case 'bluesky':
      return <BlueskyWidget />;
    case 'feed:photos':
      return <PhotoWidget />;
    case 'feed:music':
      return <MusicWidget />;
    case 'feed:articles':
      return <FeedWidget kinds={[30023]} feedPath="/articles" feedLabel="View all articles" />;
    case 'feed:events':
      return <FeedWidget kinds={[31922, 31923]} feedPath="/events" feedLabel="View all events" />;

    default:
      return <p className="text-xs text-muted-foreground p-1">Unknown widget.</p>;
  }
}

/** Fallback while a widget component is loading. */
function WidgetSkeleton() {
  return (
    <div className="space-y-2 p-1">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  );
}

/** Compact fallback shown when a widget crashes. */
function WidgetErrorFallback({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-4 px-3 text-center">
      <p className="text-xs text-muted-foreground">{name} failed to load.</p>
      <button
        onClick={() => window.location.reload()}
        className="text-xs text-primary hover:underline"
      >
        Reload page
      </button>
    </div>
  );
}

// ── Sortable widget wrapper ──────────────────────────────────────────────────

interface SortableWidgetProps {
  config: WidgetConfig;
  definition: WidgetDefinition;
  onRemove: (id: string) => void;
  onHeightChange: (id: string, height: number) => void;
}

const SortableWidget = memo(function SortableWidget({ config, definition, onRemove, onHeightChange }: SortableWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: config.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <WidgetCard
        definition={definition}
        config={config}
        onRemove={() => onRemove(config.id)}
        onHeightChange={(h) => onHeightChange(config.id, h)}
        isDragging={isDragging}
        dragHandleProps={listeners}
      >
        <ErrorBoundary fallback={<WidgetErrorFallback name={definition.label} />} reportToSentry>
          <Suspense fallback={<WidgetSkeleton />}>
            <WidgetContent config={config} />
          </Suspense>
        </ErrorBoundary>
      </WidgetCard>
    </div>
  );
});

// ── Main sidebar ─────────────────────────────────────────────────────────────

const EMPTY_WIDGETS: WidgetConfig[] = [];

export function WidgetSidebar() {
  const { config, updateConfig } = useAppContext();
  const widgets = config.sidebarWidgets ?? EMPTY_WIDGETS;
  const [pickerOpen, setPickerOpen] = useState(false);
  const { installedTiles } = useInstalledTiles();

  /**
   * Resolve a widget config to its runtime definition. Built-in widgets
   * live in the static `WIDGET_DEFINITIONS` registry; tile widgets are
   * resolved against the user's installed-tile list so their label
   * reflects whatever the tile event currently declares.
   */
  const resolveDefinition = useCallback(
    (w: WidgetConfig): WidgetDefinition | undefined => {
      if (w.id === 'tile' || w.id.startsWith('tile:')) {
        if (!w.tileIdentifier) return undefined;
        const entry = installedTiles.find(
          (t) => getDTag(t.event) === w.tileIdentifier,
        );
        const name =
          entry?.event.tags.find(([name]) => name === 'name')?.[1] ??
          w.tileIdentifier;
        return {
          id: w.id,
          label: name,
          description: w.tileIdentifier,
          icon: LayoutGrid,
          defaultHeight: 320,
          minHeight: 160,
          maxHeight: 700,
          category: 'personal',
        };
      }
      return getWidgetDefinition(w.id);
    },
    [installedTiles],
  );

  // Filter out widgets with unknown/missing definitions.
  const validWidgets = useMemo(
    () => widgets.filter((w) => !!resolveDefinition(w)),
    [widgets, resolveDefinition],
  );

  const updateWidgets = useCallback((updater: (current: WidgetConfig[]) => WidgetConfig[]) => {
    updateConfig((c) => ({
      ...c,
      sidebarWidgets: updater(c.sidebarWidgets ?? widgets),
    }));
  }, [updateConfig, widgets]);

  const removeWidget = useCallback((id: string) => {
    updateWidgets((ws) => ws.filter((w) => w.id !== id));
  }, [updateWidgets]);

  const changeHeight = useCallback((id: string, height: number) => {
    updateWidgets((ws) => ws.map((w) => w.id === id ? { ...w, height } : w));
  }, [updateWidgets]);

  const addWidget = useCallback((entry: { id: string; tileIdentifier?: string }) => {
    updateWidgets((ws) => {
      if (ws.some((w) => w.id === entry.id)) return ws;
      return [...ws, entry];
    });
  }, [updateWidgets]);

  // Drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const sortableIds = useMemo(() => validWidgets.map((w) => w.id), [validWidgets]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    updateWidgets((ws) => {
      const oldIndex = ws.findIndex((w) => w.id === active.id);
      const newIndex = ws.findIndex((w) => w.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return ws;
      return arrayMove(ws, oldIndex, newIndex);
    });
  }, [updateWidgets]);

  return (
    <aside className="w-[300px] shrink-0 hidden xl:flex flex-col sticky top-0 h-screen overflow-y-auto pt-2 pb-3 px-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2 flex-1">
            {validWidgets.map((w) => {
              const def = resolveDefinition(w);
              if (!def) return null;
              return (
                <SortableWidget
                  key={w.id}
                  config={w}
                  definition={def}
                  onRemove={removeWidget}
                  onHeightChange={changeHeight}
                />
              );
            })}

            {/* Add widget button */}
            <button
              onClick={() => setPickerOpen(true)}
              className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl bg-background/85 text-muted-foreground hover:text-foreground hover:bg-background transition-colors text-xs"
            >
              <Plus className="size-3.5" />
              Add widget
            </button>
          </div>
        </SortableContext>
      </DndContext>

      <div className="mt-3">
        <LinkFooter />
      </div>

      {/* Widget picker dialog */}
      <Suspense fallback={null}>
        {pickerOpen && (
          <WidgetPickerDialog
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            currentWidgets={widgets}
            onAdd={addWidget}
            onRemove={removeWidget}
          />
        )}
      </Suspense>
    </aside>
  );
}
