import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { useMemo } from 'react';

interface VanishEventContentProps {
  event: NostrEvent;
  /** Compact mode for feed cards — shorter layout */
  compact?: boolean;
}

/**
 * Dramatic display for NIP-62 Request to Vanish (kind 62) events.
 *
 * These events represent a user permanently erasing their entire identity
 * from the Nostr network. The display is intentionally theatrical — red
 * caution stripes, glitch effects, and a "grand exit" aesthetic.
 */
export function VanishEventContent({ event, compact }: VanishEventContentProps) {
  const npub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);
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

  if (compact) {
    return (
      <div className="mt-2 space-y-2">
        {/* Caution stripe header */}
        <div className="vanish-stripes h-2 rounded-full" />

        <div className="flex items-start gap-3 rounded-xl border-2 border-red-500/30 bg-red-500/5 p-3">
          {/* Glitch icon */}
          <div className="relative shrink-0 mt-0.5">
            <div className="size-10 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center">
              <span className="text-lg vanish-glitch-text" data-text="///">///</span>
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-red-600 flex items-center justify-center">
              <span className="text-[8px] font-black text-white leading-none">!</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-500 dark:text-red-400">
              {isGlobal ? 'Global Request to Vanish' : 'Request to Vanish'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
              {npub}
            </p>
            {reason && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">
                &ldquo;{reason}&rdquo;
              </p>
            )}
          </div>
        </div>

        <div className="vanish-stripes h-2 rounded-full" />
      </div>
    );
  }

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
