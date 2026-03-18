import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/formatTime';
import { AudioVisualizer } from '@/components/AudioVisualizer';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { getAvatarShape } from '@/lib/avatarShape';

/** Parse NIP-A0 imeta fields from an event's tags. */
function parseVoiceImeta(tags: string[][]): { waveform?: number[]; duration?: number } {
  for (const tag of tags) {
    if (tag[0] !== 'imeta') continue;
    let waveform: number[] | undefined;
    let duration: number | undefined;
    for (let i = 1; i < tag.length; i++) {
      const part = tag[i];
      const spaceIdx = part.indexOf(' ');
      if (spaceIdx === -1) continue;
      const key = part.slice(0, spaceIdx);
      const value = part.slice(spaceIdx + 1);
      if (key === 'waveform') {
        waveform = value.split(' ').map(Number).filter((n) => !isNaN(n));
      } else if (key === 'duration') {
        duration = parseFloat(value);
        if (isNaN(duration)) duration = undefined;
      }
    }
    if (waveform || duration) return { waveform, duration };
  }
  return {};
}

interface VoiceMessagePlayerProps {
  event: NostrEvent;
  className?: string;
}

/**
 * Compact voice message player for NIP-A0 events (kind 1222 / 1244).
 *
 * When NIP-A0 waveform data is available in `imeta` tags, renders a static
 * amplitude bar visualization with playback progress. Otherwise falls back
 * to the existing AudioVisualizer sinewave player.
 */
export function VoiceMessagePlayer({ event, className }: VoiceMessagePlayerProps) {
  const audioUrl = event.content.trim();
  const { waveform, duration: imetaDuration } = useMemo(() => parseVoiceImeta(event.tags), [event.tags]);

  // Author data only needed for the AudioVisualizer fallback
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? metadata?.display_name ?? genUserName(event.pubkey);
  const avatarUrl = metadata?.picture;

  // If no waveform data, fall back to the existing AudioVisualizer
  if (!waveform || waveform.length === 0) {
    return (
      <AudioVisualizer
        src={audioUrl}
        avatarUrl={avatarUrl}
        avatarFallback={displayName[0]?.toUpperCase() ?? '?'}
        avatarShape={getAvatarShape(metadata)}
        className={className}
      />
    );
  }

  return (
    <WaveformPlayer
      src={audioUrl}
      waveform={waveform}
      imetaDuration={imetaDuration}
      className={className}
    />
  );
}

// ── Waveform bar player ─────────────────────────────────────────────────

interface WaveformPlayerProps {
  src: string;
  waveform: number[];
  imetaDuration?: number;
  className?: string;
}

function WaveformPlayer({
  src,
  waveform,
  imetaDuration,
  className,
}: WaveformPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(imetaDuration ?? 0);

  const progress = duration > 0 ? currentTime / duration : 0;

  // Normalize waveform values to 0–1 range
  const normalizedWaveform = useMemo(() => {
    const max = Math.max(...waveform, 1);
    return waveform.map((v) => v / max);
  }, [waveform]);

  // ── Audio event listeners ──────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onTime = () => setCurrentTime(audio.currentTime);
    const onDur = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('durationchange', onDur);
    audio.addEventListener('loadedmetadata', onDur);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('durationchange', onDur);
      audio.removeEventListener('loadedmetadata', onDur);
    };
  }, []);

  // Pause when scrolled out of view
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && !audio.paused) {
          audio.pause();
        }
      },
      { threshold: 0.1 },
    );
    if (barsRef.current) observer.observe(barsRef.current);
    return () => observer.disconnect();
  }, []);

  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
    } else {
      audio.pause();
    }
  }, []);

  const handleBarSeek = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    const bar = barsRef.current;
    if (!audio || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
  }, [duration]);

  return (
    <div
      className={cn(
        'mt-3 rounded-2xl border border-border bg-muted/30 p-3 flex items-center gap-3',
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Hidden audio element */}
      <audio ref={audioRef} preload="metadata" className="hidden">
        <source src={src} />
      </audio>

      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        className={cn(
          'shrink-0 size-10 rounded-full flex items-center justify-center transition-colors',
          isPlaying
            ? 'bg-primary text-primary-foreground'
            : 'bg-primary/15 text-primary hover:bg-primary/25',
        )}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying
          ? <Pause className="size-4" fill="currentColor" />
          : <Play className="size-4 ml-0.5" fill="currentColor" />}
      </button>

      {/* Waveform + time */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Waveform bars */}
        <div
          ref={barsRef}
          className="flex items-end gap-[2px] h-8 cursor-pointer"
          onClick={handleBarSeek}
        >
          {normalizedWaveform.map((amplitude, i) => {
            const barProgress = i / normalizedWaveform.length;
            const isPlayed = barProgress < progress;
            const minH = 3; // min bar height in px
            const maxH = 32; // max bar height in px
            const h = minH + amplitude * (maxH - minH);
            return (
              <div
                key={i}
                className={cn(
                  'flex-1 rounded-full transition-colors duration-150',
                  isPlayed ? 'bg-primary' : 'bg-primary/25',
                )}
                style={{ height: `${h}px` }}
              />
            );
          })}
        </div>

        {/* Time display */}
        <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
          <span>{formatTime(currentTime)}</span>
          <span>{duration > 0 ? formatTime(duration) : '--:--'}</span>
        </div>
      </div>
    </div>
  );
}
