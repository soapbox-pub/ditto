import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function FloatingComposeButton() {
  const { user } = useCurrentUser();
  const [composeOpen, setComposeOpen] = useState(false);

  if (!user) {
    return null;
  }

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
