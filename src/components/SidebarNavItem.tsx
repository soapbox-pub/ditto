import { Link } from 'react-router-dom';
import { GripVertical, X } from 'lucide-react';
import { useIntl } from 'react-intl';
import { ReorderList } from '@/components/ReorderList';
import { useReorderItem } from '@/hooks/useReorderItem';
import { arrayMove } from '@/lib/sortable';
import { sidebarItemIcon, itemPath, useItemLabel, isSidebarDivider, isNostrUri, isExternalUri, isNsiteUri } from '@/lib/sidebarItems';
import { cn } from '@/lib/utils';
import { useCallback } from 'react';
import { NostrEventSidebarItem } from '@/components/NostrEventSidebarItem';
import { NsiteSidebarItem } from '@/components/NsiteSidebarItem';
import { ExternalContentSidebarItem } from '@/components/ExternalContentSidebarItem';

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
  /** Sidebar item ID configured as the homepage. */
  homePage?: string;
}

export function SidebarNavItem({
  id, active, editing, onRemove, onClick, profilePath, showIndicator, linkClassName, homePage,
}: SidebarNavItemProps) {
  const { setNodeRef, handleProps, isDragging } = useReorderItem(id, { disabled: !editing });
  const icon = sidebarItemIcon(id);
  const label = useItemLabel(id);
  const path = itemPath(id, profilePath, homePage);
  const intl = useIntl();

  return (
    <div
      ref={setNodeRef}
      className={cn('flex items-center rounded-full transition-colors relative bg-background/85', isDragging && 'opacity-40')}
    >
      {editing && (
        <button
          {...handleProps}
          aria-label={intl.formatMessage({ id: 'sortable.dragHandle', defaultMessage: 'Drag to reorder, or use the arrow keys' })}
          className="flex items-center justify-center w-8 self-stretch shrink-0 rounded-full cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        <span className="truncate" style={{ fontFamily: 'var(--title-font-family, inherit)' }}>{label}</span>
      </Link>

      {editing && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(id); }}
          className="flex items-center justify-center size-8 shrink-0 rounded-full transition-all text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          title={intl.formatMessage({ id: 'sidebar.removeItem', defaultMessage: "Remove {label}" }, { label })}
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
  const { setNodeRef, handleProps, isDragging } = useReorderItem(sortableId, { disabled: !editing });
  const intl = useIntl();

  return (
    <div
      ref={setNodeRef}
      className={cn('flex items-center rounded-full transition-colors relative', editing && 'bg-background/85', isDragging && 'opacity-40')}
    >
      {editing && (
        <button
          {...handleProps}
          aria-label={intl.formatMessage({ id: 'sortable.dragHandle', defaultMessage: 'Drag to reorder, or use the arrow keys' })}
          className="flex items-center justify-center w-8 self-stretch shrink-0 rounded-full cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          title={intl.formatMessage({ id: 'sidebar.removeDivider', defaultMessage: "Remove divider" })}
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

// ── Reorderable nav list ────────────────────────────────────────────────────────

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
  /** Sidebar item ID configured as the homepage. */
  homePage?: string;
}

export function SidebarNavList({
  items, editing, onRemove, onReorder, isActive, getOnClick, getProfilePath, getShowIndicator, linkClassName, homePage,
}: SidebarNavListProps) {
  // Dividers are keyed by occurrence, not position, so moving an item past one doesn't
  // rename it (which would mis-key both React and the drop animation).
  let dividers = 0;
  const sortableIds = items.map((id) => isSidebarDivider(id) ? `divider-${dividers++}` : id);

  const handleMove = useCallback(
    (from: number, to: number) => onReorder(arrayMove(items, from, to)),
    [items, onReorder],
  );

  return (
    <ReorderList ids={sortableIds} onMove={handleMove} disabled={!editing} className="flex flex-col gap-0.5">
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
        if (isNostrUri(id)) {
          return (
            <NostrEventSidebarItem
              key={id}
              id={id}
              active={isActive(id)}
              editing={editing}
              onRemove={(removeId) => onRemove(removeId, i)}
              onClick={getOnClick?.(id)}
              linkClassName={linkClassName}
            />
          );
        }
        if (isNsiteUri(id)) {
          return (
            <NsiteSidebarItem
              key={id}
              id={id}
              active={isActive(id)}
              editing={editing}
              onRemove={(removeId) => onRemove(removeId, i)}
              onClick={getOnClick?.(id)}
              linkClassName={linkClassName}
            />
          );
        }
        if (isExternalUri(id)) {
          return (
            <ExternalContentSidebarItem
              key={id}
              id={id}
              active={isActive(id)}
              editing={editing}
              onRemove={(removeId) => onRemove(removeId, i)}
              onClick={getOnClick?.(id)}
              linkClassName={linkClassName}
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
            homePage={homePage}
          />
        );
      })}
    </ReorderList>
  );
}
