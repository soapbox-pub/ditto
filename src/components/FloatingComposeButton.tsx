import { useState } from 'react';
import { Pencil, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import SignupDialog from '@/components/auth/SignupDialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function FloatingComposeButton() {
  const { user } = useCurrentUser();
  const [composeOpen, setComposeOpen] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);

  if (user) {
    return (
      <>
        <Button
          onClick={() => setComposeOpen(true)}
          className="fixed bottom-20 right-4 z-30 sidebar:hidden size-14 rounded-full shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground"
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
        onClick={() => setSignupOpen(true)}
        className="fixed bottom-20 right-4 z-30 sidebar:hidden h-14 px-5 rounded-full shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-2"
      >
        <UserPlus className="size-6" />
        <span className="text-base font-bold">Join</span>
      </Button>
      <SignupDialog isOpen={signupOpen} onClose={() => setSignupOpen(false)} />
    </>
  );
}
