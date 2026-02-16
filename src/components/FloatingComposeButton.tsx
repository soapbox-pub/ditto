import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ComposeBox } from '@/components/ComposeBox';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function FloatingComposeButton() {
  const { user } = useCurrentUser();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-30 sidebar:hidden size-14 rounded-full shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground"
        size="icon"
      >
        <Pencil className="size-6" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[500px] p-0">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>New post</DialogTitle>
          </DialogHeader>
          <ComposeBox onSuccess={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
