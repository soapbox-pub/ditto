import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Compass, Bell, User, Search, TrendingUp, Clapperboard, BarChart3, Palette, PartyPopper, Radio, FileText } from 'lucide-react';
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

// ── Main component ────────────────────────────────────────────────────────────

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, metadata } = useCurrentUser();
  const hasUnread = useHasUnreadNotifications();
  const { orderedItems } = useFeedSettings();
  const userProfileUrl = useProfileUrl(user?.pubkey ?? '', metadata);
  const [exploreOpen, setExploreOpen] = useState(false);

  const handleHomeClick = useCallback(() => {
    if (location.pathname === '/') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location.pathname]);

  // Build explore items from ordered items (includes built-ins)
  const exploreItems = useMemo(() => {
    return orderedItems.map((id) => ({
      id,
      icon: ITEM_ICONS[id] ?? <Palette className="size-5" />,
      label: itemLabel(id),
      path: itemPath(id),
    }));
  }, [orderedItems]);

  // Check if current path matches any explore route (excluding __feed which is the Home tab)
  const isExploreActive = orderedItems.some((id) =>
    id !== '__feed' && isItemActive(id, location.pathname, location.search),
  );

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-20 flex items-center bg-background/80 backdrop-blur-md border-t border-border sidebar:hidden safe-area-bottom">
        <NavTab
          to="/"
          icon={<Home className="size-5" />}
          label="Home"
          active={location.pathname === '/'}
          onClick={handleHomeClick}
        />
        <NavTab
          icon={<Compass className="size-5" />}
          label="Explore"
          active={isExploreActive}
          onClick={() => setExploreOpen(true)}
        />
        {user ? (
          <>
            <NavTab
              to="/notifications"
              icon={<Bell className="size-5" />}
              label="Notifications"
              active={location.pathname === '/notifications'}
              showIndicator={hasUnread}
            />
            <NavTab
              to={userProfileUrl}
              icon={<User className="size-5" />}
              label="You"
              active={location.pathname === userProfileUrl}
            />
          </>
        ) : (
          <NavTab
            to="/search"
            icon={<Search className="size-5" />}
            label="Search"
            active={location.pathname === '/search'}
          />
        )}
      </nav>

      {/* Explore bottom sheet */}
      <Drawer open={exploreOpen} onOpenChange={setExploreOpen} dismissible>
        <DrawerContent className="max-h-[60vh]">
          <DrawerTitle className="sr-only">Explore</DrawerTitle>
          <div className="px-4 pt-2 pb-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3 px-2">
              Explore
            </h3>
            {exploreItems.length > 0 ? (
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
                No content sections enabled. Go to Settings to add some.
              </p>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
