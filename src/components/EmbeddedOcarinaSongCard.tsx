import { useMemo } from 'react';
import { FormattedMessage } from 'react-intl';
import type { NostrEvent } from '@nostrify/nostrify';

import { EmbeddedCardShell } from '@/components/EmbeddedCardShell';
import { OcarinaStaff } from '@/components/OcarinaStaff';
import { SongMadeOf } from '@/components/OcarinaSongContent';
import { parseSong } from '@/lib/ocarinaSong';
import { tryNeventEncode } from '@/lib/safeNip19';

interface EmbeddedOcarinaSongCardProps {
  event: NostrEvent;
  className?: string;
  disableHoverCards?: boolean;
}

/** A quoted ocarina song (kind 1853): its name, what it was made of, and its staff. */
export function EmbeddedOcarinaSongCard({ event, className, disableHoverCards }: EmbeddedOcarinaSongCardProps) {
  const song = useMemo(() => parseSong(event), [event]);
  const nevent = tryNeventEncode({ id: event.id, author: event.pubkey, kind: event.kind }) ?? '';

  return (
    <EmbeddedCardShell
      pubkey={event.pubkey}
      createdAt={event.created_at}
      navigateTo={nevent}
      className={className}
      disableHoverCards={disableHoverCards}
    >
      {song ? (
        <div className="pt-1">
          <p className="truncate text-sm font-semibold leading-snug">
            {song.title ?? <FormattedMessage id="ocarinaSong.untitled" defaultMessage="Untitled song" />}
          </p>
          {song.link && <SongMadeOf link={song.link} className="truncate text-xs text-muted-foreground" />}
          <OcarinaStaff notes={song.notes} className="mt-2 h-20" />
        </div>
      ) : (
        <p className="pt-1 text-sm text-muted-foreground">
          <FormattedMessage id="ocarinaSong.unreadable" defaultMessage="An ocarina song that can't be read" />
        </p>
      )}
    </EmbeddedCardShell>
  );
}
