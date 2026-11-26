import { Triangle } from 'lucide-react';

import { bendMark, STEPS, type SongNote, type Step } from '@/lib/ocarinaSong';
import { cn } from '@/lib/utils';

interface OcarinaStaffProps {
  notes: SongNote[];
  /** How many notes to show, for a song still being played. All of them when left out. */
  shown?: number;
  /** The note sounding now, if any. */
  current?: number | null;
  className?: string;
}

/** A song on the games' five-line staff: the A button on the bottom line, C-up on top. */
export function OcarinaStaff({ notes, shown = notes.length, current = null, className }: OcarinaStaffProps) {
  const small = notes.length > 10;

  return (
    <div className={cn('relative h-32', className)} aria-hidden>
      {STEPS.map((step) => (
        <div key={step} className="absolute inset-x-0 h-px bg-rose-500/50" style={{ top: lineTop(step) }} />
      ))}
      <div className="absolute inset-0 flex px-2">
        {notes.map((note, i) => (
          <div key={i} className="relative min-w-0 flex-1">
            <NoteButton note={note} shown={i < shown} current={i === current} small={small} />
          </div>
        ))}
      </div>
    </div>
  );
}

function lineTop(step: Step): string {
  return `${10 + (4 - step) * 20}%`;
}

/** Down, right, left, up: the C buttons for holes one to four. */
const ARROW_ROTATION = ['', 'rotate-180', 'rotate-90', '-rotate-90', ''] as const;

function NoteButton({ note, shown, current, small }: { note: SongNote; shown: boolean; current: boolean; small: boolean }) {
  return (
    <div
      className={cn(
        'absolute left-1/2 -translate-x-1/2 -translate-y-1/2',
        'motion-safe:transition-[opacity,transform] motion-safe:duration-200',
        shown ? 'opacity-100' : 'scale-50 opacity-0',
        current && 'scale-125',
      )}
      style={{ top: lineTop(note.step) }}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-full shadow-sm',
          small ? 'size-5' : 'size-7',
          note.step === 0 ? 'bg-blue-600 text-white' : 'bg-yellow-400 text-yellow-950',
        )}
      >
        {note.step === 0
          ? <span className={cn('font-bold', small ? 'text-[10px]' : 'text-xs')}>A</span>
          : <Triangle className={cn('fill-current', small ? 'size-2.5' : 'size-3', ARROW_ROTATION[note.step])} />}
      </div>
      {note.bend !== 0 && (
        <span className="absolute -right-2.5 -top-2 text-xs font-bold text-rose-500">{bendMark(note.bend)}</span>
      )}
    </div>
  );
}
