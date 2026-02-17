import { useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
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
        <DialogContent className="max-w-[480px] rounded-2xl p-0 gap-0 border-border overflow-hidden [&>button]:hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-12">
            <DialogTitle className="text-base font-semibold">New post</DialogTitle>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 -mr-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>

          <Separator />

          {/* Compose area */}
          <ComposeBox onSuccess={() => setOpen(false)} placeholder="What's happening?" />
        </DialogContent>
      </Dialog>
    </>
  );
}
