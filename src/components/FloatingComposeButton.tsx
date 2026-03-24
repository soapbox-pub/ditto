import { useMemo, useState } from 'react';
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
import { getAvatarShape, getEmojiMaskUrl } from '@/lib/avatarShape';

/** Drop shadow style for the planet FAB — hoisted to avoid re-creating on every render. */
const fabShadowStyle: React.CSSProperties = {
  filter: 'drop-shadow(0 4px 12px hsl(var(--primary) / 0.4)) drop-shadow(0 2px 4px hsl(var(--primary) / 0.2))',
};

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
  const { user, metadata } = useCurrentUser();
  const navigate = useNavigate();
  const [composeOpen, setComposeOpen] = useState(false);
  const [comingSoonOpen, setComingSoonOpen] = useState(false);

  const avatarShape = getAvatarShape(metadata);

  /** When the user has a custom emoji shape, use it as the FAB mask instead of a circle. */
  const shapeMaskStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!avatarShape) return undefined;
    const maskUrl = getEmojiMaskUrl(avatarShape);
    if (!maskUrl) return undefined;
    return {
      WebkitMaskImage: `url(${maskUrl})`,
      maskImage: `url(${maskUrl})`,
      WebkitMaskSize: 'contain',
      maskSize: 'contain' as string,
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat' as string,
      WebkitMaskPosition: 'center',
      maskPosition: 'center' as string,
    };
  }, [avatarShape]);

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
        style={fabShadowStyle}
      >
        {/* FAB background: user's avatar shape (emoji mask) or circle (default) */}
        <div
          className="absolute inset-0 bg-primary rounded-full"
          style={shapeMaskStyle}
        />
        {/* Plus icon centered on the button */}
        <span className="absolute inset-0 flex items-center justify-center text-primary-foreground">
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
