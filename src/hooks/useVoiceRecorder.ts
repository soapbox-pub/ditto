import { useState, useRef, useCallback, useEffect } from 'react';

/** Maximum recording duration in seconds (NIP-A0 recommends 60s). */
const MAX_DURATION = 60;

/** Number of waveform amplitude samples to capture. */
const WAVEFORM_SAMPLES = 100;

/** Sampling interval in ms for waveform amplitude capture. */
const SAMPLE_INTERVAL_MS = 100;

export interface VoiceRecording {
  /** The recorded audio blob. */
  blob: Blob;
  /** MIME type of the recording. */
  mimeType: string;
  /** Duration in seconds. */
  duration: number;
  /** Waveform amplitude values (0–100 integers, ~100 samples). */
  waveform: number[];
}

export interface UseVoiceRecorderReturn {
  /** Whether the browser supports audio recording. */
  isSupported: boolean;
  /** Whether a recording is currently in progress. */
  isRecording: boolean;
  /** Elapsed recording time in seconds. */
  recordingDuration: number;
  /** Live waveform amplitude samples captured so far (0–100 integers). */
  liveWaveform: number[];
  /** Start recording. Requests microphone permission if needed. */
  startRecording: () => Promise<void>;
  /** Stop recording and return the result. */
  stopRecording: () => Promise<VoiceRecording | null>;
  /** Cancel recording without returning data. */
  cancelRecording: () => void;
}

/** Determine the best supported audio MIME type for recording. */
function getRecordingMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  // Prefer mp4/aac per NIP-A0 recommendation
  const preferred = [
    'audio/mp4',
    'audio/mp4;codecs=aac',
    'audio/aac',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ];
  for (const mime of preferred) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return 'audio/webm'; // fallback
}

/**
 * Hook for recording voice messages with real-time waveform capture.
 *
 * Records audio using the MediaRecorder API and captures amplitude samples
 * via an AnalyserNode for generating NIP-A0 waveform data.
 */
export function useVoiceRecorder(): UseVoiceRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [liveWaveform, setLiveWaveform] = useState<number[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const waveformRef = useRef<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const samplerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const resolveRef = useRef<((recording: VoiceRecording | null) => void) | null>(null);

  const isSupported = typeof navigator !== 'undefined'
    && !!navigator.mediaDevices
    && !!navigator.mediaDevices.getUserMedia
    && typeof MediaRecorder !== 'undefined';

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (samplerRef.current) {
      clearInterval(samplerRef.current);
      samplerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecording || !isSupported) return;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    // Set up Web Audio API for amplitude analysis
    const audioCtx = new AudioContext();
    audioContextRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    // Set up MediaRecorder
    const mimeType = getRecordingMimeType();
    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;
    chunksRef.current = [];
    waveformRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const duration = (Date.now() - startTimeRef.current) / 1000;

      // Downsample waveform to WAVEFORM_SAMPLES points
      const raw = waveformRef.current;
      const waveform = downsampleWaveform(raw, WAVEFORM_SAMPLES);

      const recording: VoiceRecording = { blob, mimeType, duration, waveform };

      if (resolveRef.current) {
        resolveRef.current(recording);
        resolveRef.current = null;
      }

      cleanup();
      setIsRecording(false);
      setRecordingDuration(0);
      setLiveWaveform([]);
    };

    // Start recording
    recorder.start(250); // collect data every 250ms
    startTimeRef.current = Date.now();
    setIsRecording(true);
    setRecordingDuration(0);
    setLiveWaveform([]);

    // Duration timer (updates every 100ms for smooth display)
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      setRecordingDuration(elapsed);

      // Auto-stop at max duration
      if (elapsed >= MAX_DURATION) {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }
    }, 100);

    // Waveform amplitude sampler
    samplerRef.current = setInterval(() => {
      if (!analyserRef.current) return;
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteTimeDomainData(dataArray);

      // Compute RMS amplitude (0–100 integer)
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128; // -1..1
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      // Map RMS to 0–100 (typical voice RMS is ~0.05–0.3)
      const amplitude = Math.min(100, Math.round(rms * 333));

      waveformRef.current.push(amplitude);
      setLiveWaveform((prev) => [...prev, amplitude]);
    }, SAMPLE_INTERVAL_MS);
  }, [isRecording, isSupported, cleanup]);

  const stopRecording = useCallback(async (): Promise<VoiceRecording | null> => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') return null;

    return new Promise<VoiceRecording | null>((resolve) => {
      resolveRef.current = resolve;
      recorder.stop();
    });
  }, []);

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      // Detach the onstop handler to prevent resolving
      recorder.onstop = () => {
        cleanup();
        setIsRecording(false);
        setRecordingDuration(0);
        setLiveWaveform([]);
      };
      recorder.stop();
    } else {
      cleanup();
      setIsRecording(false);
      setRecordingDuration(0);
      setLiveWaveform([]);
    }
    if (resolveRef.current) {
      resolveRef.current(null);
      resolveRef.current = null;
    }
  }, [cleanup]);

  return {
    isSupported,
    isRecording,
    recordingDuration,
    liveWaveform,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}

/**
 * Downsample an amplitude array to a target number of samples.
 * Each output sample is the max amplitude within its window.
 */
function downsampleWaveform(raw: number[], targetLen: number): number[] {
  if (raw.length === 0) return [];
  if (raw.length <= targetLen) return raw;

  const result: number[] = [];
  const step = raw.length / targetLen;
  for (let i = 0; i < targetLen; i++) {
    const start = Math.floor(i * step);
    const end = Math.floor((i + 1) * step);
    let max = 0;
    for (let j = start; j < end && j < raw.length; j++) {
      if (raw[j] > max) max = raw[j];
    }
    result.push(max);
  }
  return result;
}
