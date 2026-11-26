import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogTitle,
} from '@/components/AdaptiveDialog';
import { OcarinaStaff } from '@/components/OcarinaStaff';
import { OcarinaTalk, type TalkChoice, type TalkPart } from '@/components/OcarinaTalk';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useOcarinaPlayback } from '@/hooks/useOcarinaPlayback';
import { getDisplayName } from '@/lib/getDisplayName';
import { playFanfare } from '@/lib/ocarinaAudio';
import { eventSong, songToEvent } from '@/lib/ocarinaSong';
import { tryNeventEncode } from '@/lib/safeNip19';

interface OcarinaSongDialogProps {
  event: NostrEvent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The post, played as a short ocarina song on the games' staff, then the
 * question the games would ask: share it? Sharing publishes the song (kind
 * 1853, crediting the post's author) and opens a quote of the post with the
 * song in it.
 */
export function OcarinaSongDialog({ event, open, onOpenChange }: OcarinaSongDialogProps) {
  const intl = useIntl();
  const [shared, setShared] = useState<NostrEvent | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const sharedNevent = shared ? tryNeventEncode({ id: shared.id, author: shared.pubkey, kind: shared.kind }) : undefined;

  return (
    <>
      <AdaptiveDialog open={open} onOpenChange={onOpenChange}>
        <AdaptiveDialogContent
          className="max-w-xl overflow-hidden rounded-2xl border-none p-0"
          sheetClassName="p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <AdaptiveDialogTitle className="sr-only">
            {intl.formatMessage({ id: 'ocarina.dialog.title', defaultMessage: 'Ocarina song' })}
          </AdaptiveDialogTitle>
          <AdaptiveDialogDescription className="sr-only">
            {intl.formatMessage({ id: 'ocarina.description', defaultMessage: 'Composed from this post, for ocarina' })}
          </AdaptiveDialogDescription>
          <OcarinaScene
            event={event}
            onShared={setShared}
            onCompose={() => {
              onOpenChange(false);
              setTimeout(() => setComposeOpen(true), 150);
            }}
            onClose={() => onOpenChange(false)}
          />
        </AdaptiveDialogContent>
      </AdaptiveDialog>

      {sharedNevent && (
        <ReplyComposeModal
          open={composeOpen}
          onOpenChange={setComposeOpen}
          quotedEvent={event}
          initialContent={`\n\nnostr:${sharedNevent}`}
        />
      )}
    </>
  );
}

type Phase = 'playing' | 'played' | 'ask' | 'sending' | 'sent' | 'failed';

interface OcarinaSceneProps {
  event: NostrEvent;
  onShared: (song: NostrEvent) => void;
  onCompose: () => void;
  onClose: () => void;
}

/** Mounted while the dialog is open, so the song plays each time it opens. */
function OcarinaScene({ event, onShared, onCompose, onClose }: OcarinaSceneProps) {
  const intl = useIntl();
  const { user } = useCurrentUser();
  const author = useAuthor(event.pubkey);
  const { mutate: publish } = useNostrPublish();
  const song = useMemo(() => eventSong(event), [event]);
  const { play, playing, heard } = useOcarinaPlayback();
  const [phase, setPhase] = useState<Phase>('playing');

  useEffect(() => {
    play(song, () => setPhase('played'));
  }, [play, song]);

  const title = song.title ?? '';
  const name = getDisplayName(author.data?.metadata);

  const again = () => {
    setPhase('playing');
    play(song, () => setPhase('ask'));
  };

  const share = () => {
    setPhase('sending');
    publish(songToEvent(song), {
      onSuccess: (published) => {
        playFanfare();
        onShared(published);
        setPhase('sent');
      },
      onError: () => setPhase('failed'),
    });
  };

  const choices = {
    share: { label: intl.formatMessage({ id: 'ocarina.choice.share', defaultMessage: 'Share it' }), onChoose: share },
    again: { label: intl.formatMessage({ id: 'ocarina.choice.again', defaultMessage: 'Play it again' }), onChoose: again },
    notNow: { label: intl.formatMessage({ id: 'ocarina.choice.notNow', defaultMessage: 'Not now' }), onChoose: onClose },
    retry: { label: intl.formatMessage({ id: 'ocarina.choice.retry', defaultMessage: 'Try again' }), onChoose: share },
    okay: { label: intl.formatMessage({ id: 'ocarina.choice.okay', defaultMessage: 'Okay' }), onChoose: onClose },
  } satisfies Record<string, TalkChoice>;

  const talk: { line: TalkPart[]; choices?: TalkChoice[]; onNext?: () => void } | null = (() => {
    switch (phase) {
      case 'playing':
        return null;
      case 'played':
        return {
          line: toParts(intl.formatMessage(
            { id: 'ocarina.talk.played', defaultMessage: 'You played <red>{title}</red>!' },
            { title, red: redChunks },
          )),
          onNext: () => setPhase('ask'),
        };
      case 'ask':
        if (!user) {
          return {
            line: [{ text: intl.formatMessage({ id: 'ocarina.talk.logIn', defaultMessage: 'Log in, and you can share the songs you play.' }) }],
            choices: [choices.again, choices.okay],
          };
        }
        return {
          line: user.pubkey === event.pubkey
            ? [{ text: intl.formatMessage({ id: 'ocarina.talk.askOwn', defaultMessage: 'Share it, so everyone can hear it?' }) }]
            : toParts(intl.formatMessage(
              { id: 'ocarina.talk.ask', defaultMessage: 'Share it, so everyone can hear it? <red>{name}</red> will be credited for it.' },
              { name, red: redChunks },
            )),
          choices: [choices.share, choices.again, choices.notNow],
        };
      case 'sending':
        return { line: [{ text: intl.formatMessage({ id: 'ocarina.talk.sending', defaultMessage: 'Sending it out…' }) }] };
      case 'sent':
        return {
          line: toParts(intl.formatMessage(
            { id: 'ocarina.talk.sent', defaultMessage: 'You shared <red>{title}</red>! Now tell everyone about it.' },
            { title, red: redChunks },
          )),
          onNext: onCompose,
        };
      case 'failed':
        return {
          line: [{ text: intl.formatMessage({ id: 'ocarina.talk.failed', defaultMessage: "That didn't send. Try again?" }) }],
          choices: [choices.retry, choices.notNow],
        };
    }
  })();

  return (
    <div className="relative flex min-h-[28rem] flex-col justify-between gap-8 overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_top,#1f4a3a,#0b1a22_70%)] p-6 sm:p-8">
      <OcarinaStaff
        notes={song.notes}
        shown={phase === 'playing' ? heard : song.notes.length}
        current={playing ? heard - 1 : null}
        className="mt-8 h-40"
      />
      <div className="min-h-[6.5rem]">
        {talk && <OcarinaTalk key={phase} line={talk.line} choices={talk.choices} onNext={talk.onNext} />}
      </div>
    </div>
  );
}

/** Marks a stretch of a message red, for `toParts` to find. */
function redChunks(chunks: string[]): string {
  return `\uE000${chunks.join('')}\uE001`;
}

/** A message with `<red>` stretches marked by `redChunks`, as parts of a line. */
function toParts(said: string): TalkPart[] {
  return said.split(/(\uE000[^\uE001]*\uE001)/).filter(Boolean).map((part) => (
    part.startsWith('\uE000') ? { text: part.slice(1, -1), red: true } : { text: part }
  ));
}
