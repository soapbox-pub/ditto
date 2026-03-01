import { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { usePlayerControls } from '@/hooks/usePlayerControls';
import { formatTime } from '@/lib/formatTime';

interface AudioVisualizerProps {
  src: string;
  mime?: string;
  /** Avatar image URL for the circle in the centre */
  avatarUrl?: string;
  /** Fallback display letter for the avatar */
  avatarFallback?: string;
  className?: string;
}


/**
 * Audio player that renders identically to VideoPlayer — same container,
 * same overlay controls, same progress bar — but the "video surface" is
 * a canvas showing an animated sinewave with the author's avatar centred.
 */
export function AudioVisualizer({
  src,
  mime,
  avatarUrl,
  avatarFallback = '?',
  className,
}: AudioVisualizerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const idlePhaseRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const { showControls, revealControls, scheduleHide } = usePlayerControls({
    mediaRef: audioRef,
    containerRef,
    isPlaying,
  });

  // ── Canvas: sinewave drawing ───────────────────────────────────────────
  const draw = useCallback(() => {
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
    grad.addColorStop(0,    'rgba(139,92,246,0.15)');
    grad.addColorStop(0.35, 'rgba(139,92,246,0.85)');
    grad.addColorStop(0.5,  'rgba(168,85,247,1)');
    grad.addColorStop(0.65, 'rgba(139,92,246,0.85)');
    grad.addColorStop(1,    'rgba(139,92,246,0.15)');

    ctx.beginPath();
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(168,85,247,0.55)';

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
      // Idle animated sine
      idlePhaseRef.current += 0.03;
      const phase = idlePhaseRef.current;
      const steps = 300;
      for (let i = 0; i <= steps; i++) {
        const x = (i / steps) * W;
        const dist = Math.abs(x - cx);
        const fade = dist < avatarR
          ? 0
          : dist < avatarR * 1.6
            ? (dist - avatarR) / (avatarR * 0.6)
            : 1;
        const y = midY + Math.sin((i / steps) * Math.PI * 4 + phase) * (H * 0.12) * fade;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
    ctx.restore();

    animFrameRef.current = requestAnimationFrame(draw);
  }, [isPlaying]);

  useEffect(() => {
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [draw]);

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
    audio.paused ? audio.play() : audio.pause();
  }, [ensureAudioContext]);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setIsMuted(audio.muted);
  }, []);

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
        'relative mt-3 rounded-2xl overflow-hidden border border-border bg-black group',
        className,
      )}
      style={{ aspectRatio: '16 / 9' }}
      onMouseMove={revealControls}
      onMouseLeave={() => { if (isPlaying) scheduleHide(); }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Hidden audio element */}
      <audio ref={audioRef} preload="metadata" crossOrigin="anonymous" className="hidden">
        {mime ? <source src={src} type={mime} /> : <source src={src} />}
      </audio>

      {/* Sinewave canvas — fills the entire box */}
      <canvas
        ref={canvasRef}
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
              ? 'ring-purple-500/40 shadow-[0_0_28px_8px_rgba(168,85,247,0.4)]'
              : 'ring-white/10',
          )}
        >
          <Avatar className="size-20 border-2 border-white/20">
            <AvatarImage src={avatarUrl} alt={avatarFallback} />
            <AvatarFallback className="bg-primary/20 text-primary text-2xl font-semibold">
              {avatarFallback}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>

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

            <button
              onClick={toggleMute}
              className="text-white hover:text-white/80 transition-colors"
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
            </button>

            <span className="text-white text-xs tabular-nums min-w-0">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <div className="flex-1" />
          </div>
        </div>
      )}
    </div>
  );
}
