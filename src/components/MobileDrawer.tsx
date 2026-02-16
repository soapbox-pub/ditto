import { Link, useNavigate } from 'react-router-dom';
import { User, Wallet, Bookmark, EyeOff, Settings, ShieldBan, LogOut, ChevronDown, ChevronUp } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useLoggedInAccounts } from '@/hooks/useLoggedInAccounts';
import { LoginArea } from '@/components/auth/LoginArea';
import { genUserName } from '@/lib/genUserName';
import { useState } from 'react';


interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DrawerMenuItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

function DrawerMenuItem({ to, icon, label, onClick }: DrawerMenuItemProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-4 py-3.5 px-2 rounded-lg hover:bg-secondary/60 transition-colors text-[15px]"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="font-medium">{label}</span>
    </Link>
  );
}

export function MobileDrawer({ open, onOpenChange }: MobileDrawerProps) {
  const { user, metadata } = useCurrentUser();
  const { logout } = useLoginActions();
  const { otherUsers, setLogin } = useLoggedInAccounts();
  const navigate = useNavigate();
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);

  const displayName = metadata?.name || (user ? genUserName(user.pubkey) : 'Anonymous');
  const nip05 = metadata?.nip05;

  const handleClose = () => onOpenChange(false);

  const handleLogout = async () => {
    await logout();
    handleClose();
    navigate('/');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[300px] p-0 border-r-border">
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>

        {user ? (
          <div className="flex flex-col h-full">
            {/* User profile header */}
            <div className="px-5 pt-6 pb-4">
              <Avatar className="size-10 mb-3">
                <AvatarImage src={metadata?.picture} alt={displayName} />
                <AvatarFallback className="bg-primary/20 text-primary text-sm">
                  {displayName[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="font-bold text-[15px]">{displayName}</div>
              {nip05 && (
                <div className="text-sm text-muted-foreground">@{nip05}</div>
              )}
            </div>

            <Separator />

            {/* Menu items */}
            <nav className="flex-1 px-3 py-2">
              <DrawerMenuItem
                to="/profile"
                icon={<User className="size-5" />}
                label="Profile"
                onClick={handleClose}
              />
              <DrawerMenuItem
                to="/wallet"
                icon={<Wallet className="size-5" />}
                label="Wallet"
                onClick={handleClose}
              />
              <DrawerMenuItem
                to="/bookmarks"
                icon={<Bookmark className="size-5" />}
                label="Bookmarks"
                onClick={handleClose}
              />
              <DrawerMenuItem
                to="/mutes"
                icon={<EyeOff className="size-5" />}
                label="Mutes"
                onClick={handleClose}
              />
              <DrawerMenuItem
                to="/settings"
                icon={<Settings className="size-5" />}
                label="Preferences"
                onClick={handleClose}
              />
              <DrawerMenuItem
                to="/domain-blocks"
                icon={<ShieldBan className="size-5" />}
                label="Domain blocks"
                onClick={handleClose}
              />

              <button
                onClick={() => {
                  handleLogout();
                }}
                className="flex items-center gap-4 py-3.5 px-2 rounded-lg hover:bg-secondary/60 transition-colors text-[15px] w-full text-left"
              >
                <span className="text-muted-foreground">
                  <LogOut className="size-5" />
                </span>
                <span className="font-medium">Logout</span>
              </button>
            </nav>

            <Separator />

            {/* Switch accounts section */}
            <div className="px-3 py-2">
              <button
                onClick={() => setShowAccountSwitcher(!showAccountSwitcher)}
                className="flex items-center justify-between w-full py-3 px-2 text-[15px] font-medium"
              >
                <span>Switch accounts</span>
                {showAccountSwitcher
                  ? <ChevronUp className="size-4 text-muted-foreground" />
                  : <ChevronDown className="size-4 text-muted-foreground" />
                }
              </button>

              {showAccountSwitcher && otherUsers.length > 0 && (
                <div className="space-y-1 pb-2">
                  {otherUsers.map((account) => (
                    <button
                      key={account.id}
                      onClick={() => {
                        setLogin(account.id);
                        handleClose();
                      }}
                      className="flex items-center gap-3 w-full py-2 px-2 rounded-lg hover:bg-secondary/60 transition-colors"
                    >
                      <Avatar className="size-8">
                        <AvatarImage src={account.metadata.picture} alt={account.metadata.name} />
                        <AvatarFallback className="bg-primary/20 text-primary text-xs">
                          {(account.metadata.name?.[0] || genUserName(account.pubkey)[0]).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm truncate">
                        {account.metadata.name || genUserName(account.pubkey)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
            <p className="text-muted-foreground text-center text-sm">Log in to access all features</p>
            <LoginArea className="w-full flex flex-col" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
