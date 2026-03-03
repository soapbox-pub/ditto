import { useRef, useEffect, useState, useCallback } from 'react';
import type Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Expand, Minimize } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LiveStreamPlayerProps {
  src: string;
  poster?: string;
  className?: string;
  /** Stream title shown in OS media controls. */
  title?: string;
  /** Artist / channel name shown in OS media controls. */
  artist?: string;
}

export function LiveStreamPlayer({ src, poster, className, title, artist }: LiveStreamPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(0.8);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  // Set up HLS — dynamically imports hls.js (1.3MB) only when needed
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // If browser natively supports HLS (Safari), no library needed
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.play().catch(() => {
        setAutoplayBlocked(true);
      });
      return;
    }

    let destroyed = false;

    import('hls.js').then(({ default: HlsLib }) => {
      if (destroyed) return;

      if (!HlsLib.isSupported()) {
        setHasError(true);
        return;
      }

      const hls = new HlsLib({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
      });

      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(HlsLib.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {
          setAutoplayBlocked(true);
        });
      });

      hls.on(HlsLib.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case HlsLib.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case HlsLib.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setHasError(true);
              hls.destroy();
              break;
          }
        }
      });
    }).catch(() => {
      if (!destroyed) setHasError(true);
    });

    return () => {
      destroyed = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src]);

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

  // Track playback & buffering state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => { setIsBuffering(false); setIsPlaying(true); };
    const onCanPlay = () => setIsBuffering(false);
    const onPause = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);

    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('play', onPlay);

    return () => {
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('play', onPlay);
    };
  }, []);

  // Track fullscreen changes
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // Media Session API — registers OS lock-screen / notification controls for the live stream
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const video = videoRef.current;
    if (!video) return;

    const artwork: MediaImage[] = poster ? [{ src: poster, sizes: '512x512', type: 'image/jpeg' }] : [];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || 'Live Stream',
      artist: artist || '',
      artwork,
    });

    navigator.mediaSession.setActionHandler('play', () => video.play().catch(() => {}));
    navigator.mediaSession.setActionHandler('pause', () => video.pause());
    // No seekto/previoustrack/nexttrack for a live stream
    navigator.mediaSession.setActionHandler('seekto', null);
    navigator.mediaSession.setActionHandler('previoustrack', null);
    navigator.mediaSession.setActionHandler('nexttrack', null);

    return () => {
      if (!('mediaSession' in navigator)) return;
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
    };
  }, [title, artist, poster]);

  // Keep OS playback state in sync
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  const scheduleHide = useCallback(() => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    if (!autoplayBlocked) {
      hideTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [autoplayBlocked]);

  const revealControls = useCallback(() => {
    setShowControls(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    if (!autoplayBlocked) {
      scheduleHide();
    } else {
      setShowControls(true);
    }
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [scheduleHide, autoplayBlocked]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
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

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    const val = parseFloat(e.target.value);
    video.volume = val;
    setVolume(val);
    if (val === 0) {
      video.muted = true;
      setIsMuted(true);
    } else if (video.muted) {
      video.muted = false;
      setIsMuted(false);
    }
  };

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
  };

  const handleManualPlay = () => {
    const video = videoRef.current;
    if (!video) return;
    video.play().then(() => {
      setAutoplayBlocked(false);
      setIsBuffering(false);
    }).catch(() => {
      // Still blocked - unlikely after user gesture
    });
  };

  if (hasError) {
    return (
      <div className={cn('relative xl:rounded-2xl overflow-hidden bg-black aspect-video flex items-center justify-center', className)}>
        <div className="text-center space-y-2 px-4">
          <p className="text-white/80 text-sm font-medium">Stream unavailable</p>
          <p className="text-white/50 text-xs">The live stream could not be loaded. It may have ended or the URL is unreachable.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative xl:rounded-2xl overflow-hidden bg-black group aspect-video',
        className,
      )}
      onMouseMove={revealControls}
      onMouseLeave={() => { if (!autoplayBlocked) scheduleHide(); }}
    >
      <video
        ref={videoRef}
        poster={poster}
        className="w-full h-full object-contain cursor-pointer"
        playsInline
        autoPlay
        muted
        onClick={(e) => {
          if (autoplayBlocked) {
            handleManualPlay();
          } else {
            togglePlay(e);
            revealControls();
          }
        }}
      />

      {/* Autoplay blocked — big centered play button */}
      {autoplayBlocked && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer"
          onClick={handleManualPlay}
        >
          <div className="size-16 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm transition-transform hover:scale-110">
            <Play className="size-8 text-white ml-1" fill="white" />
          </div>
        </div>
      )}

      {/* Buffering spinner */}
      {isBuffering && !autoplayBlocked && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="size-12 border-[3px] border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Bottom control bar */}
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 transition-opacity duration-300',
          'bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-10 pb-3 px-4',
          showControls && !autoplayBlocked ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
      >
        <div className="flex items-center gap-3">
          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className="text-white hover:text-white/80 transition-colors p-1"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="size-5" fill="white" /> : <Play className="size-5 ml-0.5" fill="white" />}
          </button>

          {/* LIVE badge */}
          <div className="flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded">
            <div className="size-1.5 bg-white rounded-full animate-pulse" />
            LIVE
          </div>

          <div className="flex-1" />

          {/* Volume toggle + slider */}
          <div className="flex items-center gap-1.5 group/volume">
            <button
              onClick={toggleMute}
              className="text-white hover:text-white/80 transition-colors p-1"
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              onClick={(e) => e.stopPropagation()}
              className="w-0 group-hover/volume:w-20 transition-all duration-200 accent-white h-1 cursor-pointer opacity-0 group-hover/volume:opacity-100"
              aria-label="Volume"
            />
          </div>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="text-white hover:text-white/80 transition-colors p-1"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize className="size-[18px]" /> : <Expand className="size-[18px]" />}
          </button>
        </div>
      </div>
    </div>
  );
}
