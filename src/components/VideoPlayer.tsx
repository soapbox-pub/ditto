import { useRef, useState, useEffect, useCallback } from 'react';
import Hls from 'hls.js';
import { Play, Pause, Volume1, Volume2, VolumeX, Expand } from 'lucide-react';
import { Blurhash } from 'react-blurhash';
import { cn } from '@/lib/utils';
import { useBlossomFallback } from '@/hooks/useBlossomFallback';
import { usePlayerControls } from '@/hooks/usePlayerControls';
import { formatTime } from '@/lib/formatTime';

interface VideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
  /** NIP-94 `dim` tag value, e.g. "1280x720". Sets the aspect ratio before metadata loads. */
  dim?: string;
  /** NIP-94 `blurhash` tag value. Shown as a placeholder before the video poster/frame loads. */
  blurhash?: string;
}

/** Parses a NIP-94 `dim` string like "1280x720" into `{ width, height }`. */
function parseDim(dim: string | undefined): { width: number; height: number } | undefined {
  if (!dim) return undefined;
  const [w, h] = dim.split('x').map(Number);
  if (!w || !h || isNaN(w) || isNaN(h)) return undefined;
  return { width: w, height: h };
}


/**
 * Extracts a thumbnail frame from a video URL by loading it off-screen,
 * drawing the first frame to a canvas, and returning a data URL.
 * Works reliably on Android WebView where preload="metadata" doesn't render a visible frame.
 */
export function useVideoThumbnail(src: string, poster: string | undefined): string | undefined {
  const [thumbnail, setThumbnail] = useState<string | undefined>(poster);

  useEffect(() => {
    // Skip if we already have a poster image
    if (poster) return;
    if (!src) return;

    let cancelled = false;

    function grabFrameFromUrl(videoSrc: string) {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.src = videoSrc;

      function captureFrame() {
        if (cancelled) return;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 320;
          canvas.height = video.videoHeight || 180;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            if (dataUrl.length > 1000) setThumbnail(dataUrl);
          }
        } catch { /* CORS or tainted canvas */ }
        video.src = '';
        video.load();
      }

      // After metadata loads, seek to 0.1s — then capture on seeked
      const handleMetadata = () => { video.currentTime = 0.1; };
      const handleSeeked = () => captureFrame();

      video.addEventListener('loadedmetadata', handleMetadata, { once: true });
      video.addEventListener('seeked', handleSeeked, { once: true });

      return () => {
        video.removeEventListener('loadedmetadata', handleMetadata);
        video.removeEventListener('seeked', handleSeeked);
        video.src = '';
        video.load();
      };
    }

    // For HLS: use hls.js to load the stream into an off-screen video, then grab a frame
    if (/\.m3u8(\?|$)/i.test(src)) {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;

      const grabFrame = () => {
        if (cancelled) return;
        // Need to play briefly so the video has a rendered frame to draw
        video.play().then(() => {
          video.pause();
          try {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 320;
            canvas.height = video.videoHeight || 180;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
              if (dataUrl.length > 1000) setThumbnail(dataUrl);
            }
          } catch { /* tainted canvas */ }
          hls.destroy();
          video.src = '';
        }).catch(() => { hls.destroy(); });
      };

      // Safari — native HLS support
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
        video.addEventListener('loadeddata', grabFrame, { once: true });
        return () => {
          cancelled = true;
          video.removeEventListener('loadeddata', grabFrame);
          video.src = '';
        };
      }

      if (!Hls.isSupported()) return;

      const hls = new Hls({ startLevel: -1, maxBufferLength: 5 });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (cancelled) { hls.destroy(); return; }
        grabFrame();
      });

      return () => { cancelled = true; hls.destroy(); video.src = ''; };
    }

    // Regular video file
    const cleanupDirect = grabFrameFromUrl(src);
    return () => { cancelled = true; cleanupDirect(); };
  }, [src, poster]);

  return thumbnail;
}

/** Attaches hls.js to a video element for HLS streams on non-Safari browsers. */
function useHls(videoRef: React.RefObject<HTMLVideoElement | null>, src: string) {
  const hlsRef = useRef<Hls | null>(null);

  const isHls = /\.m3u8(\?|$)/i.test(src);

  const attach = useCallback(() => {
    const video = videoRef.current;
    if (!video || !isHls) return;

    // Safari supports HLS natively
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      return;
    }

    if (!Hls.isSupported()) return;

    const hls = new Hls({ startLevel: -1, autoStartLoad: true });
    hlsRef.current = hls;
    hls.loadSource(src);
    hls.attachMedia(video);
  }, [videoRef, src, isHls]);

  useEffect(() => {
    attach();
    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [attach]);

  return { isHls };
}

export function VideoPlayer({ src: originalSrc, poster, className, dim, blurhash }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { src, onError: onBlossomError } = useBlossomFallback(originalSrc);
  const { isHls } = useHls(videoRef, src);

  const generatedPoster = useVideoThumbnail(src, poster);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  // True once the video has enough data to display a frame (or has a poster/generated thumbnail)
  const [videoReady, setVideoReady] = useState(!!poster);

  const dimensions = parseDim(dim);
  const aspectRatio = dimensions ? `${dimensions.width} / ${dimensions.height}` : undefined;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const { showControls, revealControls, scheduleHide, isMuted, volume, toggleMute, handleVolumeChange } = usePlayerControls({
    mediaRef: videoRef,
    containerRef,
    isPlaying,
  });

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
      style={aspectRatio ? { aspectRatio } : undefined}
      onMouseMove={revealControls}
      onMouseLeave={() => { if (isPlaying) scheduleHide(); }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Blurhash placeholder — shown until the video has a displayable frame */}
      {blurhash && !videoReady && !generatedPoster && (
        <Blurhash
          hash={blurhash}
          width="100%"
          height="100%"
          resolutionX={32}
          resolutionY={32}
          punch={1}
          style={{ position: 'absolute', inset: 0 }}
        />
      )}

      <video
        ref={videoRef}
        src={isHls ? undefined : src}
        poster={generatedPoster}
        className={cn(
          'w-full cursor-pointer',
          // When dim is known the container already has the correct aspect ratio,
          // so the video just needs to fill it (absolute inset-0). Without dim we
          // fall back to the original constrained height with object-cover so the
          // player doesn't grow to an unmanageable size.
          aspectRatio
            ? 'absolute inset-0 h-full object-cover'
            : 'max-h-[70vh] object-cover',
        )}
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
        onLoadedData={() => setVideoReady(true)}
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

            {/* Volume: icon toggles mute, slider sets level */}
            <div className="flex items-center gap-1.5 group/vol">
              <button
                onClick={toggleMute}
                className="text-white hover:text-white/80 transition-colors shrink-0"
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0
                  ? <VolumeX className="size-5" />
                  : volume < 0.5
                    ? <Volume1 className="size-5" />
                    : <Volume2 className="size-5" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                onClick={(e) => e.stopPropagation()}
                aria-label="Volume"
                className={cn(
                  'w-0 opacity-0 group-hover/vol:w-16 group-hover/vol:opacity-100',
                  'transition-all duration-200 cursor-pointer accent-white h-1',
                )}
              />
            </div>

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
