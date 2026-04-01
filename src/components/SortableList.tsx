import { useCallback } from 'react';
import { GripVertical } from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';

// ── Generic sortable list container ──────────────────────────────────────────

export interface SortableListProps<T> {
  /** Items in current order. */
  items: T[];
  /** Extract a unique stable string id from each item. */
  getItemId: (item: T, index: number) => string;
  /** Called with the reordered items array after a drag completes. */
  onReorder: (items: T[]) => void;
  /** Render each item. The wrapper provides the sortable ref, transform, and drag handle. */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Additional classes on the outer container. */
  className?: string;
}

/**
 * Generic drag-and-drop sortable list.
 *
 * Reuses the same DnD-kit sensor configuration and vertical sort strategy
 * used by the sidebar edit view. Wrap each child in `<SortableItem>` to
 * get the grip handle and drag styling for free.
 */
export function SortableList<T>({ items, getItemId, onReorder, renderItem, className }: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const sortableIds = items.map(getItemId);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortableIds.indexOf(active.id as string);
    const newIndex = sortableIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
  }, [sortableIds, items, onReorder]);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {items.map((item, i) => renderItem(item, i))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ── Generic sortable item wrapper ────────────────────────────────────────────

export interface SortableItemProps {
  /** Must match the id returned by `getItemId` for this item. */
  id: string;
  /** When false the grip handle is hidden and dragging is disabled. */
  enabled?: boolean;
  /** Additional classes on the wrapper div. */
  className?: string;
  /** Classes applied while the item is being dragged. */
  draggingClassName?: string;
  /** Override the grip handle width class (default: "w-8"). */
  gripClassName?: string;
  children: React.ReactNode;
}

/**
 * Wraps a single child with `useSortable` and renders a grip-vertical
 * drag handle. Shares the same visual pattern as the sidebar edit view.
 */
export function SortableItem({ id, enabled = true, className, draggingClassName, gripClassName, children }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !enabled });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex transition-colors relative',
        className,
        isDragging && (draggingClassName ?? 'z-10 opacity-80 shadow-lg'),
      )}
    >
      {enabled && (
        <button
          className={cn(
            'flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors',
            gripClassName ?? 'w-8',
          )}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}
