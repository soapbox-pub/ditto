import { useMemo, useState } from 'react';
import { ChevronDown, Star } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { CopyButton } from '@/components/EventJsonDialog';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { getEventFallbackText } from '@/lib/extraKinds';
import { getKindLabel } from '@/lib/kindLabels';
import { encodeEventAddress } from '@/lib/encodeEvent';
import { cn } from '@/lib/utils';

interface UnknownKindContentProps {
  event: NostrEvent;
  /** When true, renders a larger variant for the detail page. */
  expanded?: boolean;
  className?: string;
}

/** Rainbow palette the PK-attack projectiles cycle through. */
const PK_COLORS = ['#f0abfc', '#c084fc', '#818cf8', '#38bdf8', '#34d399', '#fde047', '#fb7185'];

interface PkBeam {
  left: string;
  top: string;
  delay: string;
  duration: string;
  color: string;
  length: number;
}

interface PkStar {
  left: string;
  top: string;
  delay: string;
  size: number;
  color: string;
}

/**
 * Procedurally build a dense, chromatic PK-attack volley: long diagonal beam
 * streaks plus a scatter of star bursts, all staggered so the barrage rolls
 * across the frame over ~1.6s rather than firing in a single instant.
 */
function buildBarrage(seed: number): { beams: PkBeam[]; stars: PkStar[] } {
  // Small deterministic PRNG so a given event always animates identically.
  let s = seed || 1;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };

  const beams: PkBeam[] = Array.from({ length: 18 }, () => ({
    left: `${rand() * 120 - 20}%`,
    top: `${rand() * 120 - 20}%`,
    delay: `${(rand() * 1.1).toFixed(3)}s`,
    duration: `${(0.45 + rand() * 0.35).toFixed(3)}s`,
    color: PK_COLORS[Math.floor(rand() * PK_COLORS.length)],
    length: Math.round(60 + rand() * 90),
  }));

  const stars: PkStar[] = Array.from({ length: 22 }, () => ({
    left: `${rand() * 100}%`,
    top: `${rand() * 100}%`,
    delay: `${(rand() * 1.3).toFixed(3)}s`,
    size: Math.round(10 + rand() * 14),
    color: PK_COLORS[Math.floor(rand() * PK_COLORS.length)],
  }));

  return { beams, stars };
}

/**
 * Fallback renderer for event kinds this client doesn't know how to display.
 *
 * Styled as a small encounter rather than an error: the badge showcase's
 * rotating spotlight rays (tinted through a prismatic hue cycle) light up a
 * rainbow "?" orb, with the kind named underneath. Never runs the text-note
 * tokenizer (URLs, hashtags, nostr: mentions) over arbitrary content — that
 * would misinterpret JSON or empty bodies as kind 1. Surfaces the NIP-31
 * `alt` tag (with fallbacks to title/name/summary/d) when present, and lets
 * the user expand the raw event inline — id + JSON with copy buttons — so an
 * unrenderable event is inspectable and exportable instead of a dead end.
 */
export function UnknownKindContent({ event, expanded = false, className }: UnknownKindContentProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [attacking, setAttacking] = useState(false);

  const fallbackText = getEventFallbackText(event);
  // getKindLabel falls back to "Kind <n>" for kinds absent from the registry,
  // so this is always a meaningful noun phrase.
  const label = getKindLabel(event.kind);
  // Avoid a redundant "Kind 1234" chip when the label already *is* "Kind 1234".
  const showKindChip = label !== `Kind ${event.kind}`;

  const nip19Id = encodeEventAddress(event);
  const jsonText = JSON.stringify(event, null, 2);

  // Deterministic per-event barrage layout (seeded off the event id).
  const barrage = useMemo(() => {
    let seed = 0;
    for (let i = 0; i < event.id.length; i++) seed = (seed * 31 + event.id.charCodeAt(i)) & 0x7fffffff;
    return buildBarrage(seed);
  }, [event.id]);

  return (
    <div
      className={cn(
        'rounded-2xl border border-border overflow-hidden',
        expanded ? 'mt-3' : 'mt-2',
        className,
      )}
    >
      {/* The encounter — an Earthbound-battle-style wavy backdrop: gradient
          bands warped through an SVG turbulence displacement filter, swaying
          and hue-shifting behind a big prismatic "?". Clicking fires a one-shot
          "PK Starstorm" — the frame shakes while star projectiles streak
          diagonally across it. */}
      <div
        className={cn(
          'relative isolate flex flex-col items-center px-4 pt-6 pb-5 overflow-hidden cursor-pointer',
          attacking && 'mystery-attack',
        )}
        onClick={(e) => {
          e.stopPropagation();
          // Retrigger by keying the star layer; restart the shake by briefly
          // clearing the class first.
          setAttacking(false);
          requestAnimationFrame(() => setAttacking(true));
        }}
        onAnimationEnd={(e) => {
          if (e.animationName === 'mystery-shake') setAttacking(false);
        }}
      >
        {/* Displacement field for .mystery-waves (see index.css) */}
        <svg aria-hidden="true" className="absolute size-0">
          <filter id="mystery-warp">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.028" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="28" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
        <div className="mystery-waves absolute -inset-4 -z-10 pointer-events-none" aria-hidden="true" />

        {/* PK attack — a dense chromatic barrage of beam streaks + star bursts
            plus a color-cycling bloom, keyed on `attacking` so each click
            remounts the layer and replays from 0. */}
        {attacking && (
          <div className="mystery-storm absolute inset-0 z-20 overflow-hidden pointer-events-none" aria-hidden="true">
            {/* Full-frame chromatic bloom */}
            <div className="mystery-bloom absolute inset-0" />

            {/* Diagonal beam streaks */}
            {barrage.beams.map((b, i) => (
              <span
                key={`b${i}`}
                className="mystery-beam absolute rounded-full"
                style={{
                  left: b.left,
                  top: b.top,
                  width: `${b.length}px`,
                  background: `linear-gradient(90deg, transparent, ${b.color}, #fff)`,
                  boxShadow: `0 0 10px 2px ${b.color}`,
                  animationDelay: b.delay,
                  animationDuration: b.duration,
                }}
              />
            ))}

            {/* Star bursts */}
            {barrage.stars.map((st, i) => (
              <Star
                key={`s${i}`}
                className="mystery-star absolute fill-current"
                style={{
                  left: st.left,
                  top: st.top,
                  width: `${st.size}px`,
                  height: `${st.size}px`,
                  color: st.color,
                  filter: `drop-shadow(0 0 6px ${st.color})`,
                  animationDelay: st.delay,
                }}
              />
            ))}
          </div>
        )}

        {/* The mark */}
        <span
          aria-hidden="true"
          className="bg-gradient-to-br from-fuchsia-500 via-sky-500 to-emerald-500 bg-clip-text text-5xl font-black leading-none text-transparent drop-shadow-sm"
        >
          ?
        </span>

        {/* What was found */}
        <div className="relative z-[1] mt-3 max-w-xs text-center">
          <p className="text-sm font-semibold leading-snug">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            You&rsquo;ve stumbled onto {showKindChip ? `a kind ${event.kind} event` : 'an event kind'}{' '}
            Ditto can&rsquo;t render yet.
          </p>
        </div>

        {fallbackText && (
          <p
            className={cn(
              'relative z-[1] mt-3 max-w-md whitespace-pre-wrap break-words text-center text-foreground',
              expanded ? 'text-[15px] leading-relaxed' : 'text-sm leading-relaxed',
            )}
          >
            {fallbackText}
          </p>
        )}

        <Collapsible open={showDetails} onOpenChange={setShowDetails} className="relative z-[1] mt-2 w-full">
          <div className="flex justify-center">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                {showDetails ? 'Hide details' : 'View event'}
                <ChevronDown
                  className={cn('size-3.5 transition-transform', showDetails && 'rotate-180')}
                />
              </Button>
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent
            className="space-y-2 pt-2 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Event ID */}
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Event ID</p>
              <div className="flex items-center gap-1 rounded-lg bg-muted px-3 py-2">
                <p className="min-w-0 flex-1 select-all break-all font-mono text-xs text-foreground/80">
                  {nip19Id}
                </p>
                <CopyButton text={nip19Id} label="Event ID" />
              </div>
            </div>

            {/* Raw JSON */}
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Raw JSON</p>
              <div className="relative max-h-64 overflow-auto rounded-lg border border-border bg-muted">
                <div className="sticky right-2 top-2 float-right">
                  <CopyButton text={jsonText} label="Event JSON" />
                </div>
                <pre className="whitespace-pre p-3 font-mono text-xs leading-relaxed text-foreground/80">
                  {jsonText}
                </pre>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
