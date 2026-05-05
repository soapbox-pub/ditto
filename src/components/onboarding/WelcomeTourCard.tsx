/**
 * WelcomeTourCard — single card in the welcome tour deck.
 *
 * Layout (mobile-first, scales up on sm+):
 *
 *   ┌──────────────────────────────────────┐
 *   │  [Blobbi]  ┌─speech bubble─────────┐ │
 *   │     ↗      │ "typewriter text"     │ │
 *   │            └───────────────────────┘ │
 *   │                                      │
 *   │       [ illustrated preview ]        │
 *   │                                      │
 *   │              Title                   │
 *   │              Body copy…              │
 *   │                                      │
 *   │           ● ● ● ○ ○ ○ ○              │
 *   │                                      │
 *   │   [Skip]          [Try it] [Next →]  │
 *   └──────────────────────────────────────┘
 *
 * The speech bubble uses the existing `useTypewriter` hook from the Blobbi
 * ceremony codebase; tapping the bubble fast-forwards typing.
 *
 * Theming: surfaces use theme tokens (`bg-background`, `bg-card`,
 * `border-border`). The user's Blobbi base color appears only as a small
 * radial glow accent at the top of the card so the Blobbi presence is felt
 * without the card clashing with the active theme.
 */

import { useMemo } from 'react';

import { BlobbiBabyVisual } from '@/blobbi/ui/BlobbiBabyVisual';
import { BlobbiAdultVisual } from '@/blobbi/ui/BlobbiAdultVisual';
import { companionDataToBlobbi } from '@/blobbi/ui/lib/adapters';
import { useBlobbiCompanionData } from '@/blobbi/companion/hooks/useBlobbiCompanionData';
import { useTypewriter } from '@/blobbi/onboarding/hooks/useTypewriter';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { impactLight } from '@/lib/haptics';

import type { WelcomeTourStep } from './welcome-tour-steps';

interface WelcomeTourCardProps {
  step: WelcomeTourStep;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onTryIt: (route: string) => void;
}

/** Default tint for the top-of-card accent glow when no Blobbi is loaded. */
const FALLBACK_ACCENT_COLOR = '#fde68a';

export function WelcomeTourCard({
  step,
  stepIndex,
  totalSteps,
  onNext,
  onBack,
  onSkip,
  onTryIt,
}: WelcomeTourCardProps) {
  const { companion } = useBlobbiCompanionData();

  const blobbi = useMemo(() => (companion ? companionDataToBlobbi(companion) : null), [companion]);

  // Blobbi base color drives a small radial-glow accent only — the rest of
  // the card uses theme tokens so it adapts to the user's chosen theme.
  const accentColor = companion?.visualTraits?.baseColor ?? FALLBACK_ACCENT_COLOR;
  const accentGradient = useMemo(
    () =>
      `radial-gradient(ellipse 80% 60% at 30% 0%, ${accentColor}33 0%, ${accentColor}11 40%, transparent 75%)`,
    [accentColor],
  );

  // Typewriter effect for the speech bubble — restarts whenever step changes.
  const typewriter = useTypewriter(step.blobbiSpeech, true, 30);

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === totalSteps - 1;

  const handleNext = () => {
    impactLight();
    onNext();
  };

  const handleTryIt = () => {
    if (!step.tryIt) return;
    impactLight();
    onTryIt(step.tryIt.route);
  };

  // Render Blobbi at ~64px. Babies/adults render in companion mode so they
  // don't try to track the mouse and don't apply page-mode reaction classes.
  const renderBlobbi = () => {
    if (!blobbi) {
      return (
        <div className="size-16 sm:size-20 rounded-full bg-muted flex items-center justify-center text-3xl shadow-inner">
          🥚
        </div>
      );
    }
    const stage = companion?.stage ?? 'baby';
    return (
      <div className="size-16 sm:size-20 animate-blobbi-sway">
        {stage === 'adult' ? (
          <BlobbiAdultVisual
            blobbi={blobbi}
            renderMode="companion"
            lookMode="forward"
            emotion={step.emotion}
            className="size-full"
          />
        ) : (
          <BlobbiBabyVisual
            blobbi={blobbi}
            renderMode="companion"
            lookMode="forward"
            emotion={step.emotion}
            className="size-full"
          />
        )}
      </div>
    );
  };

  return (
    <div
      className={cn(
        'relative w-full h-full sm:h-auto sm:max-h-[90dvh] sm:rounded-3xl overflow-hidden',
        'flex flex-col p-5 sm:p-6 gap-5 landing-hero-fade',
        'bg-background text-foreground',
      )}
    >
      {/* Theme-aware Blobbi-tinted accent glow at the top of the card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-48"
        style={{ background: accentGradient }}
      />

      {/* All content sits above the accent glow */}
      <div className="relative flex flex-col gap-5 flex-1 min-h-0">
        {/* Header: Blobbi + speech bubble */}
        <div className="flex items-start gap-3">
          {renderBlobbi()}

          {/* Speech bubble */}
          <button
            type="button"
            onClick={() => typewriter.complete()}
            className={cn(
              'relative flex-1 text-left',
              'rounded-2xl rounded-tl-sm px-4 py-3',
              'bg-card text-card-foreground border border-border shadow-sm',
              'min-h-[56px] flex items-center',
            )}
            aria-label="Tap to skip typing"
          >
            <span className="text-sm sm:text-base font-medium">
              {typewriter.displayed}
              {!typewriter.done && (
                <span className="inline-block w-0.5 h-4 bg-foreground/70 align-middle ml-0.5 animate-pulse" />
              )}
            </span>
          </button>
        </div>

        {/* Preview illustration */}
        <div className="flex items-center justify-center">{step.preview}</div>

        {/* Title + body */}
        <div className="text-center space-y-1.5">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">{step.title}</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            {step.description}
          </p>
        </div>

        {/* Spacer pushes actions to bottom on full-screen mobile layout */}
        <div className="flex-1" />

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5" aria-hidden="true">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'rounded-full transition-all',
                i === stepIndex
                  ? 'w-6 h-1.5 bg-primary'
                  : i < stepIndex
                    ? 'w-1.5 h-1.5 bg-primary/50'
                    : 'w-1.5 h-1.5 bg-foreground/20',
              )}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Left: Back (or empty on first) */}
          <div className="flex-1">
            {!isFirst && (
              <Button
                variant="ghost"
                onClick={onBack}
                className="text-muted-foreground hover:text-foreground"
              >
                Back
              </Button>
            )}
          </div>

          {/* Right: Try it (optional) + Next/Finish */}
          <div className="flex items-center gap-2">
            {step.tryIt && !isFirst && (
              <Button variant="outline" onClick={handleTryIt} className="rounded-full">
                {step.tryIt.label}
              </Button>
            )}
            <Button onClick={handleNext} className="rounded-full px-5">
              {isLast ? 'Finish' : 'Next →'}
            </Button>
          </div>
        </div>

        {/* Skip-tour link on non-final cards (small, unobtrusive) */}
        {!isLast && (
          <div className="text-center -mt-3">
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              Skip tour
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
