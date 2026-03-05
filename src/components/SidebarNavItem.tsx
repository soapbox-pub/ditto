import { Link } from 'react-router-dom';
import { GripVertical, X } from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { sidebarItemIcon, itemLabel, itemPath, isSidebarDivider } from '@/lib/sidebarItems';
import { cn } from '@/lib/utils';
import { useCallback } from 'react';

// ── Sortable item ─────────────────────────────────────────────────────────────

export interface SidebarNavItemProps {
  id: string;
  active: boolean;
  editing: boolean;
  onRemove: (id: string, index?: number) => void;
  onClick?: (e: React.MouseEvent) => void;
  profilePath?: string;
  showIndicator?: boolean;
  /** Extra classes on the link. Defaults to 'text-lg' for desktop. */
  linkClassName?: string;
}

export function SidebarNavItem({
  id, active, editing, onRemove, onClick, profilePath, showIndicator, linkClassName,
}: SidebarNavItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editing });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const icon = sidebarItemIcon(id);
  const label = itemLabel(id);
  const path = itemPath(id, profilePath);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('flex items-center rounded-full transition-colors relative bg-background/85', isDragging && 'z-10 opacity-80 shadow-lg')}
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

      <Link
        to={path}
        onClick={onClick}
        className={cn(
          'flex items-center gap-4 py-3 rounded-full transition-colors hover:bg-secondary/60 flex-1 min-w-0',
          editing ? 'px-2' : 'px-3',
          active ? 'font-bold text-primary' : 'font-normal text-foreground',
          linkClassName ?? 'text-lg',
        )}
      >
        <span className="shrink-0 relative">
          {icon}
          {showIndicator && (
            <span className="absolute -top-1 right-0 size-2.5 bg-primary rounded-full" />
          )}
        </span>
        <span className="truncate">{label}</span>
      </Link>

      {editing && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(id); }}
          className="flex items-center justify-center size-8 shrink-0 rounded-full transition-all text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          title={`Remove ${label}`}
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

// ── Divider item ──────────────────────────────────────────────────────────────

interface SidebarDividerItemProps {
  sortableId: string;
  editing: boolean;
  onRemove: () => void;
}

function SidebarDividerItem({ sortableId, editing, onRemove }: SidebarDividerItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId, disabled: !editing });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('flex items-center rounded-full transition-colors relative', editing && 'bg-background/85', isDragging && 'z-10 opacity-80 shadow-lg')}
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
      <div className={cn('flex-1 flex items-center py-3', editing ? 'px-2' : 'px-3')}>
        <div className="h-px w-full bg-border" />
      </div>
      {editing && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="flex items-center justify-center size-8 shrink-0 rounded-full transition-all text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          title="Remove divider"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

// ── DnD-aware nav list ────────────────────────────────────────────────────────

export interface SidebarNavListProps {
  items: string[];
  editing: boolean;
  onRemove: (id: string, index?: number) => void;
  onReorder: (newOrder: string[]) => void;
  isActive: (id: string) => boolean;
  getOnClick?: (id: string) => ((e: React.MouseEvent) => void) | undefined;
  getProfilePath?: (id: string) => string | undefined;
  getShowIndicator?: (id: string) => boolean | undefined;
  linkClassName?: string;
}

export function SidebarNavList({
  items, editing, onRemove, onReorder, isActive, getOnClick, getProfilePath, getShowIndicator, linkClassName,
}: SidebarNavListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // Assign unique sortable IDs: regular items use their id, dividers get "divider-{index}"
  const sortableIds = items.map((id, i) => isSidebarDivider(id) ? `divider-${i}` : id);

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
        {items.map((id, i) => {
          const sortableId = sortableIds[i];
          if (isSidebarDivider(id)) {
            return (
              <SidebarDividerItem
                key={sortableId}
                sortableId={sortableId}
                editing={editing}
                onRemove={() => onRemove(id, i)}
              />
            );
          }
          return (
            <SidebarNavItem
              key={id}
              id={id}
              active={isActive(id)}
              editing={editing}
              onRemove={(removeId) => onRemove(removeId, i)}
              onClick={getOnClick?.(id)}
              profilePath={getProfilePath?.(id)}
              showIndicator={getShowIndicator?.(id)}
              linkClassName={linkClassName}
            />
          );
        })}
      </SortableContext>
    </DndContext>
  );
}
