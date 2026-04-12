import { GripVertical, X, Plus } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';

export interface SortableItemShellProps {
  /** The sortable ID (must be unique within the DnD context). */
  id: string;
  /** Whether the sidebar is in editing mode. */
  editing: boolean;
  /** Called when the remove (X) button is clicked. */
  onRemove: (id: string) => void;
  /** Called when the add (+) button is clicked (below-more items). */
  onAdd?: (id: string) => void;
  /** True when this item is below the "More..." separator (hidden zone). */
  belowMore?: boolean;
  /** Label for the add/remove button tooltip. */
  label?: string;
  /** The content to render inside the shell (the Link + icon + label). */
  children: React.ReactNode;
}

/**
 * Shared drag-sortable wrapper for sidebar items.
 * Provides the grip handle, outer container, and add/remove action buttons.
 */
export function SortableItemShell({
  id, editing, onRemove, onAdd, belowMore, label, children,
}: SortableItemShellProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editing });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('flex items-center rounded-full transition-colors relative bg-background/85 hover:bg-secondary/40', isDragging && 'z-10 opacity-80 shadow-lg')}
    >
      {editing && (
        <button
          className="flex items-center justify-center w-8 shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      )}

      {children}

      {editing && (
        belowMore ? (
          <button
            onClick={(e) => { e.stopPropagation(); onAdd?.(id); }}
            className="flex items-center justify-center size-8 shrink-0 rounded-full transition-all text-muted-foreground hover:text-primary hover:bg-primary/10"
            title={label ? `Add ${label}` : 'Add'}
          >
            <Plus className="size-4" />
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(id); }}
            className="flex items-center justify-center size-8 shrink-0 rounded-full transition-all text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            title={label ? `Remove ${label}` : 'Remove'}
          >
            <X className="size-4" />
          </button>
        )
      )}
    </div>
  );
}
