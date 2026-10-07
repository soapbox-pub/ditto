import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';

interface VanishEventContentProps {
  event: NostrEvent;
  /** Compact mode for feed cards — shorter layout */
  compact?: boolean;
}

interface VanishCardCompactProps {
  event: { pubkey: string; content: string; tags: string[][] };
  /** Optional className for the outer container */
  className?: string;
  /** Optional timestamp text shown to the right of the title */
  timestamp?: string;
}

/**
 * Compact card for NIP-62 Request to Vanish events.
 *
 * Used everywhere a vanish event needs a small inline preview: feed cards,
 * embedded quotes, reply composer, threaded ancestors, etc. Stripes render
 * inside the bordered container so they stay visually contained.
 */
export function VanishCardCompact({ event, className, timestamp }: VanishCardCompactProps) {
  const npub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);
  const isGlobal = event.tags.some(([n, v]) => n === 'relay' && v === 'ALL_RELAYS');
  const reason = event.content || undefined;

  return (
    <div className={cn('rounded-xl border-2 border-red-500/30 overflow-hidden', className)}>
      {/* Top caution stripe */}
      <div className="vanish-stripes h-1.5" />

      <div className="px-3 py-2.5 bg-red-500/[0.04] dark:bg-red-500/[0.06] space-y-1.5">
        {/* Header row */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative shrink-0">
            <div className="size-8 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <span className="text-sm font-black vanish-glitch-text text-red-500 dark:text-red-400" data-text="///">///</span>
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-red-600 flex items-center justify-center">
              <span className="text-[7px] font-black text-white leading-none">!</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-500 dark:text-red-400 leading-tight">
              {isGlobal ? 'Global Request to Vanish' : 'Request to Vanish'}
            </p>
            <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
              {npub}
            </p>
          </div>

          {timestamp && (
            <span className="text-[11px] text-muted-foreground shrink-0">
              {timestamp}
            </span>
          )}
        </div>

        {/* Reason quote if available */}
        {reason && (
          <p className="text-xs text-muted-foreground italic line-clamp-2 pl-[42px]">
            &ldquo;{reason}&rdquo;
          </p>
        )}
      </div>

      {/* Bottom caution stripe */}
      <div className="vanish-stripes h-1.5" />
    </div>
  );
}

/**
 * Dramatic display for NIP-62 Request to Vanish (kind 62) events.
 *
 * These events represent a user permanently erasing their entire identity
 * from the Nostr network. The display is intentionally theatrical — red
 * caution stripes, glitch effects, and a "grand exit" aesthetic.
 *
 * This is the full detail-page view. For compact inline previews, use
 * {@link VanishCardCompact} instead.
 */
export function VanishEventContent({ event, compact }: VanishEventContentProps) {
  if (compact) {
    return <VanishCardCompact event={event} className="mt-2" />;
  }

  const npub = nip19.npubEncode(event.pubkey);
  const relayTags = event.tags.filter(([n]) => n === 'relay');
  const isGlobal = relayTags.some(([, v]) => v === 'ALL_RELAYS');
  const relayList = relayTags.map(([, v]) => v).filter((v) => v !== 'ALL_RELAYS');
  const reason = event.content || undefined;

  const formattedDate = new Date(event.created_at * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <div className="mt-4 space-y-0">
      {/* Top caution stripe band */}
      <div className="vanish-stripes h-3 rounded-t-xl" />

      {/* Main card body */}
      <div className="relative border-x-2 border-red-500/30 bg-gradient-to-b from-red-500/[0.06] to-red-500/[0.02] dark:from-red-500/[0.08] dark:to-red-500/[0.03] px-5 py-6 overflow-hidden isolate">
        {/* Subtle diagonal line pattern in background */}
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] -z-10 pointer-events-none"
          style={{
            backgroundImage: 'repeating-linear-gradient(45deg, currentColor 0, currentColor 1px, transparent 0, transparent 50%)',
            backgroundSize: '12px 12px',
          }}
        />

        {/* Glitch icon cluster */}
        <div className="flex justify-center mb-5">
          <div className="relative">
            {/* Outer ring pulse */}
            <div className="absolute inset-0 rounded-full border-2 border-red-500/20 vanish-ring-pulse" />
            <div className="absolute -inset-2 rounded-full border border-red-500/10 vanish-ring-pulse-delayed" />

            {/* Main icon */}
            <div className="relative size-16 rounded-full bg-red-500/10 border-2 border-red-500/40 flex items-center justify-center shadow-lg shadow-red-500/10">
              <span className="text-2xl font-black vanish-glitch-text text-red-500 dark:text-red-400" data-text="///">///</span>
            </div>

            {/* Alert badge */}
            <div className="absolute -bottom-1 -right-1 size-6 rounded-full bg-red-600 border-2 border-background flex items-center justify-center shadow-md">
              <span className="text-xs font-black text-white leading-none">!</span>
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="text-center space-y-2">
          <h3 className="text-lg font-black tracking-tight text-red-500 dark:text-red-400 uppercase">
            {isGlobal ? 'Global Request to Vanish' : 'Request to Vanish'}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
            {isGlobal
              ? 'This identity has requested permanent erasure from all Nostr relays.'
              : `This identity has requested permanent erasure from ${relayList.length} relay${relayList.length !== 1 ? 's' : ''}.`}
          </p>
        </div>

        {/* Identity card */}
        <div className="mt-5 rounded-lg border border-red-500/20 bg-red-500/[0.04] dark:bg-red-500/[0.06] p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider font-bold">
            <div className="size-2 rounded-full bg-red-500 vanish-blink" />
            <span>Identity</span>
          </div>
          <p className="font-mono text-xs text-foreground/80 break-all leading-relaxed select-all">
            {npub}
          </p>
        </div>

        {/* Reason quote (if provided) */}
        {reason && (
          <div className="mt-4 rounded-lg border border-border/50 bg-background/50 p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-2">
              Final words
            </p>
            <blockquote className="text-sm text-foreground/80 italic leading-relaxed pl-3 border-l-2 border-red-500/40">
              &ldquo;{reason}&rdquo;
            </blockquote>
          </div>
        )}

        {/* Relay targets (if specific relays listed) */}
        {!isGlobal && relayList.length > 0 && (
          <div className="mt-4 rounded-lg border border-border/50 bg-background/50 p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-2">
              Target relays
            </p>
            <div className="space-y-1">
              {relayList.map((relay) => (
                <p key={relay} className="font-mono text-xs text-foreground/70">
                  {relay}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Timestamp */}
        <p className="text-center text-xs text-muted-foreground mt-5">
          {formattedDate}
        </p>
      </div>

      {/* Bottom caution stripe band */}
      <div className="vanish-stripes h-3 rounded-b-xl" />
    </div>
  );
}
