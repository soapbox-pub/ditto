import { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, Volume1, Volume2, VolumeX } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { AvatarShape } from '@/lib/avatarShape';
import { cn } from '@/lib/utils';
import { usePlayerControls } from '@/hooks/usePlayerControls';
import { useInView } from '@/hooks/useInView';
import { useDecryptedFile } from '@/hooks/useDecryptedFile';
import { hasAudioMetadata, useAudioMetadata } from '@/hooks/useAudioMetadata';
import { EncryptedFileNotice } from '@/components/EncryptedFileNotice';
import type { FileEncryption } from '@/lib/encryptedFile';
import type { ImetaEntry } from '@/lib/imeta';
import { formatTime } from '@/lib/formatTime';

interface AudioVisualizerProps {
  src: string;
  mime?: string;
  /**
   * Present when `src` serves ciphertext. The player fetches and decrypts it to
   * an object URL before playback.
   */
  encryption?: FileEncryption;
  /** Avatar image URL for the circle in the centre */
  avatarUrl?: string;
  /** The kind 0's imeta for `avatarUrl` (`author.data?.imeta?.picture`). */
  avatarImeta?: ImetaEntry;
  /** Fallback display letter for the avatar */
  avatarFallback?: string;
  /** Avatar mask shape, forwarded from the author's profile metadata */
  avatarShape?: AvatarShape;
  className?: string;
}


/**
 * Audio player that renders identically to VideoPlayer — same container,
 * same overlay controls, same progress bar — but the "video surface" is
 * a canvas showing a sinewave (live waveform while playing) with the
 * author's avatar centred.
 * A music file that carries its own tags or cover art (read out of the file,
 * not the event) shows its cover in place of the avatar and its title,
 * artist and album across the top.
 */
export function AudioVisualizer({
  src: originalSrc,
  mime: declaredMime,
  encryption,
  avatarUrl,
  avatarImeta,
  avatarFallback = '?',
  avatarShape,
  className,
}: AudioVisualizerProps) {
  const decrypted = useDecryptedFile(originalSrc, encryption);
  const src = decrypted.src ?? '';
  // Once decrypted the object URL carries the plaintext type, which is what
  // <source type> needs — the `m` tag describes the plaintext too.
  const mime = decrypted.mime ?? declaredMime;

  // The file's own tags. Read from the resolved bytes: a decrypted object URL
  // in memory, or a plain URL read by range request for just the tag block.
  const meta = useAudioMetadata(originalSrc, decrypted.src);
  const track = hasAudioMetadata(meta) ? meta : undefined;
  const trackDetails = track ? [track.artist, track.album, track.year].filter(Boolean).join(' · ') : '';
  const [brokenCover, setBrokenCover] = useState<string>();
  const coverUrl = track?.coverUrl && brokenCover !== track.coverUrl ? track.coverUrl : undefined;

  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const { showControls, revealControls, scheduleHide, isMuted, volume, toggleMute, handleVolumeChange } = usePlayerControls({
    mediaRef: audioRef,
    containerRef,
    isPlaying,
  });

  // Nothing to play yet: still decrypting, or undecryptable. Pointing <audio>
  // at the original URL would only hand it ciphertext.
  const unplayable = decrypted.encrypted && !decrypted.src;

  // Only animate while the canvas is on screen. The canvas is unmounted while
  // an encrypted file decrypts; the callback ref picks it up once it appears.
  const { ref: inViewRef, inView } = useInView({ rootMargin: '100px' });
  const setCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    inViewRef(node);
  }, [inViewRef]);

  // ── Canvas: sinewave drawing ───────────────────────────────────────────
  // Draws a single frame. `primaryHsl` is the theme's --primary value, read
  // once per animation run rather than per frame to avoid a style recalc.
  const drawFrame = useCallback((primaryHsl: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use CSS pixel dimensions for drawing coordinates
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    // Ensure backing store matches display size
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const primaryColor = `hsl(${primaryHsl})`;
    const primaryFaint = `hsl(${primaryHsl} / 0.15)`;
    const primaryMid   = `hsl(${primaryHsl} / 0.85)`;
    const primaryGlow  = `hsl(${primaryHsl} / 0.55)`;

    const analyser = analyserRef.current;
    let dataArray: Uint8Array | null = null;
    if (analyser && isPlaying) {
      dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(dataArray);
    }

    // Avatar clear-zone radius in CSS px (matches the size-20 = 80px avatar)
    const avatarR = 52; // half of size-20 (80px) + a small gap
    const cx = W / 2;
    const midY = H / 2;

    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0,    primaryFaint);
    grad.addColorStop(0.35, primaryMid);
    grad.addColorStop(0.5,  primaryColor);
    grad.addColorStop(0.65, primaryMid);
    grad.addColorStop(1,    primaryFaint);

    ctx.beginPath();
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 10;
    ctx.shadowColor = primaryGlow;

    if (dataArray) {
      // Real-time waveform
      const sliceW = W / dataArray.length;
      for (let i = 0; i < dataArray.length; i++) {
        const x = i * sliceW;
        const v = dataArray[i] / 128.0 - 1; // -1..1
        const dist = Math.abs(x - cx);
        // Fade smoothly through the avatar zone
        const fade = dist < avatarR
          ? 0
          : dist < avatarR * 1.6
            ? (dist - avatarR) / (avatarR * 0.6)
            : 1;
        const y = midY + v * (H * 0.35) * fade;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    } else {
      // Idle sine, drawn as a still frame while paused
      const steps = 300;
      for (let i = 0; i <= steps; i++) {
        const x = (i / steps) * W;
        const dist = Math.abs(x - cx);
        const fade = dist < avatarR
          ? 0
          : dist < avatarR * 1.6
            ? (dist - avatarR) / (avatarR * 0.6)
            : 1;
        const y = midY + Math.sin((i / steps) * Math.PI * 4) * (H * 0.12) * fade;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
    ctx.restore();
  }, [isPlaying]);

  // Run the per-frame loop only while playing and on screen. Otherwise draw a
  // single still frame, redrawn when the canvas resizes, so an idle player
  // costs nothing.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const readPrimary = () => getComputedStyle(canvas).getPropertyValue('--primary').trim();

    if (isPlaying && inView) {
      const primaryHsl = readPrimary();
      const loop = () => {
        drawFrame(primaryHsl);
        animFrameRef.current = requestAnimationFrame(loop);
      };
      animFrameRef.current = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(animFrameRef.current);
    }

    drawFrame(readPrimary());
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => drawFrame(readPrimary()));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [drawFrame, isPlaying, inView, unplayable]);

  // ── Web Audio API ──────────────────────────────────────────────────────
  const ensureAudioContext = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audioCtxRef.current) return;
    const actx = new AudioContext();
    audioCtxRef.current = actx;
    const analyser = actx.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;
    actx.createMediaElementSource(audio).connect(analyser);
    analyser.connect(actx.destination);
  }, []);

  // ── Playback controls ──────────────────────────────────────────────────
  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    ensureAudioContext();
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
    if (audio.paused) { audio.play(); } else { audio.pause(); }
  }, [ensureAudioContext]);

  const handleSeek = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    const bar = progressRef.current;
    if (!audio || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasStarted) {
      const audio = audioRef.current;
      if (audio) { ensureAudioContext(); audio.play(); }
      return;
    }
    togglePlay(e);
    revealControls();
  };

  // ── Audio event listeners ──────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => { setIsPlaying(true); setHasStarted(true); };
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onTime = () => setCurrentTime(audio.currentTime);
    const onDur = () => setDuration(audio.duration);
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

  useEffect(() => () => {
    cancelAnimationFrame(animFrameRef.current);
    audioCtxRef.current?.close();
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative mt-3 rounded-2xl overflow-hidden border border-border bg-background group',
        className,
      )}
      style={{ aspectRatio: '16 / 9' }}
      onMouseMove={revealControls}
      onMouseLeave={() => { if (isPlaying) scheduleHide(); }}
      onClick={(e) => e.stopPropagation()}
    >
      {/*
        Hidden audio element. It stays mounted while an encrypted file
        decrypts, even though it has no source yet: the listeners below and
        usePlayerControls both bind to it once, on mount, so unmounting it
        here would leave playback with no listeners at all.
      */}
      <audio ref={audioRef} preload="metadata" crossOrigin="anonymous" className="hidden">
        {src ? (mime ? <source src={src} type={mime} /> : <source src={src} />) : null}
      </audio>

      {unplayable && (
        <EncryptedFileNotice
          fill
          loading={decrypted.loading}
          unsupported={decrypted.unsupported}
          tooLarge={decrypted.tooLarge}
          byteSize={decrypted.byteSize}
          onDecryptAnyway={decrypted.decryptAnyway}
        />
      )}

      {!unplayable && (
        <>
        {/* Sinewave canvas — fills the entire box */}
        <canvas
          ref={setCanvasRef}
          className="absolute inset-0 w-full h-full"
          onClick={handleCanvasClick}
          style={{ cursor: 'pointer' }}
        />

        {/* Avatar — centred over the canvas */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className={cn(
              'rounded-full ring-4 transition-all duration-300',
              isPlaying
                ? 'ring-primary/40 shadow-[0_0_28px_8px_hsl(var(--primary)/0.4)]'
                : 'ring-border',
            )}
          >
            {coverUrl ? (
              <img
                src={coverUrl}
                alt=""
                className="size-20 rounded-full object-cover border-2 border-white/20"
                onError={() => setBrokenCover(coverUrl)}
              />
            ) : (
              <Avatar className="size-20 border-2 border-white/20" shape={avatarShape}>
                <AvatarImage src={avatarUrl} imeta={avatarImeta} alt={avatarFallback} />
                <AvatarFallback className="bg-primary/20 text-primary text-2xl font-semibold">
                  {avatarFallback}
                </AvatarFallback>
              </Avatar>
            )}
          </div>
        </div>

        {/* Track title, artist and album, from the file's own tags */}
        {track && (track.title || trackDetails) && (
          <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/70 to-transparent px-3 pt-2.5 pb-6 pointer-events-none">
            {track.title && <p className="truncate text-sm font-semibold text-white">{track.title}</p>}
            {trackDetails && <p className="truncate text-xs text-white/80">{trackDetails}</p>}
          </div>
        )}

        {/* Big centred play button before first play — identical to VideoPlayer */}
        {!hasStarted && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
            onClick={handleCanvasClick}
          >
            <div className="size-16 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
              <Play className="size-8 text-white ml-1" fill="white" />
            </div>
          </div>
        )}

        {/* Bottom control bar — identical markup to VideoPlayer */}
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
              <button
                onClick={togglePlay}
                className="text-white hover:text-white/80 transition-colors"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying
                  ? <Pause className="size-5" fill="white" />
                  : <Play className="size-5 ml-0.5" fill="white" />}
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

              <span className="text-white text-xs tabular-nums min-w-0">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>

              <div className="flex-1" />
            </div>
          </div>
        )}
        </>
      )}
    </div>
  );
}
