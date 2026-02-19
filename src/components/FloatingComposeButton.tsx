import { useState } from 'react';
import { Pencil, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import LoginDialog from '@/components/auth/LoginDialog';
import SignupDialog from '@/components/auth/SignupDialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function FloatingComposeButton() {
  const { user } = useCurrentUser();
  const [composeOpen, setComposeOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);

  if (user) {
    return (
      <>
        <Button
          onClick={() => setComposeOpen(true)}
          className="fixed right-4 z-30 sidebar:hidden size-14 rounded-full shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground"
          style={{ bottom: `calc(5rem + env(safe-area-inset-bottom, 0px))` }}
          size="icon"
        >
          <Pencil className="size-6" />
        </Button>
        <ReplyComposeModal open={composeOpen} onOpenChange={setComposeOpen} />
      </>
    );
  }

  return (
    <>
      <Button
        onClick={() => setLoginOpen(true)}
        className="fixed right-4 z-30 sidebar:hidden h-14 px-5 rounded-full shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-2"
        style={{ bottom: `calc(5rem + env(safe-area-inset-bottom, 0px))` }}
      >
        <UserPlus className="size-6" />
        <span className="text-base font-bold">Join</span>
      </Button>
      <LoginDialog
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onLogin={() => setLoginOpen(false)}
        onSignupClick={() => {
          setLoginOpen(false);
          setSignupOpen(true);
        }}
      />
      <SignupDialog
        isOpen={signupOpen}
        onClose={() => setSignupOpen(false)}
      />
    </>
  );
}
