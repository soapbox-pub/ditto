import { useState, useCallback } from 'react';

import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  UserPlus, LogOut,
  QrCode,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DittoLogo } from '@/components/DittoLogo';
import { EmojifiedText } from '@/components/CustomEmoji';
import { SidebarNavList } from '@/components/SidebarNavItem';
import { SidebarMoreMenu } from '@/components/SidebarMoreMenu';
import { StatusEditor } from '@/components/StatusEditor';

import LoginDialog from '@/components/auth/LoginDialog';
import { FollowQRDialog } from '@/components/FollowQRDialog';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoggedInAccounts, type Account } from '@/hooks/useLoggedInAccounts';
import { useLoginActions } from '@/hooks/useLoginActions';

import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useSidebarEditing } from '@/hooks/useSidebarEditing';
import { useAppContext } from '@/hooks/useAppContext';
import { useHasUnreadNotifications } from '@/hooks/useHasUnreadNotifications';
import { genUserName } from '@/lib/genUserName';
import { VerifiedNip05Text } from '@/components/Nip05Badge';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { isItemActive } from '@/lib/sidebarItems';




export function LeftSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, metadata, event: currentUserEvent, isLoading: isProfileLoading } = useCurrentUser();
  const currentUserAvatarShape = getAvatarShape(metadata);
  const { currentUser, otherUsers, setLogin } = useLoggedInAccounts();
  const { logout } = useLoginActions();

  const {
    orderedItems, hiddenItems, updateSidebarOrder, addToSidebar, addDividerToSidebar, removeFromSidebar,
  } = useFeedSettings();
  const { config } = useAppContext();



  const hasUnread = useHasUnreadNotifications();
  const userProfileUrl = useProfileUrl(user?.pubkey ?? '', metadata);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const { startSignup } = useOnboarding();
  const [accountPopoverOpen, setAccountPopoverOpen] = useState(false);
  const [followQROpen, setFollowQROpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const homePage = config.homePage;

  const { editingItems, handleEditReorder, handleEditRemove } = useSidebarEditing({
    editing, items: orderedItems, hiddenItems, updateSidebarOrder, removeFromSidebar,
  });

  const scrollToTopIfCurrent = useCallback((to: string) => (e: React.MouseEvent) => {
    if (location.pathname === to) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location.pathname]);

  const getDisplayName = (account: Account) => account.metadata.display_name || account.metadata.name || genUserName(account.pubkey);

  const handleLogout = async () => {
    setAccountPopoverOpen(false);
    await logout();
    navigate('/');
  };

  return (
    <aside className="flex flex-col h-screen sticky top-0 py-3 px-4 w-[300px] shrink-0">
      {/* Logo */}
      <div className="flex items-center px-3 mb-1">
        <Link to="/" onClick={scrollToTopIfCurrent('/')}>
          <div className="bg-background/85 rounded-full">
            <DittoLogo size={48} />
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {editing ? (
          <>
            <SidebarNavList
              items={editingItems}
              editing
              onRemove={handleEditRemove}
              onAdd={addToSidebar}
              onReorder={handleEditReorder}
              isActive={() => false}
              homePage={homePage}
              inlineSearch
            />
            <SidebarMoreMenu
              editing
              hiddenItems={hiddenItems}
              onDoneEditing={() => setEditing(false)}
              onStartEditing={() => setEditing(true)}
              onAdd={addToSidebar}
              onAddDivider={addDividerToSidebar}
              homePage={homePage}
            />
          </>
        ) : (
          <>
            <SidebarNavList
              items={orderedItems}
              editing={false}
              onRemove={removeFromSidebar}
              onReorder={updateSidebarOrder}
              isActive={(id) => isItemActive(id, location.pathname, location.search, userProfileUrl, homePage)}
              getOnClick={(id) => id === homePage ? scrollToTopIfCurrent('/') : undefined}
              getProfilePath={(id) => id === 'profile' ? userProfileUrl : undefined}
              getShowIndicator={(id) => id === 'notifications' ? hasUnread : undefined}
              homePage={homePage}
              inlineSearch
            />
            <SidebarMoreMenu
              editing={false}
              hiddenItems={hiddenItems}
              onDoneEditing={() => setEditing(false)}
              onStartEditing={() => setEditing(true)}
              onAdd={addToSidebar}
              onAddDivider={addDividerToSidebar}
              homePage={homePage}
            />
          </>
        )}
      </nav>

      {/* Logged-out join pill — same position as account button, pushed up from bottom */}
      {!user && location.pathname !== '/' && (
        <div className="pt-2 pb-1">
          <button
            onClick={() => setLoginDialogOpen(true)}
            className="flex items-center justify-center w-full h-10 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors cursor-pointer"
          >
            Join
          </button>
        </div>
      )}

      {/* User profile at bottom */}
      {user && currentUser && (
        <div className="pt-2">
          <Popover open={accountPopoverOpen} onOpenChange={setAccountPopoverOpen}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-3 p-3 rounded-full hover:bg-secondary/60 transition-colors cursor-pointer w-full text-left bg-background/85">
                {isProfileLoading ? (
                  <Skeleton className="size-10 shrink-0 rounded-full" />
                ) : (
                  <Avatar shape={currentUserAvatarShape} className="size-10 shrink-0">
                    <AvatarImage src={metadata?.picture} alt={metadata?.name} />
                    <AvatarFallback className="bg-primary/20 text-primary text-sm">
                      {(metadata?.display_name || metadata?.name || genUserName(user.pubkey))[0]?.toUpperCase() ?? '?'}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className="flex flex-col min-w-0 flex-1 gap-1">
                  {isProfileLoading ? (
                    <><Skeleton className="h-3.5 w-24" /><Skeleton className="h-3 w-16" /></>
                  ) : (
                    <>
                      <span className="font-semibold text-sm truncate">
                        {currentUserEvent && metadata?.name
                          ? <EmojifiedText tags={currentUserEvent.tags}>{metadata.name}</EmojifiedText>
                          : (metadata?.name || genUserName(user.pubkey))}
                      </span>
                      {metadata?.nip05 && (
                        <VerifiedNip05Text nip05={metadata.nip05} pubkey={user.pubkey} className="text-xs text-muted-foreground truncate" />
                      )}
                    </>
                  )}
                </div>
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" sideOffset={8} className="w-[260px] p-0 rounded-2xl shadow-xl border border-border overflow-hidden">
              {/* Current user */}
              <Link to={userProfileUrl} onClick={() => setAccountPopoverOpen(false)} className="block p-4 border-b border-border hover:bg-secondary/60 transition-colors">
                <div className="flex items-center gap-3">
                  <Avatar shape={currentUserAvatarShape} className="size-11 shrink-0">
                    <AvatarImage src={currentUser.metadata.picture} alt={getDisplayName(currentUser)} />
                    <AvatarFallback className="bg-primary/20 text-primary text-sm">{getDisplayName(currentUser).charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-sm truncate">
                      {currentUser.event ? <EmojifiedText tags={currentUser.event.tags}>{getDisplayName(currentUser)}</EmojifiedText> : getDisplayName(currentUser)}
                    </span>
                    {currentUser.metadata.nip05 && (
                      <VerifiedNip05Text nip05={currentUser.metadata.nip05} pubkey={currentUser.pubkey} className="text-xs text-muted-foreground truncate" />
                    )}
                  </div>
                </div>
              </Link>

              {/* Status editor */}
              <div className="border-b border-border">
                <StatusEditor pubkey={user.pubkey} />
              </div>

              {/* Other accounts */}
              {otherUsers.length > 0 && (
                <div className="border-b border-border">
                  {otherUsers.map((account) => (
                    <button key={account.id} onClick={() => { setLogin(account.id); setAccountPopoverOpen(false); }} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-secondary/60 transition-colors">
                      <Avatar shape={getAvatarShape(account.metadata)} className="size-9 shrink-0">
                        <AvatarImage src={account.metadata.picture} alt={getDisplayName(account)} />
                        <AvatarFallback className="bg-primary/20 text-primary text-xs">{getDisplayName(account).charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium truncate">
                          {account.event ? <EmojifiedText tags={account.event.tags}>{getDisplayName(account)}</EmojifiedText> : getDisplayName(account)}
                        </span>
                        {account.metadata.nip05 && <VerifiedNip05Text nip05={account.metadata.nip05} pubkey={account.pubkey} className="text-xs text-muted-foreground truncate" />}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="py-1">
                <button onClick={() => { setAccountPopoverOpen(false); setFollowQROpen(true); }} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium hover:bg-secondary/60 transition-colors">
                  <QrCode className="size-4 text-muted-foreground" />
                  <span>Share profile</span>
                </button>
                <button onClick={() => { setAccountPopoverOpen(false); setLoginDialogOpen(true); }} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium hover:bg-secondary/60 transition-colors">
                  <UserPlus className="size-4 text-muted-foreground" />
                  <span>Add another account</span>
                </button>
                <button onClick={handleLogout} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors">
                  <LogOut className="size-4" />
                  <span>Log out @{metadata?.name || genUserName(user.pubkey)}</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

      <LoginDialog isOpen={loginDialogOpen} onClose={() => setLoginDialogOpen(false)} onLogin={() => setLoginDialogOpen(false)} onSignupClick={startSignup} />
      <FollowQRDialog open={followQROpen} onOpenChange={setFollowQROpen} />
    </aside>
  );
}
