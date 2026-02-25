import { useState } from 'react';
import { Plus, Construction } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { useCurrentUser } from '@/hooks/useCurrentUser';

interface FloatingComposeButtonProps {
  /** The Nostr event kind this FAB creates. kind=1 opens compose; others show "Coming soon". */
  kind?: number;
}

export function FloatingComposeButton({ kind = 1 }: FloatingComposeButtonProps) {
  const { user } = useCurrentUser();
  const [composeOpen, setComposeOpen] = useState(false);
  const [comingSoonOpen, setComingSoonOpen] = useState(false);

  if (!user) {
    return null;
  }

  const handleClick = () => {
    if (kind === 1) {
      setComposeOpen(true);
    } else {
      setComingSoonOpen(true);
    }
  };

  return (
    <>
      <Button
        onClick={handleClick}
        className="size-14 rounded-full shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-transform hover:scale-105 active:scale-95"
      >
        <Plus strokeWidth={4} />
      </Button>

      {/* Kind 1: Compose modal */}
      {kind === 1 && (
        <ReplyComposeModal open={composeOpen} onOpenChange={setComposeOpen} />
      )}

      {/* Other kinds: Coming soon dialog */}
      {kind !== 1 && (
        <Dialog open={comingSoonOpen} onOpenChange={setComingSoonOpen}>
          <DialogContent className="max-w-[360px] rounded-2xl text-center">
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="size-16 rounded-full bg-muted flex items-center justify-center">
                <Construction className="size-8 text-muted-foreground" />
              </div>
              <DialogTitle className="text-lg font-semibold">Coming soon</DialogTitle>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-[260px]">
                Creating this type of content isn't available yet. Stay tuned!
              </p>
              <Button
                variant="outline"
                className="rounded-full mt-2"
                onClick={() => setComingSoonOpen(false)}
              >
                Got it
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
