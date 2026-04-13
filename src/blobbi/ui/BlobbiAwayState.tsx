import { Footprints, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const SIZE_PRESETS = {
  sm: {
    wrapper: 'flex flex-col items-center gap-3 py-6',
    icon: 'size-10 text-muted-foreground/30',
    name: 'text-sm font-semibold',
    description: 'text-xs text-muted-foreground',
    button: 'flex items-center gap-2 px-4 py-2 rounded-full text-white text-xs font-semibold transition-all hover:-translate-y-0.5 hover:scale-105 active:scale-95',
    buttonIcon: 'size-3.5',
    buttonLabel: (_name: string) => 'Bring home',
    descriptionText: (_name: string) => 'Out exploring with you',
  },
  md: {
    wrapper: 'flex flex-col items-center justify-center gap-6 text-center',
    icon: 'size-16 text-muted-foreground/30',
    name: '', // not shown separately in md — name is inline in description
    description: 'text-muted-foreground text-sm',
    button: 'flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-full text-white font-semibold transition-all duration-300 ease-out hover:-translate-y-0.5 hover:scale-105 hover:brightness-110 active:scale-95',
    buttonIcon: 'size-5',
    buttonLabel: (name: string) => `Bring ${name} home`,
    descriptionText: (name: string) => `${name} is out exploring right now.`,
  },
} as const;

export interface BlobbiAwayStateProps {
  /** The Blobbi's name. */
  name: string;
  /** Visual size preset. 'md' for full page, 'sm' for widget. */
  size?: 'sm' | 'md';
  /** Whether the companion update is in progress. */
  isUpdating: boolean;
  /** Callback to bring the Blobbi home (unset as floating companion). */
  onBringHome: () => void;
}

/** Shared "out exploring" state shown when a Blobbi is the active floating companion. */
export function BlobbiAwayState({ name, size = 'md', isUpdating, onBringHome }: BlobbiAwayStateProps) {
  const preset = SIZE_PRESETS[size];

  return (
    <div className={preset.wrapper}>
      <Footprints className={preset.icon} />
      {size === 'sm' && <span className={preset.name}>{name}</span>}
      <p className={preset.description}>{preset.descriptionText(name)}</p>
      <button
        onClick={onBringHome}
        disabled={isUpdating}
        className={cn(preset.button, isUpdating && 'opacity-50 pointer-events-none')}
        style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899, #f59e0b)' }}
      >
        {isUpdating
          ? <Loader2 className={cn(preset.buttonIcon, 'animate-spin')} />
          : <Footprints className={preset.buttonIcon} />}
        <span>{preset.buttonLabel(name)}</span>
      </button>
    </div>
  );
}
