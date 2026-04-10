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
import { getWidgetDefinition } from '@/lib/sidebarWidgets';
import type { WidgetConfig } from '@/contexts/AppContext';
import type { WidgetDefinition } from '@/lib/sidebarWidgets';

// ── Lazy-loaded widget components ────────────────────────────────────────────

const TrendingWidget = lazy(() => import('@/components/widgets/TrendingWidget').then((m) => ({ default: m.TrendingWidget })));
const BlobbiWidget = lazy(() => import('@/components/widgets/BlobbiWidget').then((m) => ({ default: m.BlobbiWidget })));
const StatusWidget = lazy(() => import('@/components/widgets/StatusWidget').then((m) => ({ default: m.StatusWidget })));
const AIChatWidget = lazy(() => import('@/components/widgets/AIChatWidget').then((m) => ({ default: m.AIChatWidget })));
const WikipediaWidget = lazy(() => import('@/components/widgets/WikipediaWidget').then((m) => ({ default: m.WikipediaWidget })));
const BlueskyWidget = lazy(() => import('@/components/widgets/BlueskyWidget').then((m) => ({ default: m.BlueskyWidget })));
const FeedWidget = lazy(() => import('@/components/widgets/FeedWidget').then((m) => ({ default: m.FeedWidget })));

const WidgetPickerDialog = lazy(() => import('@/components/WidgetPickerDialog').then((m) => ({ default: m.WidgetPickerDialog })));

// ── Widget content resolver ──────────────────────────────────────────────────

function WidgetContent({ id }: { id: string }) {
  switch (id) {
    case 'trends':
      return <TrendingWidget />;
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
      return <FeedWidget kinds={[20]} feedPath="/photos" feedLabel="View all photos" />;
    case 'feed:music':
      return <FeedWidget kinds={[36787, 34139]} feedPath="/music" feedLabel="View all music" />;
    case 'feed:articles':
      return <FeedWidget kinds={[30023]} feedPath="/articles" feedLabel="View all articles" />;
    case 'feed:events':
      return <FeedWidget kinds={[31922, 31923]} feedPath="/events" feedLabel="View all events" />;
    case 'feed:books':
      return <FeedWidget kinds={[30040]} feedPath="/books" feedLabel="View all books" />;
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
  onToggleCollapse: (id: string) => void;
  onRemove: (id: string) => void;
  onHeightChange: (id: string, height: number) => void;
}

const SortableWidget = memo(function SortableWidget({ config, definition, onToggleCollapse, onRemove, onHeightChange }: SortableWidgetProps) {
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
        onToggleCollapse={() => onToggleCollapse(config.id)}
        onRemove={() => onRemove(config.id)}
        onHeightChange={(h) => onHeightChange(config.id, h)}
        isDragging={isDragging}
        dragHandleProps={listeners}
      >
        <ErrorBoundary fallback={<WidgetErrorFallback name={definition.label} />} reportToSentry>
          <Suspense fallback={<WidgetSkeleton />}>
            <WidgetContent id={config.id} />
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

  // Filter out widgets with unknown definitions
  const validWidgets = useMemo(
    () => widgets.filter((w) => getWidgetDefinition(w.id)),
    [widgets],
  );

  const updateWidgets = useCallback((updater: (current: WidgetConfig[]) => WidgetConfig[]) => {
    updateConfig((c) => ({
      ...c,
      sidebarWidgets: updater(c.sidebarWidgets ?? widgets),
    }));
  }, [updateConfig, widgets]);

  const toggleCollapse = useCallback((id: string) => {
    updateWidgets((ws) => ws.map((w) => w.id === id ? { ...w, collapsed: !w.collapsed } : w));
  }, [updateWidgets]);

  const removeWidget = useCallback((id: string) => {
    updateWidgets((ws) => ws.filter((w) => w.id !== id));
  }, [updateWidgets]);

  const changeHeight = useCallback((id: string, height: number) => {
    updateWidgets((ws) => ws.map((w) => w.id === id ? { ...w, height } : w));
  }, [updateWidgets]);

  const addWidget = useCallback((id: string) => {
    updateWidgets((ws) => {
      if (ws.some((w) => w.id === id)) return ws;
      return [...ws, { id }];
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
              const def = getWidgetDefinition(w.id);
              if (!def) return null;
              return (
                <SortableWidget
                  key={w.id}
                  config={w}
                  definition={def}
                  onToggleCollapse={toggleCollapse}
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
