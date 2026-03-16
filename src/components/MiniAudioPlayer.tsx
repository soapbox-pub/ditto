import { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/formatTime';

/** Audio file extensions used to detect audio URLs. */
const AUDIO_EXTENSIONS = /\.(mp3|mpga|ogg|oga|wav|flac|aac|m4a|opus|weba|webm|spx|caf)(\?.*)?$/i;

/** Image file extensions used to detect image URLs. */
const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|svg|avif)(\?.*)?$/i;

/** Video file extensions used to detect video URLs. */
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|qt)(\?.*)?$/i;

/** Check whether a URL points to an audio file by extension. */
export function isAudioUrl(url: string): boolean {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  return AUDIO_EXTENSIONS.test(url);
}

/** Check whether a URL points to an image file by extension. */
export function isImageUrl(url: string): boolean {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  return IMAGE_EXTENSIONS.test(url);
}

/** Check whether a URL points to a video file by extension. */
export function isVideoUrl(url: string): boolean {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  return VIDEO_EXTENSIONS.test(url);
}

interface MiniAudioPlayerProps {
  src: string;
  label?: string;
  className?: string;
}

/** Compact inline audio player for profile fields. */
export function MiniAudioPlayer({ src, label, className }: MiniAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const progress = duration > 0 ? currentTime / duration : 0;

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

  const handleSeek = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    const bar = progressRef.current;
    if (!audio || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
  }, [duration]);

  return (
    <div className={cn('flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2', className)}>
      <audio ref={audioRef} preload="metadata" className="hidden">
        <source src={src} />
      </audio>

      {/* Play/Pause */}
      <button
        onClick={togglePlay}
        className={cn(
          'shrink-0 size-7 rounded-full flex items-center justify-center transition-colors',
          isPlaying
            ? 'bg-primary text-primary-foreground'
            : 'bg-primary/15 text-primary hover:bg-primary/25',
        )}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying
          ? <Pause className="size-3" fill="currentColor" />
          : <Play className="size-3 ml-px" fill="currentColor" />}
      </button>

      {/* Track info + progress */}
      <div className="flex-1 min-w-0 space-y-1">
        {label && <span className="block text-xs font-medium truncate">{label}</span>}

        {/* Progress bar */}
        <div
          ref={progressRef}
          className="h-1 w-full rounded-full bg-primary/15 cursor-pointer"
          onClick={handleSeek}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-150"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* Time */}
      <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
        {formatTime(currentTime)}/{duration > 0 ? formatTime(duration) : '--:--'}
      </span>
    </div>
  );
}
