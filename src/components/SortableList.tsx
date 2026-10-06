import { useCallback } from 'react';
import { GripVertical } from 'lucide-react';
import { useIntl } from 'react-intl';

import { ReorderList } from '@/components/ReorderList';
import { useReorderItem } from '@/hooks/useReorderItem';
import { arrayMove } from '@/lib/sortable';
import { cn } from '@/lib/utils';

// ── Generic sortable list container ──────────────────────────────────────────

export interface SortableListProps<T> {
  /** Items in current order. */
  items: T[];
  /** Extract a unique stable string id from each item. */
  getItemId: (item: T, index: number) => string;
  /** Called with the reordered items array after a drag completes. */
  onReorder?: (items: T[]) => void;
  /** Called with the moved row's old and new index; for callers that move in place (`useFieldArray`). */
  onMove?: (from: number, to: number) => void;
  /** Render each item. Wrap it in `<SortableItem>` for the grip handle. */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Additional classes on the outer container. */
  className?: string;
}

/**
 * Generic drag-and-drop sortable list, on the same {@link ReorderList} machinery as the
 * sidebar edit view. Wrap each child in `<SortableItem>` to get the grip handle.
 */
export function SortableList<T>({ items, getItemId, onReorder, onMove, renderItem, className }: SortableListProps<T>) {
  const ids = items.map(getItemId);

  const handleMove = useCallback((from: number, to: number) => {
    onMove?.(from, to);
    onReorder?.(arrayMove(items, from, to));
  }, [items, onMove, onReorder]);

  return (
    <ReorderList ids={ids} onMove={handleMove} className={className}>
      {items.map((item, i) => renderItem(item, i))}
    </ReorderList>
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
  /** Classes on the row left behind while its ghost is being dragged. */
  draggingClassName?: string;
  /** Override the grip handle width class (default: "w-8"). */
  gripClassName?: string;
  children: React.ReactNode;
}

/** Wraps a single child with a grip-vertical drag handle, like the sidebar edit view. */
export function SortableItem({ id, enabled = true, className, draggingClassName, gripClassName, children }: SortableItemProps) {
  const { setNodeRef, handleProps, isDragging } = useReorderItem(id, { disabled: !enabled });
  const intl = useIntl();

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex transition-[colors,opacity] relative',
        className,
        isDragging && (draggingClassName ?? 'opacity-40'),
      )}
    >
      {enabled && (
        <button
          {...handleProps}
          aria-label={intl.formatMessage({ id: 'sortable.dragHandle', defaultMessage: 'Drag to reorder, or use the arrow keys' })}
          className={cn(
            'flex items-center justify-center shrink-0 rounded cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
            gripClassName ?? 'w-8',
          )}
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
