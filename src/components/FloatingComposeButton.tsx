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
        className="relative size-16 transition-transform hover:scale-105 active:scale-95"
        style={{
          filter: 'drop-shadow(0 4px 12px hsl(var(--primary) / 0.4)) drop-shadow(0 2px 4px hsl(var(--primary) / 0.2))',
        }}
      >
        {/* Filled planet shape as the button background */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className="absolute inset-0 w-full h-full"
        >
          <defs>
            {/* Gradient for planet body */}
            <linearGradient id="planet-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" style={{ stopColor: 'hsl(var(--accent))' }} />
              <stop offset="100%" style={{ stopColor: 'hsl(var(--primary))' }} />
            </linearGradient>
            {/* Gradient for ring */}
            <linearGradient id="ring-gradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" style={{ stopColor: 'hsl(var(--primary))' }} />
              <stop offset="100%" style={{ stopColor: 'hsl(var(--accent))' }} />
            </linearGradient>
            {/* Mask: white = visible, black = cut out.
                The middle arc (crossing through the circle) is stroked black
                so the ring appears to pass in front there. The outer arcs at
                the edges pass behind the planet body naturally.
                Single explicit path segment — no pathLength/dash tricks, Safari-safe. */}
            <mask id="planet-body-mask">
              <circle cx="12" cy="12" r="8" fill="white" />
              {/* Middle arc: crosses through the planet body, ring passes in front */}
              <path
                d="M7.06 18.24 C9.1 17.82 11.57 16.88 14.05 15.5 C16.51 14.14 18.57 12.54 19.98 11.03"
                fill="none"
                stroke="black"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </mask>
          </defs>
          {/* Planet body with gradient fill, front-arc gap cut out */}
          <circle cx="12" cy="12" r="8" fill="url(#planet-gradient)" mask="url(#planet-body-mask)" />
          {/* Full ring as one continuous path — gradient flows smoothly */}
          <path
            d="M4.05 13 C2.35 14.8 1.55 16.5 2.25 17.5 C2.84 18.53 4.66 18.74 7.06 18.24 C9.1 17.82 11.57 16.88 14.05 15.5 C16.51 14.14 18.57 12.54 19.98 11.03 C21.66 9.22 22.4 7.54 21.75 6.5 C21.15 5.5 19.35 5.3 17.05 5.8"
            fill="none"
            stroke="url(#ring-gradient)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {/* Plus icon centered on the planet body */}
        <span className="absolute inset-0 flex items-center justify-center text-accent-foreground">
          {icon ?? <Plus strokeWidth={4} size={16} />}
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
