import { Link } from 'react-router-dom';
import {
  Bell, Search, TrendingUp, User, Bookmark, Scroll, SwatchBook, Palette,
  GripVertical, X,
} from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PlanetIcon } from '@/components/icons/PlanetIcon';
import { EXTRA_KIND_ICONS } from '@/lib/extraKindIcons';
import { itemLabel, itemPath } from '@/lib/sidebarItems';
import { cn } from '@/lib/utils';
import { useCallback } from 'react';

// ── Icon map ──────────────────────────────────────────────────────────────────

type IconComponent = React.ComponentType<{ className?: string }>;

/** Icon components for built-in system sidebar items. */
const BUILTIN_ICON_COMPONENTS: Record<string, IconComponent> = {
  feed: PlanetIcon,
  notifications: Bell,
  search: Search,
  trends: TrendingUp,
  bookmarks: Bookmark,
  profile: User,
  settings: Scroll,
  theme: SwatchBook,
};

/**
 * Returns the icon element for a sidebar item ID at the given size.
 * Built-in system items are sourced from BUILTIN_ICON_COMPONENTS.
 * Extra-kind items are sourced from EXTRA_KIND_ICONS (the source of truth for non-system items).
 * Falls back to Palette for unknown items.
 */
export function sidebarItemIcon(id: string, size = 'size-6'): React.ReactElement {
  const Icon = BUILTIN_ICON_COMPONENTS[id] ?? EXTRA_KIND_ICONS[id] ?? Palette;
  return <Icon className={size} />;
}



// ── Sortable item ─────────────────────────────────────────────────────────────

export interface SidebarNavItemProps {
  id: string;
  active: boolean;
  editing: boolean;
  onRemove: (id: string) => void;
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

// ── DnD-aware nav list ────────────────────────────────────────────────────────

export interface SidebarNavListProps {
  items: string[];
  editing: boolean;
  onRemove: (id: string) => void;
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

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.indexOf(active.id as string);
    const newIndex = items.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
  }, [items, onReorder]);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {items.map((id) => (
          <SidebarNavItem
            key={id}
            id={id}
            active={isActive(id)}
            editing={editing}
            onRemove={onRemove}
            onClick={getOnClick?.(id)}
            profilePath={getProfilePath?.(id)}
            showIndicator={getShowIndicator?.(id)}
            linkClassName={linkClassName}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}
