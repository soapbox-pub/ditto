import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Play, Square } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { NostrEvent } from '@nostrify/nostrify';

import { OcarinaStaff } from '@/components/OcarinaStaff';
import { useAuthor } from '@/hooks/useAuthor';
import { useOcarinaPlayback } from '@/hooks/useOcarinaPlayback';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { getDisplayName } from '@/lib/getDisplayName';
import { parseSong, type SongLink, type SongPost } from '@/lib/ocarinaSong';
import { tryNeventEncode } from '@/lib/safeNip19';
import { cn } from '@/lib/utils';

/** An ocarina song (kind 1853) in a feed or on its own page: its name, what it was made of, its staff, and a play button. */
export function OcarinaSongContent({ event, className }: { event: NostrEvent; className?: string }) {
  const song = useMemo(() => parseSong(event), [event]);
  if (!song) return null;
  return <OcarinaSongBody song={song} className={className} />;
}

function OcarinaSongBody({ song, className }: { song: SongPost; className?: string }) {
  const intl = useIntl();
  const { play, stop, playing, heard } = useOcarinaPlayback();

  return (
    <div className={cn('mt-2 object-card p-3', className)}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (playing) stop();
            else play(song);
          }}
          aria-label={playing
            ? intl.formatMessage({ id: 'ocarinaSong.stop', defaultMessage: 'Stop' })
            : intl.formatMessage({ id: 'ocarinaSong.play', defaultMessage: 'Play' })}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-safe:active:scale-95"
        >
          {playing ? <Square className="size-4 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-snug">
            {song.title ?? <FormattedMessage id="ocarinaSong.untitled" defaultMessage="Untitled song" />}
          </p>
          {song.link && <SongMadeOf link={song.link} className="truncate text-sm text-muted-foreground" />}
        </div>
      </div>
      <OcarinaStaff notes={song.notes} current={playing ? heard - 1 : null} className="mt-3 h-28" />
    </div>
  );
}

/** Which word says what a kind of event is, for "made of …". */
function kindKey(kind: number | undefined): string {
  switch (kind) {
    case 0: return 'profile';
    case 1: return 'note';
    case 20: return 'photo';
    case 777: return 'spell';
    case 1111: return 'comment';
    case 1853: return 'song';
    case 3367: return 'colors';
    case 30023: return 'article';
    default: return 'other';
  }
}

/** What a song was made of, linked, and whose that was, credited. */
export function SongMadeOf({ link, className }: { link: SongLink; className?: string }) {
  const author = useAuthor(link.pubkey);
  const metadata = author.data?.metadata;
  const profileUrl = useProfileUrl(link.pubkey ?? '', metadata);
  const nevent = tryNeventEncode({ id: link.id, author: link.pubkey, kind: link.kind, relays: link.relay ? [link.relay] : undefined });
  const kind = kindKey(link.kind);

  const source = (chunks: React.ReactNode[]) => nevent
    ? <Link to={`/${nevent}`} onClick={(e) => e.stopPropagation()} className="text-foreground hover:underline">{chunks}</Link>
    : <>{chunks}</>;

  if (!link.pubkey) {
    return (
      <p className={className}>
        <FormattedMessage
          id="ocarinaSong.madeOfAnon"
          defaultMessage="Made of <source>{kind, select, profile {a profile} note {a post} photo {a photo} spell {a spell} comment {a comment} song {a song} colors {a color moment} article {an article} other {a post}}</source>"
          values={{ kind, source }}
        />
      </p>
    );
  }

  const name = getDisplayName(metadata);
  return (
    <p className={className}>
      <FormattedMessage
        id="ocarinaSong.madeOf"
        defaultMessage="Made of <source>{kind, select, profile {a profile} note {a post} photo {a photo} spell {a spell} comment {a comment} song {a song} colors {a color moment} article {an article} other {a post}}</source> by <who>{name}</who>"
        values={{
          kind,
          name,
          source,
          who: (chunks: React.ReactNode[]) => (
            <Link to={profileUrl} onClick={(e) => e.stopPropagation()} className="text-foreground hover:underline">{chunks}</Link>
          ),
        }}
      />
    </p>
  );
}
