import { useCallback, useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bot, User } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { cn } from '@/lib/utils';
import { useHasUnreadNotifications } from '@/hooks/useHasUnreadNotifications';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useLayoutSnapshot } from '@/contexts/LayoutContext';
import { ArcBackground, ARC_UP_OVERHANG_PX } from '@/components/ArcBackground';
import { MobileSearchSheet } from '@/components/MobileSearchSheet';
import { MobileBuddySheet } from '@/components/AIChat/MobileBuddySheet';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useBuddy } from '@/hooks/useBuddy';
import { getSidebarItem, isSidebarDivider, sidebarItemIcon, itemLabel, itemPath, isItemActive } from '@/lib/sidebarItems';

/** Transform style applied when the bottom nav is hidden (scrolled away). */
const hiddenStyle: React.CSSProperties = {
  transform: `translateY(calc(100% + ${ARC_UP_OVERHANG_PX}px))`,
};

export function MobileBottomNav() {
  const location = useLocation();
  const { user, metadata } = useCurrentUser();
  const hasUnread = useHasUnreadNotifications();
  const { scrollContainer, noArcs } = useLayoutSnapshot();
  const { hidden } = useScrollDirection(scrollContainer);
  const profileUrl = useProfileUrl(user?.pubkey ?? '', metadata);
  const { orderedItems } = useFeedSettings();
  const { config } = useAppContext();
  const homePage = config.homePage;
  const { buddy } = useBuddy();
  const buddyAuthor = useAuthor(buddy?.pubkey);
  const buddyMetadata = buddyAuthor.data?.metadata;

  const [searchOpen, setSearchOpen] = useState(false);
  const [buddyOpen, setBuddyOpen] = useState(false);

  const handleSearchClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setSearchOpen((v) => !v);
    setBuddyOpen(false);
  }, []);

  const handleBuddyClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setBuddyOpen((v) => !v);
    setSearchOpen(false);
  }, []);

  const handleClose = useCallback(() => {
    setSearchOpen(false);
    setBuddyOpen(false);
  }, []);

  const sheetOpen = searchOpen || buddyOpen;

  // Only hide nav on scroll — keep it visible when sheets are open so the
  // user can see the active tab and tap between them.
  const isHidden = hidden && !sheetOpen;

  const displayName = metadata?.name || metadata?.display_name;

  // Show only the first 4 sidebar items (matching sidebar order), filtering out dividers and auth-gated items when logged out
  const allItems = useMemo(() => {
    return orderedItems.filter((id) => {
      if (isSidebarDivider(id)) return false;
      if (!user && getSidebarItem(id)?.requiresAuth) return false;
      return true;
    }).slice(0, 4);
  }, [orderedItems, user]);

  return (
    <>
      {/* Shared backdrop for sheets */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 sidebar:hidden animate-in fade-in-0 duration-150"
          onClick={handleClose}
        />
      )}

      {/* Search and buddy sheets are independent */}
      {searchOpen && <MobileSearchSheet hidden={false} onClose={handleClose} />}
      {buddyOpen && <MobileBuddySheet hidden={false} onClose={handleClose} />}

      <nav
        className={cn(
          'fixed bottom-0 left-0 right-0 z-[49] sidebar:hidden will-change-transform',
          'transition-transform duration-300 ease-in-out',
        )}
        style={isHidden ? hiddenStyle : undefined}
      >
        {/* Arc + items wrapper */}
        <div className="relative">
          <ArcBackground variant={noArcs ? 'rect' : 'up'} />
          <div className="h-11 flex items-center relative">
            {allItems.map((id) => {
              const isSearch = id === 'search';
              const isBuddy = id === 'ai-chat';
              const isProfile = id === 'profile';
              const isNotifications = id === 'notifications';
              const active = isSearch
                ? searchOpen
                : isBuddy
                  ? buddyOpen
                  : isItemActive(id, location.pathname, location.search, profileUrl, homePage);
              const label = itemLabel(id);
              const path = isProfile ? profileUrl : itemPath(id, undefined, homePage);

              // Search opens the search sheet instead of navigating
              if (isSearch) {
                return (
                  <button
                    key={id}
                    onClick={handleSearchClick}
                    className={cn(
                      'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors',
                      active ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {sidebarItemIcon(id, 'size-5')}
                    <span className="text-[10px] font-medium">{label}</span>
                  </button>
                );
              }

              // Buddy opens the AI chat sheet instead of navigating
              if (isBuddy) {
                const hasBuddyPicture = !!buddyMetadata?.picture;
                return (
                  <button
                    key={id}
                    onClick={handleBuddyClick}
                    className={cn(
                      'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors',
                      active ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {hasBuddyPicture ? (
                      <Avatar shape={getAvatarShape(buddyMetadata)} className="size-5">
                        <AvatarImage src={buddyMetadata.picture} alt={buddy?.name} />
                        <AvatarFallback className="bg-primary/20 text-primary text-[8px]">
                          <Bot className="size-3" />
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      sidebarItemIcon(id, 'size-5')
                    )}
                    <span className="text-[10px] font-medium">{hasBuddyPicture ? buddy?.name ?? label : label}</span>
                  </button>
                );
              }

              // Profile shows the user avatar
              if (isProfile && user) {
                return (
                  <Link
                    key={id}
                    to={path}
                    onClick={handleClose}
                    className={cn(
                      'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors',
                      active ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    <Avatar shape={getAvatarShape(metadata)} className="size-5">
                      <AvatarImage src={metadata?.picture} alt={displayName} />
                      <AvatarFallback className="bg-primary/20 text-primary text-[8px]">
                        {displayName?.[0]?.toUpperCase() || <User className="size-3" />}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-[10px] font-medium">{label}</span>
                  </Link>
                );
              }

              return (
                <Link
                  key={id}
                  to={path}
                  onClick={handleClose}
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors',
                    active ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  <span className="relative">
                    {sidebarItemIcon(id, 'size-5')}
                    {isNotifications && hasUnread && (
                      <span className="absolute -top-1 right-0 size-2 bg-primary rounded-full" />
                    )}
                  </span>
                  <span className="text-[10px] font-medium">{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
        {/* Safe area fill — matches the arc's semi-transparent background */}
        <div className="safe-area-bottom bg-background/85" />
      </nav>
    </>
  );
}
