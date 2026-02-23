import { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Expand } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBlossomFallback } from '@/hooks/useBlossomFallback';

interface VideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
}

/** Format seconds to m:ss or h:mm:ss. */
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VideoPlayer({ src: originalSrc, poster, className }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const { src, onError: onBlossomError } = useBlossomFallback(originalSrc);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const scheduleHide = useCallback(() => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    if (isPlaying) {
      hideTimeoutRef.current = setTimeout(() => setShowControls(false), 2500);
    }
  }, [isPlaying]);

  const revealControls = useCallback(() => {
    setShowControls(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    if (isPlaying) {
      scheduleHide();
    } else {
      setShowControls(true);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    }
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [isPlaying, scheduleHide]);

  // Pause video when scrolled out of view
  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && !video.paused) {
          video.pause();
        }
      },
      { threshold: 0.25 },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const handleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (video.requestFullscreen) {
      video.requestFullscreen();
    }
  };

  const handleSeek = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    const bar = progressRef.current;
    if (!video || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.currentTime = ratio * duration;
  };

  const handleVideoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasStarted) {
      const video = videoRef.current;
      if (video) video.play();
      return;
    }
    togglePlay(e);
    revealControls();
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative mt-3 rounded-2xl overflow-hidden border border-border bg-black group',
        className,
      )}
      onMouseMove={revealControls}
      onMouseLeave={() => { if (isPlaying) scheduleHide(); }}
      onClick={(e) => e.stopPropagation()}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className="w-full max-h-[70vh] object-cover cursor-pointer"
        playsInline
        preload="metadata"
        {...({ 'webkit-playsinline': 'true' } as React.HTMLAttributes<HTMLVideoElement>)}
        {...({ 'x-webkit-airplay': 'allow' } as React.HTMLAttributes<HTMLVideoElement>)}
        onClick={handleVideoClick}
        onPlay={() => { setIsPlaying(true); setHasStarted(true); }}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
        onDurationChange={() => setDuration(videoRef.current?.duration ?? 0)}
        onError={onBlossomError}
      />

      {/* Big centered play button before first play */}
      {!hasStarted && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
          onClick={handleVideoClick}
        >
          <div className="size-16 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
            <Play className="size-8 text-white ml-1" fill="white" />
          </div>
        </div>
      )}

      {/* Bottom control bar */}
      {hasStarted && (
        <div
          className={cn(
            'absolute bottom-0 left-0 right-0 transition-opacity duration-200',
            'bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-8 pb-2 px-3',
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none',
          )}
        >
          {/* Progress bar */}
          <div
            ref={progressRef}
            className="w-full h-1 bg-white/30 rounded-full cursor-pointer mb-2 group/progress"
            onClick={handleSeek}
          >
            <div
              className="h-full bg-primary rounded-full relative"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 size-3 bg-primary rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity" />
            </div>
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-3">
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="text-white hover:text-white/80 transition-colors"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="size-5" fill="white" /> : <Play className="size-5 ml-0.5" fill="white" />}
            </button>

            {/* Volume */}
            <button
              onClick={toggleMute}
              className="text-white hover:text-white/80 transition-colors"
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
            </button>

            {/* Time */}
            <span className="text-white text-xs tabular-nums min-w-0">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <div className="flex-1" />

            {/* Fullscreen */}
            <button
              onClick={handleFullscreen}
              className="text-white hover:text-white/80 transition-colors"
              aria-label="Fullscreen"
            >
              <Expand className="size-[18px]" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
