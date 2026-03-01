import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronUp, LogOut, UserPlus } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { SidebarNavList } from '@/components/SidebarNavItem';
import { SidebarMoreMenu } from '@/components/SidebarMoreMenu';
import { SidebarThemeDropdown } from '@/components/SidebarThemeDropdown';
import { LoginArea } from '@/components/auth/LoginArea';
import { EmojifiedText } from '@/components/CustomEmoji';
import LoginDialog from '@/components/auth/LoginDialog';
import { useOnboarding } from '@/components/InitialSyncGate';
import { genUserName } from '@/lib/genUserName';
import { VerifiedNip05Text } from '@/components/Nip05Badge';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useLoggedInAccounts, type Account } from '@/hooks/useLoggedInAccounts';
import { useFeedSettings, getBuiltinItem } from '@/hooks/useFeedSettings';
import { useHasUnreadNotifications } from '@/hooks/useHasUnreadNotifications';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { isItemActive } from '@/lib/sidebarItems';

interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileDrawer({ open, onOpenChange }: MobileDrawerProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, metadata, event: currentUserEvent } = useCurrentUser();
  const userProfileUrl = useProfileUrl(user?.pubkey ?? '', metadata);
  const { logout } = useLoginActions();
  const { otherUsers, setLogin } = useLoggedInAccounts();
  const { orderedItems, hiddenItems, addToSidebar, removeFromSidebar, updateSidebarOrder } = useFeedSettings();
  const hasUnread = useHasUnreadNotifications();
  const [editing, setEditing] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [accountExpanded, setAccountExpanded] = useState(false);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const { startSignup } = useOnboarding();

  /** Items already covered by the mobile bottom nav — hide from the drawer. */
  const BOTTOM_NAV_ITEMS = new Set(['feed', 'notifications', 'search']);

  const visibleItems = useMemo(() => {
    const items = orderedItems.filter((id) => !BOTTOM_NAV_ITEMS.has(id));
    if (user) return items;
    return items.filter((id) => !getBuiltinItem(id)?.requiresAuth);
  }, [orderedItems, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleHiddenItems = useMemo(() => {
    const items = hiddenItems.filter((item) => !BOTTOM_NAV_ITEMS.has(item.id));
    if (user) return items;
    return items.filter((item) => !getBuiltinItem(item.id)?.requiresAuth);
  }, [hiddenItems, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => { onOpenChange(false); setMoreMenuOpen(false); };
  const handleLogout = async () => { await logout(); handleClose(); navigate('/'); };
  const getDisplayName = (account: Account) => account.metadata.name ?? genUserName(account.pubkey);
  const displayName = metadata?.name || (user ? genUserName(user.pubkey) : 'Anonymous');

  return (
    <>
        <Sheet open={open} onOpenChange={(v) => { if (!v) setMoreMenuOpen(false); onOpenChange(v); }}>
        <SheetContent side="left" className="w-[300px] p-0 gap-0 border-r-border flex flex-col bg-transparent">
          <SheetTitle className="sr-only">Navigation menu</SheetTitle>

          {user ? (
            <div className="flex flex-col h-full py-2 px-2 gap-1">
              {/* User row with caret */}
              <button
                onClick={() => setAccountExpanded((v) => !v)}
                className="flex items-center gap-3 px-3 hover:bg-secondary/60 transition-colors w-full text-left bg-background/85 rounded-xl"
                style={{ minHeight: `calc(3rem + env(safe-area-inset-top, 0px))`, paddingTop: `env(safe-area-inset-top, 0px)` }}
              >
                <Avatar className="size-7 shrink-0">
                  <AvatarImage src={metadata?.picture} alt={displayName} />
                  <AvatarFallback className="bg-primary/20 text-primary text-xs">
                    {displayName[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-semibold text-sm truncate">
                    {currentUserEvent && metadata?.name
                      ? <EmojifiedText tags={currentUserEvent.tags}>{metadata.name}</EmojifiedText>
                      : displayName}
                  </span>
                  {metadata?.nip05 && (
                    <VerifiedNip05Text nip05={metadata.nip05} pubkey={user.pubkey} className="text-xs text-muted-foreground truncate" />
                  )}
                </div>
                {accountExpanded
                  ? <ChevronUp className="size-4 text-muted-foreground shrink-0 mr-1" />
                  : <ChevronDown className="size-4 text-muted-foreground shrink-0 mr-1" />
                }
              </button>

              {/* Expanded account actions */}
              {accountExpanded && (
                <div className="bg-background/85 rounded-xl overflow-hidden">
                  {otherUsers.map((account) => (
                    <button
                      key={account.id}
                      onClick={() => { setLogin(account.id); handleClose(); }}
                      className="flex items-center gap-3 w-full px-3 py-2 hover:bg-secondary/60 transition-colors"
                    >
                      <Avatar className="size-7 shrink-0">
                        <AvatarImage src={account.metadata.picture} alt={getDisplayName(account)} />
                        <AvatarFallback className="bg-primary/20 text-primary text-xs">
                          {getDisplayName(account).charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium truncate">
                          {account.event
                            ? <EmojifiedText tags={account.event.tags}>{getDisplayName(account)}</EmojifiedText>
                            : getDisplayName(account)}
                        </span>
                        {account.metadata.nip05 && (
                          <VerifiedNip05Text nip05={account.metadata.nip05} pubkey={account.pubkey} className="text-xs text-muted-foreground truncate" />
                        )}
                      </div>
                    </button>
                  ))}
                  <button
                    onClick={() => { handleClose(); setLoginDialogOpen(true); }}
                    className="flex items-center gap-4 w-full px-4 py-2.5 text-sm font-normal text-muted-foreground hover:bg-secondary/60 transition-colors"
                  >
                    <UserPlus className="size-5 shrink-0" />
                    <span>Add another account</span>
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-4 w-full px-4 py-2.5 text-sm font-normal text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="size-5 shrink-0" />
                    <span>Log out @{metadata?.name || genUserName(user.pubkey)}</span>
                  </button>
                </div>
              )}

              {/* Nav items — scrollable */}
              <nav
                className="flex flex-col gap-0.5 flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-1"
              >
                <SidebarNavList
                  items={visibleItems}
                  editing={editing}
                  onRemove={removeFromSidebar}
                  onReorder={updateSidebarOrder}
                  isActive={(id) => isItemActive(id, location.pathname, location.search, userProfileUrl)}
                  getOnClick={() => handleClose}
                  getProfilePath={(id) => id === 'profile' ? userProfileUrl : undefined}
                  getShowIndicator={(id) => id === 'notifications' ? hasUnread : undefined}
                  linkClassName="text-base"
                />
                <SidebarMoreMenu
                  editing={editing}
                  hiddenItems={visibleHiddenItems}
                  onDoneEditing={() => setEditing(false)}
                  onStartEditing={() => setEditing(true)}
                  onAdd={addToSidebar}
                  onNavigate={handleClose}
                  open={moreMenuOpen}
                  onOpenChange={setMoreMenuOpen}
                  inline
                />
              </nav>

              {/* Theme */}
              <div
                className="bg-background/85 rounded-xl flex items-center"
                style={{ minHeight: '3.5rem', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
              >
                <SidebarThemeDropdown userPubkey={user.pubkey} onNavigate={handleClose} className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium hover:bg-secondary/60 rounded-full transition-colors" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
              <div className="bg-background/85 rounded-xl p-6 w-full text-center space-y-4">
                <p className="text-muted-foreground text-sm">Log in to access all features</p>
                <LoginArea className="w-full flex flex-col" />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <LoginDialog
        isOpen={loginDialogOpen}
        onClose={() => setLoginDialogOpen(false)}
        onLogin={() => setLoginDialogOpen(false)}
        onSignupClick={startSignup}
      />
    </>
  );
}
