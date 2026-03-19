import { useState } from 'react';
import { Plus, Construction } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
  /** If set, the FAB navigates to this URL instead of opening a dialog. */
  href?: string;
  /** If set, overrides the default FAB click behavior. */
  onFabClick?: () => void;
  /** If set, overrides the default Plus icon. */
  icon?: React.ReactNode;
}

export function FloatingComposeButton({ kind = 1, href, onFabClick, icon }: FloatingComposeButtonProps) {
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const [composeOpen, setComposeOpen] = useState(false);
  const [comingSoonOpen, setComingSoonOpen] = useState(false);

  if (!user) {
    return null;
  }

  const handleClick = () => {
    if (onFabClick) {
      onFabClick();
    } else if (href) {
      navigate(href);
    } else if (kind === 1) {
      setComposeOpen(true);
    } else {
      setComingSoonOpen(true);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className="relative size-16 transition-transform hover:scale-105 active:scale-95 drop-shadow-lg"
      >
        {/* Filled planet shape as the button background */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className="absolute inset-0 w-full h-full"
        >
          {/* Planet body */}
          <circle cx="12" cy="12" r="8" className="fill-accent" />
          {/* Ring gap — wider background-colored stroke to create visible border around the ring */}
          <path
            d="M4.05 13c-1.7 1.8-2.5 3.5-1.8 4.5c1.1 1.9 6.4 1 11.8-2s8.9-7.1 7.7-9c-.6-1-2.4-1.2-4.7-.7"
            fill="none"
            className="stroke-background"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Ring — accent-colored, drawn on top of the gap */}
          <path
            d="M4.05 13c-1.7 1.8-2.5 3.5-1.8 4.5c1.1 1.9 6.4 1 11.8-2s8.9-7.1 7.7-9c-.6-1-2.4-1.2-4.7-.7"
            fill="none"
            className="stroke-accent"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {/* Plus icon centered on the planet body */}
        <span className="absolute inset-0 flex items-center justify-center text-accent-foreground">
          {icon ?? <Plus strokeWidth={4} size={20} />}
        </span>
      </button>

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
