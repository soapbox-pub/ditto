/**
 * WelcomeTourPill — small persistent indicator shown while the welcome tour
 * is minimized.
 *
 * Anchored to the bottom-left of the viewport (matching the default position
 * of `MinimizedAudioBar`), clearing the mobile bottom nav and safe-area
 * insets via the `.bottom-fab` utility. Stays visible across route changes
 * while the user explores a feature they were directed to via "Try it".
 * Tapping the body resumes the tour at the preserved step; tapping the X
 * dismisses permanently.
 *
 * Theme-aware: uses `bg-background` / `border-border` so it matches the
 * user's chosen theme.
 */

import { X } from 'lucide-react';
import { useMemo } from 'react';

import { BlobbiAdultVisual } from '@/blobbi/ui/BlobbiAdultVisual';
import { BlobbiBabyVisual } from '@/blobbi/ui/BlobbiBabyVisual';
import { useBlobbiCompanionData } from '@/blobbi/companion/hooks/useBlobbiCompanionData';
import { companionDataToBlobbi } from '@/blobbi/ui/lib/adapters';
import type { BlobbiEmotion } from '@/blobbi/ui/lib/emotion-types';
import { cn } from '@/lib/utils';

interface WelcomeTourPillProps {
  stepIndex: number;
  totalSteps: number;
  emotion?: BlobbiEmotion;
  onResume: () => void;
  onDismiss: () => void;
}

export function WelcomeTourPill({
  stepIndex,
  totalSteps,
  emotion = 'happy',
  onResume,
  onDismiss,
}: WelcomeTourPillProps) {
  const { companion } = useBlobbiCompanionData();
  const blobbi = useMemo(
    () => (companion ? companionDataToBlobbi(companion) : null),
    [companion],
  );
  const stage = companion?.stage ?? 'baby';

  const handleResumeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onResume();
    }
  };

  const handleDismissClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDismiss();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onResume}
      onKeyDown={handleResumeKeyDown}
      aria-label={`Resume tour, step ${stepIndex + 1} of ${totalSteps}`}
      className={cn(
        'fixed left-4 bottom-fab z-[200]',
        'inline-flex items-center gap-2 pl-2 pr-1 py-1',
        'rounded-full bg-background border border-border shadow-lg',
        'hover:bg-accent transition-colors cursor-pointer',
        'animate-in fade-in slide-in-from-bottom-2 duration-300',
        'max-w-[calc(100vw-2rem)]',
        'focus:outline-none focus:ring-2 focus:ring-ring',
      )}
    >
      {/* Blobbi (or egg fallback) */}
      <span
        aria-hidden
        className="size-7 shrink-0 flex items-center justify-center animate-blobbi-sway"
      >
        {blobbi ? (
          stage === 'adult' ? (
            <BlobbiAdultVisual
              blobbi={blobbi}
              renderMode="companion"
              lookMode="forward"
              emotion={emotion}
              className="size-full"
            />
          ) : (
            <BlobbiBabyVisual
              blobbi={blobbi}
              renderMode="companion"
              lookMode="forward"
              emotion={emotion}
              className="size-full"
            />
          )
        ) : (
          <span className="text-lg leading-none">🥚</span>
        )}
      </span>

      {/* Label */}
      <span className="text-sm font-medium text-foreground whitespace-nowrap">
        Resume tour
      </span>
      <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
        {stepIndex + 1}/{totalSteps}
      </span>

      {/* Dismiss */}
      <button
        type="button"
        aria-label="Dismiss tour"
        onClick={handleDismissClick}
        className={cn(
          'size-7 rounded-full flex items-center justify-center shrink-0',
          'hover:bg-muted transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-ring',
        )}
      >
        <X className="size-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}
