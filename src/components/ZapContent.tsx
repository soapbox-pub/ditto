import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { Zap } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { EmojifiedText } from '@/components/CustomEmoji';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';

import { useAuthor } from '@/hooks/useAuthor';
import { useFormatMoney } from '@/hooks/useFormatMoney';
import { useVerifiedOnchainZap } from '@/hooks/useOnchainZaps';
import { extractZapAmount, extractZapMessage } from '@/hooks/useEventInteractions';

import { genUserName } from '@/lib/genUserName';
import { isNostrId } from '@/lib/nostrId';

interface ZapContentProps {
  /** The zap event itself (kind 9735 Lightning receipt or kind 8333 on-chain). */
  event: NostrEvent;
  /**
   * If set, this is a profile-targeted zap and this pubkey is the
   * recipient (from the event's `p` tag). Renders a muted
   * "Zapped @recipient" context line above the amount. Omit for
   * note-zaps — those use `zappedBy` overlays on the target note.
   */
  recipientPubkey?: string;
}

/**
 * Renders the body of a standalone zap card: a muted "Zapped @recipient"
 * context line (for profile-targeted zaps), the prominent amber amount,
 * and the optional sender comment. Used inside `NoteCard`'s content
 * block for kind 9735 / 8333 events.
 */
export function ZapContent({ event, recipientPubkey }: ZapContentProps) {
  const isOnchain = event.kind === 8333;

  // For on-chain zaps, verify the claimed amount against the underlying
  // Bitcoin transaction. Lightning zaps are trusted via the LNURL
  // server's signature, so we read the amount directly.
  const verified = useVerifiedOnchainZap(isOnchain ? event : undefined);
  const isVerifying = isOnchain && verified === undefined;
  const failedVerification = isOnchain && verified === null;

  const sats = useMemo(() => {
    if (isOnchain) {
      if (verified?.amountSats) return verified.amountSats;
      const amountTag = event.tags.find(([n]) => n === 'amount');
      const n = amountTag?.[1] ? parseInt(amountTag[1], 10) : 0;
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
    return Math.floor(extractZapAmount(event) / 1000);
  }, [event, isOnchain, verified]);

  // Lightning zap messages live inside the embedded NIP-57 zap-request
  // JSON; on-chain zaps put the comment directly in `content`.
  const message = isOnchain ? event.content.trim() : extractZapMessage(event);

  const { format: formatMoney } = useFormatMoney();

  return (
    <div className="mt-2 space-y-2">
      {recipientPubkey && isNostrId(recipientPubkey) && (
        <ZapRecipientLine pubkey={recipientPubkey} />
      )}

      {sats > 0 && (
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-3xl font-bold text-amber-500 tabular-nums">
            {formatMoney(sats)}
          </span>
          {failedVerification ? (
            <span className="text-xs text-muted-foreground">unverified</span>
          ) : isVerifying ? (
            <span className="text-xs text-muted-foreground">verifying…</span>
          ) : null}
        </div>
      )}

      {message && (
        <p className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap break-words">
          {message}
        </p>
      )}
    </div>
  );
}

/** Muted "⚡ Zapped @recipient" context line, modeled on ProfileCommentContext. */
function ZapRecipientLine({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? metadata?.display_name ?? genUserName(pubkey);
  const npubEncoded = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);

  return (
    <div className="flex items-center gap-x-1 text-sm text-muted-foreground min-w-0 overflow-hidden">
      <Zap className="size-3.5 text-amber-500 shrink-0" />
      <span className="shrink-0">Zapped</span>
      <ProfileHoverCard pubkey={pubkey} asChild>
        <Link
          to={`/${npubEncoded}`}
          className="text-primary hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
        >
          @{author.data?.event ? (
            <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
          ) : (
            displayName
          )}
        </Link>
      </ProfileHoverCard>
    </div>
  );
}
