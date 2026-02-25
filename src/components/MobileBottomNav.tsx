import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Compass, Bell, User, Search, Bookmark, TrendingUp, Clapperboard, BarChart3, Palette, PartyPopper, Radio, FileText, Pencil, GripVertical, X, Plus } from 'lucide-react';
import { DndContext, closestCenter, TouchSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { ChestIcon } from '@/components/icons/ChestIcon';
import { CardsIcon } from '@/components/icons/CardsIcon';
import { cn } from '@/lib/utils';
import { useHasUnreadNotifications } from '@/hooks/useHasUnreadNotifications';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFeedSettings, getBuiltinItem } from '@/hooks/useFeedSettings';
import { EXTRA_KINDS } from '@/lib/extraKinds';
import { useProfileUrl } from '@/hooks/useProfileUrl';

// ── Icon map for explore items ────────────────────────────────────────────────

const ITEM_ICONS: Record<string, React.ReactElement> = {
  __feed: <Home className="size-5" />,
  __trends: <TrendingUp className="size-5" />,
  __bookmarks: <Bookmark className="size-5" />,
  vines: <Clapperboard className="size-5" />,
  polls: <BarChart3 className="size-5" />,
  treasures: <ChestIcon className="size-5" />,
  colors: <Palette className="size-5" />,
  packs: <PartyPopper className="size-5" />,
  streams: <Radio className="size-5" />,
  articles: <FileText className="size-5" />,
  decks: <CardsIcon className="size-5" />,
};

function itemLabel(id: string): string {
  const builtin = getBuiltinItem(id);
  if (builtin) return builtin.label;
  return EXTRA_KINDS.find((d) => d.route === id)?.label ?? id;
}

function itemPath(id: string): string {
  const builtin = getBuiltinItem(id);
  if (builtin) return builtin.path;
  return `/${id}`;
}

function isItemActive(id: string, pathname: string, search: string): boolean {
  if (id === '__feed') return pathname === '/';
  if (id === '__trends') return pathname === '/search' && search.includes('tab=trends');
  if (id === '__bookmarks') return pathname === '/bookmarks';
  return pathname === `/${id}`;
}

// ── Tab component ─────────────────────────────────────────────────────────────

interface NavTabProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  showIndicator?: boolean;
  onClick?: () => void;
  to?: string;
}

function NavTab({ icon, label, active, showIndicator, onClick, to }: NavTabProps) {
  const content = (
    <>
      <span className="relative">
        {icon}
        {showIndicator && (
          <span className="absolute top-0 right-0 size-2 bg-primary rounded-full" />
        )}
      </span>
      <span className="text-[10px] font-medium">{label}</span>
    </>
  );

  const className = cn(
    'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors',
    active ? 'text-foreground' : 'text-muted-foreground',
  );

  if (to) {
    return (
      <Link to={to} onClick={onClick} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={className}>
      {content}
    </button>
  );
}

// ── Sortable explore item (edit mode) ─────────────────────────────────────────

interface SortableExploreSheetItemProps {
  id: string;
  onRemove: (id: string) => void;
}

function SortableExploreSheetItem({ id, onRemove }: SortableExploreSheetItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const icon = ITEM_ICONS[id] ?? <Palette className="size-5" />;
  const label = itemLabel(id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center rounded-lg transition-colors',
        isDragging && 'z-10 opacity-80 shadow-lg bg-background',
      )}
    >
      <button
        className="flex items-center justify-center w-8 shrink-0 py-3 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <div className="flex items-center gap-3 py-3 flex-1 min-w-0 text-[15px]">
        <span className="text-muted-foreground shrink-0">{icon}</span>
        <span className="font-medium truncate">{label}</span>
      </div>

      <button
        onClick={() => onRemove(id)}
        className="flex items-center justify-center size-8 shrink-0 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MobileBottomNav() {
  const location = useLocation();
  const { user, metadata } = useCurrentUser();
  const hasUnread = useHasUnreadNotifications();
  const {
    orderedItems, hiddenItems, updateSidebarOrder, addToSidebar, removeFromSidebar,
  } = useFeedSettings();
  const userProfileUrl = useProfileUrl(user?.pubkey ?? '', metadata);
  const [exploreOpen, setExploreOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  // DnD sensors — touch sensor with delay to distinguish scroll from drag
  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedItems.indexOf(active.id as string);
    const newIndex = orderedItems.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(orderedItems, oldIndex, newIndex);
    updateSidebarOrder(newOrder);
  }, [orderedItems, updateSidebarOrder]);

  // Build explore items from ordered items (includes built-ins)
  const exploreItems = useMemo(() => {
    return orderedItems.map((id) => ({
      id,
      icon: ITEM_ICONS[id] ?? <Palette className="size-5" />,
      label: itemLabel(id),
      path: itemPath(id),
    }));
  }, [orderedItems]);

  // Check if current path matches any explore route
  const isExploreActive = orderedItems.some((id) =>
    isItemActive(id, location.pathname, location.search),
  );

  const handleDrawerClose = (open: boolean) => {
    if (!open) setEditing(false);
    setExploreOpen(open);
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-20 flex items-center bg-background/80 backdrop-blur-md border-t border-border sidebar:hidden safe-area-bottom">
        {user && (
          <>
            <NavTab
              to={userProfileUrl}
              icon={<User className="size-5" />}
              label="You"
              active={location.pathname === userProfileUrl}
            />
            <NavTab
              to="/notifications"
              icon={<Bell className="size-5" />}
              label="Notifications"
              active={location.pathname === '/notifications'}
              showIndicator={hasUnread}
            />
          </>
        )}
        <NavTab
          icon={<Compass className="size-5" />}
          label="Explore"
          active={isExploreActive}
          onClick={() => setExploreOpen(true)}
        />
        <NavTab
          to="/search"
          icon={<Search className="size-5" />}
          label="Search"
          active={location.pathname === '/search'}
        />
      </nav>

      {/* Explore bottom sheet */}
      <Drawer open={exploreOpen} onOpenChange={handleDrawerClose} dismissible>
        <DrawerContent className="max-h-[60vh]">
          <DrawerTitle className="sr-only">Explore</DrawerTitle>
          <div className="px-4 pt-2 pb-6">
            {/* Section header with edit toggle */}
            <div className="flex items-center gap-2 px-2 mb-3">
              <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70">
                Explore
              </span>
              <div className="flex-1 h-px bg-border/50" />
              <button
                onClick={() => setEditing(!editing)}
                className={cn(
                  'text-xs font-medium transition-colors px-2 py-0.5 rounded-full',
                  editing
                    ? 'text-primary hover:bg-primary/10'
                    : 'text-muted-foreground/70 hover:text-muted-foreground hover:bg-secondary/60',
                )}
              >
                {editing ? 'Done' : <Pencil className="size-3.5" />}
              </button>
            </div>

            {editing ? (
              /* ── Edit mode: single-column sortable list ── */
              <>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={orderedItems}
                    strategy={verticalListSortingStrategy}
                  >
                    {orderedItems.map((id) => (
                      <SortableExploreSheetItem
                        key={id}
                        id={id}
                        onRemove={removeFromSidebar}
                      />
                    ))}
                  </SortableContext>
                </DndContext>

                {/* Add hidden items back */}
                {hiddenItems.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {hiddenItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => addToSidebar(item.id)}
                        className="flex items-center gap-3 w-full py-3 px-2 rounded-lg text-[15px] text-muted-foreground/60 hover:text-muted-foreground hover:bg-secondary/40 transition-colors"
                      >
                        <Plus className="size-4 ml-2" />
                        <span className="flex items-center gap-3">
                          {ITEM_ICONS[item.id] && (
                            <span className="[&>svg]:size-4">{ITEM_ICONS[item.id]}</span>
                          )}
                          <span>{item.label}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              /* ── Normal mode: 2-column grid of links ── */
              exploreItems.length > 0 ? (
                <div className="grid grid-cols-2 gap-1">
                  {exploreItems.map((item) => (
                    <Link
                      key={item.id}
                      to={item.path}
                      onClick={() => setExploreOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3.5 rounded-xl transition-colors',
                        isItemActive(item.id, location.pathname, location.search)
                          ? 'bg-primary/10 text-primary font-semibold'
                          : 'text-foreground hover:bg-secondary/60',
                      )}
                    >
                      <span className="shrink-0 text-muted-foreground">{item.icon}</span>
                      <span className="text-[15px] truncate">{item.label}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No content sections enabled. Tap the pencil to add some.
                </p>
              )
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
