import { Box, Lock } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { NostrEvent } from '@nostrify/nostrify';

import { EmbeddedCardShell } from '@/components/EmbeddedCardShell';
import { Skeleton } from '@/components/ui/skeleton';
import { useSnoPreview, useSnoTree } from '@/hooks/useSnoTree';
import { isEncryptedSno } from '@/lib/sno';
import { tryNaddrEncode } from '@/lib/safeNip19';

interface EmbeddedSnoCardProps {
  event: NostrEvent;
  className?: string;
  disableHoverCards?: boolean;
}

/** Compact quote embed for a Simple Nostr Object (kind 33331): a still, its name, and its size. */
export function EmbeddedSnoCard({ event, className, disableHoverCards }: EmbeddedSnoCardProps) {
  const intl = useIntl();
  const { object, root, isLoading } = useSnoTree(event);
  const preview = useSnoPreview(event.id, root);
  const encrypted = isEncryptedSno(event);

  const identifier = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
  const naddr = tryNaddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier }) ?? '';

  const name = object?.name.trim()
    || event.tags.find(([n]) => n === 'name')?.[1]?.trim()
    || intl.formatMessage({ id: 'sno.untitled', defaultMessage: 'Untitled object' });

  return (
    <EmbeddedCardShell
      pubkey={event.pubkey}
      createdAt={event.created_at}
      navigateTo={naddr}
      className={className}
      disableHoverCards={disableHoverCards}
    >
      <div className="flex items-center gap-3 pt-1">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground">
          {preview.data ? (
            <img src={preview.data} alt="" className="size-full object-contain" />
          ) : (isLoading || preview.isLoading) && !encrypted ? (
            <Skeleton className="size-full rounded-none" />
          ) : encrypted ? (
            <Lock className="size-5" />
          ) : (
            <Box className="size-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-snug">{name}</p>
          <p className="truncate text-xs text-muted-foreground tabular-nums">
            {encrypted ? (
              <FormattedMessage id="sno.encryptedShort" defaultMessage="Hidden in cyberspace" />
            ) : object ? (
              <FormattedMessage
                id="sno.stats"
                defaultMessage="{vertices, plural, one {# vertex} other {# vertices}} · {faces, plural, one {# face} other {# faces}}{parts, plural, =0 {} one { · # placed object} other { · # placed objects}}"
                values={{ vertices: object.colors.length, faces: object.faces.length, parts: object.parts.length }}
              />
            ) : (
              <FormattedMessage id="sno.kind" defaultMessage="3D object" />
            )}
          </p>
        </div>
      </div>
    </EmbeddedCardShell>
  );
}
