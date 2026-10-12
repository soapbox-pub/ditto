import { useMemo } from 'react';
import { CalendarRange, ShieldCheck, ShieldOff, ShieldQuestion, ShieldX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { FormattedMessage, defineMessage, useIntl, type MessageDescriptor } from 'react-intl';

import { EmbeddedNote } from '@/components/EmbeddedNote';
import { EmbeddedNaddr } from '@/components/EmbeddedNaddr';
import { parseAttestation, type AttestationState } from '@/lib/attestation';
import { cn } from '@/lib/utils';

interface AttestationContentProps {
  event: NostrEvent;
  /** When true, render a larger variant for the detail page. */
  expanded?: boolean;
  className?: string;
  /** When true, skip the embedded assertion-event preview (used inside embeds to avoid nesting). */
  disableTargetEmbed?: boolean;
}

interface StateStyle {
  label: MessageDescriptor;
  Icon: LucideIcon;
  /** Classes for the status pill. */
  pill: string;
  /** Classes for the pill icon. */
  icon: string;
}

const STATE_STYLES: Record<AttestationState, StateStyle> = {
  valid: {
    label: defineMessage({ id: 'attestation.state.valid', defaultMessage: 'Valid' }),
    Icon: ShieldCheck,
    pill: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
  invalid: {
    label: defineMessage({ id: 'attestation.state.invalid', defaultMessage: 'Invalid' }),
    Icon: ShieldX,
    pill: 'border-destructive/30 bg-destructive/10 text-destructive',
    icon: 'text-destructive',
  },
  verifying: {
    label: defineMessage({ id: 'attestation.state.verifying', defaultMessage: 'Verifying' }),
    Icon: ShieldQuestion,
    pill: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  revoked: {
    label: defineMessage({ id: 'attestation.state.revoked', defaultMessage: 'Revoked' }),
    Icon: ShieldOff,
    pill: 'border-border bg-secondary text-muted-foreground',
    icon: 'text-muted-foreground',
  },
};

/** Colored status pill for an attestation state — shared with embed cards. */
export function AttestationStatePill({ state, className }: { state: AttestationState; className?: string }) {
  const style = STATE_STYLES[state];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        style.pill,
        className,
      )}
    >
      <style.Icon className="size-3.5" aria-hidden="true" />
      <FormattedMessage {...style.label} />
    </span>
  );
}

/**
 * Renders a kind 31871 Attestation event — a truthfulness claim about
 * another Nostr event, signed by an attestor.
 *
 * - The `s` state renders as a colored status pill (valid / invalid /
 *   verifying / revoked).
 * - `valid_from` / `valid_to` render as a validity window line.
 * - `content` (the attestor's description) renders as plaintext — it is not
 *   kind-1 prose, so it never goes through the tokenizer.
 * - The assertion event (`e` or `a` tag) renders as an embedded preview card.
 */
export function AttestationContent({
  event,
  expanded = false,
  className,
  disableTargetEmbed = false,
}: AttestationContentProps) {
  const intl = useIntl();
  const attestation = useMemo(() => parseAttestation(event), [event]);

  if (!attestation) {
    // Missing/unknown `s` tag — nothing trustworthy to render.
    return (
      <div className={cn('mt-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground', className)}>
        <FormattedMessage id="attestation.malformed" defaultMessage="Malformed attestation" />
      </div>
    );
  }

  const { state, target, validFrom, validTo, description } = attestation;
  const style = STATE_STYLES[state];
  const formatDate = (ts: number) => intl.formatDate(ts * 1000, { year: 'numeric', month: 'short', day: 'numeric' });
  const validity = validFrom !== undefined && validTo !== undefined
    ? intl.formatMessage({ id: 'attestation.validRange', defaultMessage: 'Valid {from} – {to}' }, { from: formatDate(validFrom), to: formatDate(validTo) })
    : validFrom !== undefined
      ? intl.formatMessage({ id: 'attestation.validFrom', defaultMessage: 'Valid from {date}' }, { date: formatDate(validFrom) })
      : validTo !== undefined
        ? intl.formatMessage({ id: 'attestation.validUntil', defaultMessage: 'Valid until {date}' }, { date: formatDate(validTo) })
        : undefined;
  const expired = validTo !== undefined && validTo * 1000 < Date.now();

  return (
    <div className={cn(expanded ? 'mt-3 space-y-3' : 'mt-2 space-y-2.5', className)}>
      {/* Status pill + validity window */}
      <div className="flex flex-wrap items-center gap-2">
        <AttestationStatePill state={state} />
        {validity && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarRange className="size-3.5" aria-hidden="true" />
            {validity}
            {expired && state !== 'revoked' && <span className="italic"><FormattedMessage id="attestation.windowPassed" defaultMessage="(window passed)" /></span>}
          </span>
        )}
      </div>

      {/* Attestor's human-readable description — plaintext, never tokenized */}
      {description && (
        <p
          dir="auto"
          className={cn(
            'whitespace-pre-wrap break-words text-foreground',
            expanded ? 'text-[17px] leading-relaxed' : 'text-[15px] leading-relaxed',
          )}
        >
          {description}
        </p>
      )}

      {/* The assertion event being attested to */}
      {target && !disableTargetEmbed && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <style.Icon className={cn('size-3', style.icon)} aria-hidden="true" />
            <FormattedMessage id="attestation.attestingTo" defaultMessage="Attesting to" />
          </div>
          {target.type === 'addr' ? (
            <EmbeddedNaddr addr={target.addr} className="my-0" />
          ) : (
            <EmbeddedNote
              eventId={target.id}
              relays={target.relays}
              authorHint={target.authorHint}
              className="my-0"
            />
          )}
        </div>
      )}
    </div>
  );
}
