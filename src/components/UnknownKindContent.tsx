import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
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

  const fallbackText = getEventFallbackText(event);
  // getKindLabel falls back to "Kind <n>" for kinds absent from the registry,
  // so this is always a meaningful noun phrase.
  const label = getKindLabel(event.kind);
  // Avoid a redundant "Kind 1234" chip when the label already *is* "Kind 1234".
  const showKindChip = label !== `Kind ${event.kind}`;

  const nip19Id = encodeEventAddress(event);
  const jsonText = JSON.stringify(event, null, 2);

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
          and hue-shifting behind a big prismatic "?". */}
      <div className="relative isolate flex flex-col items-center px-4 pt-6 pb-5 overflow-hidden">
        {/* Displacement field for .mystery-waves (see index.css) */}
        <svg aria-hidden="true" className="absolute size-0">
          <filter id="mystery-warp">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.028" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="28" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
        <div className="mystery-waves absolute -inset-4 -z-10 pointer-events-none" aria-hidden="true" />

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
