// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import { useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import LoginDialog from './LoginDialog';
import { useLoggedInAccounts } from '@/hooks/useLoggedInAccounts';
import { AccountSwitcher } from './AccountSwitcher';
import { useOnboarding } from '@/hooks/useOnboarding';
import { cn } from '@/lib/utils';

export interface LoginAreaProps {
  className?: string;
}

export function LoginArea({ className }: LoginAreaProps) {
  const { currentUser } = useLoggedInAccounts();
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const { startSignup } = useOnboarding();

  const handleLogin = () => {
    setLoginDialogOpen(false);
  };

  return (
    <div className={cn("inline-flex items-center justify-center", className)}>
      {currentUser ? (
        <AccountSwitcher onAddAccountClick={() => setLoginDialogOpen(true)} />
      ) : (
        <div className="flex gap-3 justify-center">
          <Button
            onClick={() => setLoginDialogOpen(true)}
            className='flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground w-full font-medium transition-all hover:bg-primary/90 animate-scale-in'
          >
            <span className='truncate'>Log in</span>
          </Button><Button
            onClick={startSignup}
            variant="outline"
            className="flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all"
          >
            <span>Sign up</span>
          </Button>
        </div>
      )}

      <LoginDialog
        isOpen={loginDialogOpen}
        onClose={() => setLoginDialogOpen(false)}
        onLogin={handleLogin}
        onSignupClick={startSignup}
      />
    </div>
  );
}