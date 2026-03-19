import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronUp, LogOut, UserPlus, Loader2 } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { SidebarNavList } from '@/components/SidebarNavItem';
import { SidebarMoreMenu } from '@/components/SidebarMoreMenu';

import { LoginArea } from '@/components/auth/LoginArea';
import { LinkFooter } from '@/components/LinkFooter';
import { EmojifiedText } from '@/components/CustomEmoji';
import LoginDialog from '@/components/auth/LoginDialog';
import { useOnboarding } from '@/hooks/useOnboarding';
import { genUserName } from '@/lib/genUserName';
import { VerifiedNip05Text } from '@/components/Nip05Badge';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useLoggedInAccounts, type Account } from '@/hooks/useLoggedInAccounts';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useHasUnreadNotifications } from '@/hooks/useHasUnreadNotifications';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { getSidebarItem, isItemActive } from '@/lib/sidebarItems';
import { useAppContext } from '@/hooks/useAppContext';
import { useTheme } from '@/hooks/useTheme';
import { useUserStatus } from '@/hooks/useUserStatus';
import { usePublishStatus } from '@/hooks/usePublishStatus';
import { useToast } from '@/hooks/useToast';
import { Input } from '@/components/ui/input';
import { resolveTheme, resolveThemeConfig } from '@/themes';

interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileDrawer({ open, onOpenChange }: MobileDrawerProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, metadata, event: currentUserEvent } = useCurrentUser();
  const currentUserAvatarShape = getAvatarShape(metadata);
  const userProfileUrl = useProfileUrl(user?.pubkey ?? '', metadata);
  const { logout } = useLoginActions();
  const { otherUsers, setLogin } = useLoggedInAccounts();
  const { orderedItems, hiddenItems, addToSidebar, addDividerToSidebar, removeFromSidebar, updateSidebarOrder } = useFeedSettings();
  const { config } = useAppContext();
  const homePage = config.homePage;
  const hasUnread = useHasUnreadNotifications();
  const [editing, setEditing] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [accountExpanded, setAccountExpanded] = useState(false);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const { startSignup } = useOnboarding();
  const { theme, customTheme, themes } = useTheme();

  // NIP-38 status
  const userStatus = useUserStatus(user?.pubkey);
  const publishStatus = usePublishStatus();
  const { toast } = useToast();
  const [statusEditing, setStatusEditing] = useState(false);
  const [statusDraft, setStatusDraft] = useState('');

  /** Compute the background image style for the drawer, mirroring the body background. */
  const bgStyle = useMemo<React.CSSProperties>(() => {
    const resolved = resolveTheme(theme);
    const activeConfig = resolved === 'custom' ? customTheme : resolveThemeConfig(resolved, themes);
    const bgUrl = activeConfig?.background?.url;
    if (!bgUrl) return {};
    const bgMode = activeConfig?.background?.mode ?? 'cover';
    if (bgMode === 'tile') {
      return { backgroundColor: 'transparent', backgroundImage: `url("${bgUrl}")`, backgroundRepeat: 'repeat', backgroundSize: 'auto' };
    }
    return { backgroundColor: 'transparent', backgroundImage: `url("${bgUrl}")`, backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
  }, [theme, customTheme, themes]);

  const hasBgImage = Object.keys(bgStyle).length > 0;

  const visibleItems = useMemo(() => {
    const filtered = user ? orderedItems : orderedItems.filter((id) => !getSidebarItem(id)?.requiresAuth);
    // Remove dividers that have no real items above them (at the top or right after another divider).
    return filtered.filter((id, i) => {
      if (id !== 'divider') return true;
      const prevNonDivider = filtered.slice(0, i).some((prev) => prev !== 'divider');
      return prevNonDivider;
    });
  }, [orderedItems, user]);

  const visibleHiddenItems = useMemo(() => {
    if (user) return hiddenItems;
    return hiddenItems.filter((item) => !getSidebarItem(item.id)?.requiresAuth);
  }, [hiddenItems, user]);

  const handleClose = () => { onOpenChange(false); setMoreMenuOpen(false); };
  const handleLogout = async () => { await logout(); handleClose(); navigate('/'); };
  const getDisplayName = (account: Account) => account.metadata.name ?? genUserName(account.pubkey);
  const displayName = metadata?.name || (user ? genUserName(user.pubkey) : 'Anonymous');

  return (
    <>
        <Sheet open={open} onOpenChange={(v) => { if (!v) setMoreMenuOpen(false); onOpenChange(v); }}>
        <SheetContent side="left" className="w-[300px] p-0 gap-0 border-r-border flex flex-col overflow-visible" style={bgStyle}>
          {hasBgImage && <div className="absolute inset-0 bg-background/70 pointer-events-none" />}
          {/* Decorative vertical arc extending the drawer's background */}
          <div
            className="absolute top-0 bottom-0 left-full pointer-events-none"
            style={{ width: 36 }}
          >
            <div
              className="w-full h-full bg-background"
              style={{
                ...bgStyle,
                clipPath: 'ellipse(100% 50% at 0% 50%)',
              }}
            />
            {hasBgImage && (
              <div
                className="absolute inset-0 bg-background/70"
                style={{ clipPath: 'ellipse(100% 50% at 0% 50%)' }}
              />
            )}
          </div>
          <SheetTitle className="sr-only">Navigation menu</SheetTitle>

          {user ? (
            <div className="flex flex-col h-full relative">
              {/* User row with caret */}
              <button
                onClick={() => setAccountExpanded((v) => !v)}
                className="flex items-center gap-3 px-3 hover:bg-secondary/60 transition-colors w-full text-left"
                style={{ minHeight: `calc(3rem + env(safe-area-inset-top, 0px))`, paddingTop: `env(safe-area-inset-top, 0px)` }}
              >
                <Avatar shape={currentUserAvatarShape} className="size-7 shrink-0">
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
                <div>
                  {/* Status editor */}
                  <div className="border-b border-border">
                    {statusEditing ? (
                      <div className="px-3 py-2 space-y-2">
                        <Input
                          value={statusDraft}
                          onChange={(e) => setStatusDraft(e.target.value.slice(0, 80))}
                          placeholder="What are you up to?"
                          className="h-8 text-base md:text-sm"
                          maxLength={80}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const text = statusDraft.trim();
                              publishStatus.mutateAsync({ status: text }).then(() => {
                                setStatusEditing(false);
                                setStatusDraft('');
                                toast({ title: text ? 'Status updated' : 'Status cleared' });
                              });
                            } else if (e.key === 'Escape') {
                              setStatusEditing(false);
                              setStatusDraft('');
                            }
                          }}
                        />
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              const text = statusDraft.trim();
                              publishStatus.mutateAsync({ status: text }).then(() => {
                                setStatusEditing(false);
                                setStatusDraft('');
                                toast({ title: text ? 'Status updated' : 'Status cleared' });
                              });
                            }}
                            disabled={publishStatus.isPending}
                            className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                          >
                            {publishStatus.isPending ? <Loader2 className="size-3 animate-spin" /> : 'Save'}
                          </button>
                          {userStatus.status && (
                            <button
                              onClick={() => {
                                publishStatus.mutateAsync({ status: '' }).then(() => {
                                  setStatusEditing(false);
                                  setStatusDraft('');
                                  toast({ title: 'Status cleared' });
                                });
                              }}
                              disabled={publishStatus.isPending}
                              className="text-xs font-medium text-destructive hover:underline disabled:opacity-50"
                            >
                              Clear
                            </button>
                          )}
                          <button
                            onClick={() => { setStatusEditing(false); setStatusDraft(''); }}
                            className="text-xs text-muted-foreground hover:underline ml-auto"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setStatusEditing(true);
                          setStatusDraft(userStatus.status ?? '');
                        }}
                        className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-secondary/60 transition-colors"
                      >
                        {userStatus.status ? (
                          <span className="truncate text-muted-foreground italic text-xs pr-1">{userStatus.status}</span>
                        ) : (
                          <span className="text-muted-foreground">Set a status</span>
                        )}
                      </button>
                    )}
                  </div>
                  {otherUsers.map((account) => (
                    <button
                      key={account.id}
                      onClick={() => { setLogin(account.id); handleClose(); }}
                      className="flex items-center gap-3 w-full px-3 py-2 hover:bg-secondary/60 transition-colors"
                    >
                      <Avatar shape={getAvatarShape(account.metadata)} className="size-7 shrink-0">
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
                <div className="contents">
                  <SidebarNavList
                    items={visibleItems}
                    editing={editing}
                    onRemove={removeFromSidebar}
                    onReorder={updateSidebarOrder}
                    isActive={(id) => isItemActive(id, location.pathname, location.search, userProfileUrl, homePage)}
                    getOnClick={() => handleClose}
                    getProfilePath={(id) => id === 'profile' ? userProfileUrl : undefined}
                    getShowIndicator={(id) => id === 'notifications' ? hasUnread : undefined}
                    linkClassName="text-base"
                    homePage={homePage}
                  />
                  <SidebarMoreMenu
                    editing={editing}
                    hiddenItems={visibleHiddenItems}
                    onDoneEditing={() => setEditing(false)}
                    onStartEditing={() => setEditing(true)}
                    onAdd={addToSidebar}
                    onAddDivider={addDividerToSidebar}
                    onNavigate={handleClose}
                    open={moreMenuOpen}
                    onOpenChange={setMoreMenuOpen}
                    homePage={homePage}
                  />
                </div>
              </nav>

              <div className="px-2">
                <LinkFooter />
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full relative">
              {/* Login prompt */}
              <div
                className="flex items-center gap-3 px-4 border-b border-border"
                style={{ minHeight: `calc(3rem + env(safe-area-inset-top, 0px))`, paddingTop: `env(safe-area-inset-top, 0px)` }}
              >
                <LoginArea className="w-full flex" />
              </div>

              {/* Nav items — scrollable */}
              <nav className="flex flex-col gap-0.5 flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-1">
                <div className="contents">
                  <SidebarNavList
                    items={visibleItems}
                    editing={false}
                    onRemove={removeFromSidebar}
                    onReorder={updateSidebarOrder}
                    isActive={(id) => isItemActive(id, location.pathname, location.search, userProfileUrl, homePage)}
                    getOnClick={() => handleClose}
                    getProfilePath={(id) => id === 'profile' ? userProfileUrl : undefined}
                    getShowIndicator={(id) => id === 'notifications' ? hasUnread : undefined}
                    linkClassName="text-base"
                    homePage={homePage}
                  />
                  <SidebarMoreMenu
                    editing={false}
                    hiddenItems={visibleHiddenItems}
                    onDoneEditing={() => setEditing(false)}
                    onStartEditing={() => setEditing(true)}
                    onAdd={addToSidebar}
                    onAddDivider={addDividerToSidebar}
                    onNavigate={handleClose}
                    open={moreMenuOpen}
                    onOpenChange={setMoreMenuOpen}
                    homePage={homePage}
                  />
                </div>
              </nav>

              <div className="px-2">
                <LinkFooter />
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
