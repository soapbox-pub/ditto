import { HardDrive, LockKeyholeOpen, ShieldAlert } from 'lucide-react';
import { FormattedMessage } from 'react-intl';

import { Button } from '@/components/ui/button';
import { useAudioPlayer } from '@/contexts/audioPlayerContextDef';
import { useTrackLoadState } from '@/hooks/useTrackLoadState';
import { formatBytes } from '@/lib/formatBytes';
import { cn } from '@/lib/utils';

interface TrackLoadNoticeProps {
  /** Event ID of the track this notice belongs to. */
  trackId: string;
  className?: string;
}

/**
 * Explains why a track that was asked to play isn't playing yet — or can't.
 *
 * Renders nothing for the normal case. Encrypted audio has to be fetched and
 * decrypted in full before it starts, which is slow enough to need a label and
 * can fail outright, and silence with no explanation reads as a broken button.
 */
export function TrackLoadNotice({ trackId, className }: TrackLoadNoticeProps) {
  const loadState = useTrackLoadState(trackId);
  const { decryptAnyway } = useAudioPlayer();

  if (loadState.status === 'ready') return null;

  const Icon = loadState.status === 'too-large'
    ? HardDrive
    : loadState.status === 'unsupported'
      ? ShieldAlert
      : LockKeyholeOpen;

  return (
    <div className={cn('flex flex-wrap items-center gap-2 text-xs text-muted-foreground', className)}>
      {loadState.status === 'decrypting'
        ? (
          <>
            <LockKeyholeOpen className="size-3.5 shrink-0 motion-safe:animate-pulse" aria-hidden />
            <span><FormattedMessage id="audioPlayer.decrypting" defaultMessage="Decrypting…" /></span>
          </>
        )
        : (
          <>
            <Icon className="size-3.5 shrink-0" aria-hidden />
            <span>
              {loadState.status === 'too-large'
                ? (
                  <FormattedMessage
                    id="audioPlayer.tooLarge"
                    defaultMessage="This track is {size}. Decrypting it may use a lot of memory."
                    values={{ size: formatBytes(loadState.byteSize) }}
                  />
                )
                : loadState.status === 'unsupported'
                  ? <FormattedMessage id="audioPlayer.unsupported" defaultMessage="This track uses an encryption method Ditto doesn't support." />
                  : <FormattedMessage id="audioPlayer.failed" defaultMessage="This track couldn't be decrypted." />}
            </span>
          </>
        )}

      {loadState.status === 'too-large' && (
        <Button
          variant="outline"
          size="sm"
          className="h-6 rounded-full px-2.5 text-xs"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); decryptAnyway(); }}
        >
          <FormattedMessage id="audioPlayer.decryptAnyway" defaultMessage="Decrypt anyway" />
        </Button>
      )}
    </div>
  );
}
