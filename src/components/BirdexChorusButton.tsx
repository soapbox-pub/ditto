import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Loader2, Play } from 'lucide-react';

import { useBirdSong } from '@/hooks/useBirdSong';
import { useWikidataEntity } from '@/hooks/useWikidataEntity';
import { cn } from '@/lib/utils';

/**
 * Chorus play/pause button for a Birdex (kind 12473) life list.
 *
 * A single control that fires every species' reference recording from
 * Wikipedia/Commons *at the same time*, producing an overlapping
 * dawn-chorus effect. Each recording loops independently so the
 * chorus sustains until the user hits pause.
 *
 * Architecture: the parent owns a single `isPlaying` flag. It renders
 * one `BirdexChorusVoice` per species, each of which:
 *   1. Resolves its Wikidata ID → Wikipedia title → Commons audio URL
 *      via the same hooks the tile thumbnails already call (so the
 *      title-resolution round-trips are cache hits).
 *   2. Owns a hidden `<audio loop>` element.
 *   3. Reacts to `isPlaying` by calling `play()` or `pause()` on its
 *      element, and reports ready-state / error-state back up so the
 *      button knows when to show a spinner and whether there's
 *      anything audible to play at all.
 *
 * Voices that fail to resolve audio (species whose Wikipedia article
 * has no usable field recording) are silently skipped — the chorus
 * plays whatever subset has audio. If nothing at all has audio the
 * button hides itself rather than rendering a dead control.
 *
 * Recordings are looked up on the first press, not on mount: a life
 * list has dozens of species, and resolving all of them for every Birdex
 * on screen cost a few hundred Wikipedia requests per profile, mostly
 * for a button nobody pressed. Until then the button can't know whether
 * any species has audio, so it shows; it spins while the first voices
 * resolve and hides if none turns out to have any. Every request is
 * cached for 24h via TanStack Query, so a second press is instant.
 */

export interface BirdexChorusSpecies {
  /** Wikidata entity ID, e.g. "Q26825". */
  entityId: string;
}

interface BirdexChorusButtonProps {
  species: BirdexChorusSpecies[];
  className?: string;
}

type VoiceState = 'loading' | 'ready' | 'missing';

export function BirdexChorusButton({ species, className }: BirdexChorusButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  /** Pressed at least once, so the voices are mounted and resolving. */
  const [armed, setArmed] = useState(false);

  // Track each voice's readiness so we can disable the button while
  // anything is still resolving, and hide it entirely when no voice
  // has usable audio. A Map keyed by entityId so voices can update
  // their slot without racing by array index.
  const [voiceStates, setVoiceStates] = useState<Map<string, VoiceState>>(
    () => new Map(species.map((s) => [s.entityId, 'loading' as VoiceState])),
  );

  // Keep the map in sync when the species list changes (e.g. the
  // Birdex event is replaced with a newer version). Entries that
  // disappear are dropped; new ones start as `loading`.
  useEffect(() => {
    setVoiceStates((prev) => {
      const next = new Map<string, VoiceState>();
      for (const s of species) {
        next.set(s.entityId, prev.get(s.entityId) ?? 'loading');
      }
      return next;
    });
  }, [species]);

  const reportState = useCallback((entityId: string, state: VoiceState) => {
    setVoiceStates((prev) => {
      if (prev.get(entityId) === state) return prev;
      const next = new Map(prev);
      next.set(entityId, state);
      return next;
    });
  }, []);

  const anyLoading = useMemo(
    () => Array.from(voiceStates.values()).some((s) => s === 'loading'),
    [voiceStates],
  );
  const readyCount = useMemo(
    () => Array.from(voiceStates.values()).filter((s) => s === 'ready').length,
    [voiceStates],
  );

  // Hide the button entirely once resolution settles and not a single
  // species produced playable audio. While the first voices resolve the
  // button spins.
  //
  // Crucially, once armed the `BirdexChorusVoice` children must always
  // render regardless of UI state — they're the hooks that drive the
  // resolution we're waiting on. Returning early before rendering them
  // would freeze the button in its "loading" state forever.
  const hideButton = armed && !anyLoading && readyCount === 0;
  const resolving = armed && anyLoading && readyCount === 0;
  const voiceCount = armed ? readyCount : species.length;

  const toggle = () => {
    setArmed(true);
    setIsPlaying((p) => !p);
  };

  return (
    <>
      {hideButton ? null : (
        <button
          type="button"
          onClick={toggle}
          aria-pressed={isPlaying}
          aria-busy={resolving || undefined}
          aria-label={
            isPlaying
              ? `Pause dawn chorus of ${voiceCount} species`
              : `Play dawn chorus of ${voiceCount} species`
          }
          className={cn(
            'group inline-flex size-10 shrink-0 items-center justify-center rounded-full',
            'bg-emerald-500 text-white shadow-md ring-1 ring-emerald-400/40',
            'transition-[transform,background-color,box-shadow] duration-200',
            'hover:bg-emerald-600 hover:shadow-lg active:scale-95',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2',
            'focus-visible:ring-offset-background',
            'dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300',
            className,
          )}
        >
          {isPlaying && resolving ? (
            <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
          ) : isPlaying ? (
            <EqualiserBars />
          ) : (
            // Nudge the play triangle right by 1px so its visual
            // centroid aligns with the circle's centre — the glyph's
            // bounding box is wider on the right than the left.
            <Play className="size-4 translate-x-px fill-current" aria-hidden />
          )}
        </button>
      )}

      {armed && species.map((s) => (
        <BirdexChorusVoice
          key={s.entityId}
          entityId={s.entityId}
          isPlaying={isPlaying}
          onStateChange={reportState}
        />
      ))}
    </>
  );
}

/**
 * Four vertical bars bouncing with staggered CSS animations, shown
 * inside the button while the chorus is playing. Matches the
 * equaliser used by `BirdSongPlayer` so the chorus button and the
 * per-species buttons are visually indistinguishable.
 */
function EqualiserBars() {
  const delays = ['0ms', '120ms', '60ms', '180ms'];
  return (
    <span className="flex h-4 items-end gap-[2px]" aria-hidden>
      {delays.map((delay, i) => (
        <span
          key={i}
          className={cn(
            'block w-[2px] rounded-full bg-current',
            'h-full origin-bottom motion-safe:animate-equaliser-bar',
            'motion-reduce:scale-y-75',
          )}
          style={{ animationDelay: delay }}
        />
      ))}
    </span>
  );
}

interface BirdexChorusVoiceProps {
  entityId: string;
  isPlaying: boolean;
  onStateChange: (entityId: string, state: VoiceState) => void;
}

/**
 * A single voice in the chorus. Resolves Wikidata → Wikipedia title →
 * Commons audio URL and renders a hidden `<audio loop>` element that
 * tracks the shared play/pause state. Renders nothing visible.
 */
function BirdexChorusVoice({ entityId, isPlaying, onStateChange }: BirdexChorusVoiceProps) {
  const { data: entity, isLoading: entityLoading, isError: entityError } =
    useWikidataEntity(entityId);
  const wikipediaTitle = entity?.wikipediaTitle ?? null;

  // `useBirdSong` only fires once we have a Wikipedia title. While
  // it's disabled its `isLoading` is false but `data` is undefined,
  // so we gate readiness on the parent query's state too.
  const { data: song, isLoading: songLoading, isError: songError } =
    useBirdSong(wikipediaTitle);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrl = song?.audioUrl ?? null;

  // Report our state upward whenever it changes. "missing" fires both
  // when Wikidata has no enwiki sitelink and when Wikipedia has no
  // usable recording — the UI treats both the same.
  useEffect(() => {
    if (entityError || (!entityLoading && !wikipediaTitle)) {
      onStateChange(entityId, 'missing');
      return;
    }
    if (entityLoading || songLoading) {
      onStateChange(entityId, 'loading');
      return;
    }
    if (songError || !audioUrl) {
      onStateChange(entityId, 'missing');
      return;
    }
    onStateChange(entityId, 'ready');
  }, [
    entityId,
    entityError,
    entityLoading,
    wikipediaTitle,
    songLoading,
    songError,
    audioUrl,
    onStateChange,
  ]);

  // Drive the hidden `<audio>` element from the shared flag. We
  // don't forward `onPlay`/`onPause` events upward because the
  // parent is the source of truth; bubbling them back would create
  // feedback loops when (e.g.) the browser auto-pauses on tab hide.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !audioUrl) return;
    if (isPlaying) {
      // `play()` rejects when autoplay is blocked or the source
      // fails to load. Swallow it — the voice just drops out of the
      // chorus rather than taking the whole button down.
      el.play().catch(() => {});
    } else {
      el.pause();
      // Reset to the start so the next Play gives a fresh chorus
      // rather than picking up mid-phrase with every voice out of
      // sync with wherever it happened to be paused.
      try {
        el.currentTime = 0;
      } catch {
        /* Some browsers throw on seek before metadata loads. */
      }
    }
  }, [isPlaying, audioUrl]);

  if (!audioUrl) return null;

  return (
    <audio
      ref={audioRef}
      src={audioUrl}
      preload="auto"
      loop
      className="hidden"
      aria-hidden
    />
  );
}
