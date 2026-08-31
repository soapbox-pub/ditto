import { createContext, useContext, useMemo, useState } from 'react';
import { ImageOff, Eye } from 'lucide-react';
import { FormattedMessage } from 'react-intl';
import { Button } from '@/components/ui/button';
import { useStrangerMediaGate } from '@/hooks/useStrangerMediaGate';
import { cn } from '@/lib/utils';

interface MediaGateContextValue {
  /** True when media in this post should be hidden behind a reveal overlay. */
  active: boolean;
  /** Reveal all gated media in this post. */
  reveal: () => void;
}

const MediaGateContext = createContext<MediaGateContextValue>({
  active: false,
  reveal: () => {},
});

/**
 * Provides a single "hide media from strangers" decision + shared reveal state
 * to every {@link MediaGate} rendered within a post. Because the reveal state
 * is shared, tapping "Show" on any one media block reveals all media in the
 * same post at once.
 *
 * Unlike a full-card guard, this only gates the media itself — text, captions,
 * and other non-media content render normally regardless of the setting.
 */
export function MediaGateProvider({
  pubkey,
  children,
}: {
  pubkey: string;
  children: React.ReactNode;
}) {
  const gated = useStrangerMediaGate(pubkey);
  const [revealed, setRevealed] = useState(false);

  const value = useMemo<MediaGateContextValue>(
    () => ({ active: gated && !revealed, reveal: () => setRevealed(true) }),
    [gated, revealed],
  );

  return (
    <MediaGateContext.Provider value={value}>
      {children}
    </MediaGateContext.Provider>
  );
}

/** Read the current media-gate state. Defaults to inactive with no provider. */
export function useMediaGate(): MediaGateContextValue {
  return useContext(MediaGateContext);
}

interface MediaGateProps {
  /** The media that should only render once the overlay is dismissed. */
  children: React.ReactNode;
  /** Optional class name for the overlay container. */
  className?: string;
}

/**
 * Hides its media `children` behind a click-to-reveal overlay when the
 * surrounding {@link MediaGateProvider} is active (the `hideMediaFromStrangers`
 * setting is on and the post's author isn't followed).
 *
 * Children are **not mounted** while gated, so a stranger's media is never
 * fetched until the viewer opts in. When there's no active provider — or once
 * the post's media has been revealed — children render normally.
 */
export function MediaGate({ children, className }: MediaGateProps) {
  const { active, reveal } = useMediaGate();

  if (!active) {
    return <>{children}</>;
  }

  return (
    <div className={cn('relative mt-2 rounded-xl overflow-hidden', className)}>
      {/* Blurred filler gives the overlay height without loading any media. */}
      <div className="bg-muted/40 blur-lg select-none" aria-hidden>
        <div className="mx-4 my-4 h-40 rounded-lg bg-muted/60" />
      </div>

      {/* Centered reveal overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 px-4 text-center">
        <div className="flex items-center justify-center size-10 rounded-full bg-background/80 shadow-sm backdrop-blur-sm">
          <ImageOff className="size-5 text-muted-foreground" />
        </div>
        <div className="space-y-1 max-w-xs">
          <p className="text-sm font-medium text-foreground">
            <FormattedMessage id="strangerMedia.title" defaultMessage="Media hidden" />
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <FormattedMessage
              id="strangerMedia.description"
              defaultMessage="This post is from someone you don't follow."
            />
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 mt-0.5 rounded-full px-5 bg-background/80 backdrop-blur-sm"
          onClick={(e) => {
            e.stopPropagation();
            reveal();
          }}
        >
          <Eye className="size-3.5" />
          <FormattedMessage id="strangerMedia.reveal" defaultMessage="Show" />
        </Button>
      </div>
    </div>
  );
}
