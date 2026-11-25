import { useEffect, useMemo, useState } from 'react';
import { FormattedMessage } from 'react-intl';
import { RotateCcw, Triangle } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogTitle,
} from '@/components/AdaptiveDialog';
import { Button } from '@/components/ui/button';
import {
  composeOcarinaSong,
  OCARINA_BUTTONS,
  playOcarinaSong,
  type OcarinaButton,
  type OcarinaSong,
} from '@/lib/ocarinaSong';
import { cn } from '@/lib/utils';

interface OcarinaSongDialogProps {
  event: NostrEvent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The post, played as a short ocarina song on the games' five-line staff. */
export function OcarinaSongDialog({ event, open, onOpenChange }: OcarinaSongDialogProps) {
  const song = useMemo(() => composeOcarinaSong(event.content.trim() || event.id), [event.content, event.id]);

  return (
    <AdaptiveDialog open={open} onOpenChange={onOpenChange}>
      <AdaptiveDialogContent
        className="max-w-md rounded-2xl"
        sheetClassName="px-6 pb-6 pt-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1 text-center">
          <AdaptiveDialogTitle className="text-2xl font-semibold">
            {song.word
              ? <FormattedMessage id="ocarina.title" defaultMessage="Song of {word}" values={{ word: song.word }} />
              : <FormattedMessage id="ocarina.titleUntitled" defaultMessage="The Nameless Song" />}
          </AdaptiveDialogTitle>
          <AdaptiveDialogDescription>
            <FormattedMessage id="ocarina.description" defaultMessage="Composed from this post, for ocarina" />
          </AdaptiveDialogDescription>
        </div>

        <OcarinaPlayer song={song} />
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}

/** Mounted while the dialog is open, so the song plays each time it opens. */
function OcarinaPlayer({ song }: { song: OcarinaSong }) {
  const [take, setTake] = useState(0);
  /** How many notes have sounded so far. */
  const [heard, setHeard] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    return playOcarinaSong(song, {
      onNote: (index) => setHeard(index + 1),
      onEnd: () => setPlaying(false),
    });
  }, [song, take]);

  const replay = () => {
    setHeard(0);
    setPlaying(true);
    setTake((n) => n + 1);
  };

  return (
    <div className="space-y-6 pt-4">
      <div className="relative h-40" aria-hidden>
        {OCARINA_BUTTONS.map((button) => (
          <div
            key={button}
            className="absolute inset-x-0 h-px bg-rose-500/40"
            style={{ top: lineTop(button) }}
          />
        ))}
        <div className="absolute inset-0 flex">
          {song.notes.map((note, i) => (
            <div key={i} className="relative flex-1">
              <NoteButton
                button={note.button}
                shown={i < heard}
                current={playing && i === heard - 1}
              />
            </div>
          ))}
        </div>
      </div>

      <Button variant="secondary" className="w-full" onClick={replay} disabled={playing}>
        <RotateCcw className="size-4" />
        <FormattedMessage id="ocarina.playAgain" defaultMessage="Play again" />
      </Button>
    </div>
  );
}

/** Where a button's staff line sits: the A button on the bottom line, C-up on top. */
function lineTop(button: OcarinaButton): string {
  return `${10 + (4 - OCARINA_BUTTONS.indexOf(button)) * 20}%`;
}

const ARROW_ROTATION: Record<Exclude<OcarinaButton, 'a'>, string> = {
  up: '',
  down: 'rotate-180',
  left: '-rotate-90',
  right: 'rotate-90',
};

function NoteButton({ button, shown, current }: { button: OcarinaButton; shown: boolean; current: boolean }) {
  return (
    <div
      className={cn(
        'absolute left-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full shadow-sm',
        'motion-safe:transition-[opacity,transform] motion-safe:duration-200',
        button === 'a' ? 'bg-blue-600 text-white' : 'bg-yellow-400 text-yellow-950',
        shown ? 'opacity-100' : 'opacity-0 scale-50',
        current && 'scale-125',
      )}
      style={{ top: lineTop(button) }}
    >
      {button === 'a'
        ? <span className="text-xs font-bold">A</span>
        : <Triangle className={cn('size-3 fill-current', ARROW_ROTATION[button])} />}
    </div>
  );
}
