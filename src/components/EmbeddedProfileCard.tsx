import { useMemo } from 'react';
import { FormattedMessage } from 'react-intl';
import { UserRoundPen } from 'lucide-react';
import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';

import { EmbeddedCardShell } from '@/components/EmbeddedCardShell';
import { encodeEventAddress } from '@/lib/encodeEvent';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

interface EmbeddedProfileCardProps {
  event: NostrEvent;
  className?: string;
  disableHoverCards?: boolean;
}

/**
 * Compact embedded card for kind 0 (NIP-01 profile metadata).
 *
 * Without this branch the generic fallbacks would run the event's `content`
 * — a JSON blob — through the kind-1 tokenizer, linkifying the URLs inside
 * it. Here the JSON is parsed and only the human-readable parts are shown.
 *
 * The shell's author row already renders the (current) name and avatar, so
 * the body sticks to what the update itself contains: the new banner and bio.
 */
export function EmbeddedProfileCard({ event, className, disableHoverCards }: EmbeddedProfileCardProps) {
  const metadata: NostrMetadata = useMemo(() => {
    const parsed = n.json().pipe(n.metadata()).safeParse(event.content);
    return parsed.success ? parsed.data : {};
  }, [event.content]);

  const nip19Id = useMemo(() => encodeEventAddress(event), [event]);
  const banner = useMemo(() => sanitizeUrl(metadata.banner), [metadata.banner]);

  return (
    <EmbeddedCardShell
      pubkey={event.pubkey}
      createdAt={event.created_at}
      navigateTo={nip19Id}
      className={className}
      disableHoverCards={disableHoverCards}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <UserRoundPen className="size-3.5 shrink-0 text-primary" />
        <p className="line-clamp-1 text-sm font-semibold leading-snug">
          <FormattedMessage id="profileUpdate.embedTitle" defaultMessage="Profile update" />
        </p>
      </div>

      {banner && (
        <div className="overflow-hidden rounded-lg">
          <img
            src={banner}
            alt=""
            className="max-h-[100px] w-full object-cover"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {metadata.about?.trim() && (
        <p className="line-clamp-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
          {metadata.about.trim()}
        </p>
      )}
    </EmbeddedCardShell>
  );
}
