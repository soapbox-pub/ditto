import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { useBirdSong, type BirdSong } from '@/hooks/useBirdSong';
import { cn } from '@/lib/utils';

/**
 * Inline bird-song play button for Wikipedia species pages.
 *
 * Looks up a reference recording from the article (via
 * `useBirdSong` → Wikipedia/Commons) and renders a circular
 * toggle. Clicking plays the song on loop; the play triangle is
 * replaced by an animated equaliser so the single control both
 * triggers and indicates playback. The `<audio>` element is rendered
 * hidden inside the component — callers don't need to thread it
 * through the tree.
 *
 * Returns `null` when no usable recording exists, so the caller can
 * spread it into a header/title row without worrying about a
 * disabled/broken state.
 *
 * Adapted from Birdstar's BirdInfoDialog `useSongPlayer` (see
 * `~/Projects/birdstar/src/components/BirdInfoDialog.tsx`). The
 * iNaturalist fallback from the original is deliberately omitted —
 * per the user's request Ditto only uses Wikipedia/Commons.
 */

interface BirdSongPlayerProps {
  /**
   * Wikipedia article title. We resolve it to an audio file on
   * Wikimedia Commons.
   */
  title: string | null;
  className?: string;
  /** Rendered in a surrounding flex row; supply a label for a11y when
   *  the surrounding header doesn't already describe the subject. */
  ariaLabel?: string;
}

export function BirdSongPlayer({ title, className, ariaLabel }: BirdSongPlayerProps) {
  const { data: song, isLoading } = useBirdSong(title);

  if (isLoading) {
    return (
      <Skeleton
        className={cn('size-10 shrink-0 rounded-full', className)}
        aria-hidden
      />
    );
  }

  if (!song) return null;

  return (
    <BirdSongButton song={song} className={className} ariaLabel={ariaLabel} />
  );
}

function BirdSongButton({
  song,
  className,
  ariaLabel,
}: {
  song: BirdSong;
  className?: string;
  ariaLabel?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // When the song source changes (user navigates to a different
  // species while one is playing), reset to the paused state — the
  // previous <audio> element unmounts, and we don't want the button
  // inheriting a stale `isPlaying=true`.
  useEffect(() => {
    setIsPlaying(false);
  }, [song.audioUrl]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
    } else {
      // `play()` returns a Promise that rejects when autoplay is
      // blocked or the source fails to load. Swallow the rejection —
      // the button stays in the paused state and the user can retry.
      el.play().then(
        () => setIsPlaying(true),
        () => setIsPlaying(false),
      );
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-label={
          isPlaying
            ? `Pause ${ariaLabel ?? 'reference recording'}`
            : `Play ${ariaLabel ?? 'reference recording'}`
        }
        aria-pressed={isPlaying}
        title={song.attribution}
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
        {isPlaying ? (
          <EqualiserBars />
        ) : (
          // Nudge the play triangle right by 1px — its centroid sits
          // left of its bounding box and would otherwise look
          // off-center inside the circle.
          <Play className="size-4 translate-x-px fill-current" aria-hidden />
        )}
      </button>

      <audio
        ref={audioRef}
        src={song.audioUrl}
        preload="none"
        // Loop the reference recording. Commons bird songs are
        // typically a few seconds of a single phrase, and users want
        // to hear it repeatedly to compare with what they heard in
        // the field. The button (same hit region as the equaliser)
        // is the explicit stop.
        loop
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        className="hidden"
      >
        Your browser does not support embedded audio.
      </audio>
    </>
  );
}

/**
 * Four vertical bars bouncing with staggered CSS animations,
 * rendered inside the button while playback is active. Color is
 * `currentColor` so it inherits the button's text colour — white on
 * the emerald background in light mode, emerald-950 (matching
 * foreground) in dark mode. Respects `prefers-reduced-motion` via
 * Tailwind's `motion-reduce:` variant so the bars freeze rather
 * than bouncing for users who've asked for less motion.
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
            // `origin-bottom` keeps the scaleY transform anchored to
            // the baseline so the bar "grows up" rather than
            // expanding from its center.
            'h-full origin-bottom motion-safe:animate-equaliser-bar',
            // Static midpoint height when motion is reduced, so the
            // UI still conveys "audio is playing" without movement.
            'motion-reduce:scale-y-75',
          )}
          style={{ animationDelay: delay }}
        />
      ))}
    </span>
  );
}
