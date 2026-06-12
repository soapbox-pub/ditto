import { useEffect, useRef, useState } from "react";
import { useNestTransport } from "../transport";

const THRESHOLD = -35; // dB threshold for "speaking"
const ON_FRAMES = 3;   // consecutive frames above threshold to activate
const OFF_FRAMES = 6;  // consecutive frames below threshold to deactivate
const POLL_MS = 100;

function analyseVolume(analyser: AnalyserNode, dataArray: Uint8Array<ArrayBuffer>): number {
  analyser.getByteFrequencyData(dataArray);
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    sum += dataArray[i];
  }
  const avg = sum / dataArray.length;
  return avg > 0 ? 20 * Math.log10(avg / 255) : -100;
}

/**
 * Detect whether the local user is currently speaking based on mic audio levels.
 * Returns true when audio level exceeds a threshold.
 */
export function useLocalSpeaking(): boolean {
  const transport = useNestTransport();
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    let analyserCleanup: (() => void) | null = null;
    let currentTrack: MediaStreamTrack | null = null;

    function startAnalysis(track: MediaStreamTrack): () => void {
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(new MediaStream([track]));
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let aboveCount = 0;
      let belowCount = 0;
      let currentSpeaking = false;

      const interval = setInterval(() => {
        if (track.readyState !== "live") {
          // Track ended — the poller below will tear this analysis down
          setSpeaking(false);
          return;
        }
        const dB = analyseVolume(analyser, dataArray);

        if (dB > THRESHOLD) {
          aboveCount++;
          belowCount = 0;
          if (!currentSpeaking && aboveCount >= ON_FRAMES) {
            currentSpeaking = true;
            setSpeaking(true);
          }
        } else {
          belowCount++;
          aboveCount = 0;
          if (currentSpeaking && belowCount >= OFF_FRAMES) {
            currentSpeaking = false;
            setSpeaking(false);
          }
        }
      }, POLL_MS);

      return () => {
        clearInterval(interval);
        source.disconnect();
        analyser.disconnect();
        audioContext.close().catch(() => { /* already closed */ });
      };
    }

    // Poll for the mic track. Keeps running so the analyser is rebuilt when
    // the track changes (device switch / re-publish) and torn down when it
    // ends, instead of leaking the AudioContext.
    const checkInterval = setInterval(() => {
      const track = transport.localAudioTrack;
      const trackChanged = track !== currentTrack;
      const trackEnded = currentTrack !== null && currentTrack.readyState !== "live";

      if (trackChanged || trackEnded) {
        analyserCleanup?.();
        analyserCleanup = null;
        currentTrack = null;
        setSpeaking(false);

        if (track && track.readyState === "live") {
          currentTrack = track;
          analyserCleanup = startAnalysis(track);
        }
      }
    }, 500);

    return () => {
      clearInterval(checkInterval);
      analyserCleanup?.();
    };
  }, [transport]);

  return speaking;
}

/**
 * Detect whether a remote participant is currently speaking based on their
 * decoded audio output from the @moq/watch pipeline.
 */
export function useRemoteSpeaking(pubkey: string): boolean {
  const transport = useNestTransport();
  const [speaking, setSpeaking] = useState(false);
  const analyserRef = useRef<{ analyser: AnalyserNode; dataArray: Uint8Array<ArrayBuffer> } | null>(null);

  useEffect(() => {
    let aboveCount = 0;
    let belowCount = 0;
    let currentSpeaking = false;

    const interval = setInterval(() => {
      const audioNode = transport.getRemoteAudioNode(pubkey);
      if (!audioNode) {
        // Audio node not ready yet, keep polling
        analyserRef.current = null;
        return;
      }

      // Create analyser on first availability (or if node changed)
      if (!analyserRef.current) {
        try {
          const ctx = audioNode.context;
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.5;
          audioNode.connect(analyser);
          analyserRef.current = {
            analyser,
            dataArray: new Uint8Array(analyser.frequencyBinCount),
          };
        } catch {
          return;
        }
      }

      const { analyser, dataArray } = analyserRef.current;
      const dB = analyseVolume(analyser, dataArray);

      if (dB > THRESHOLD) {
        aboveCount++;
        belowCount = 0;
        if (!currentSpeaking && aboveCount >= ON_FRAMES) {
          currentSpeaking = true;
          setSpeaking(true);
        }
      } else {
        belowCount++;
        aboveCount = 0;
        if (currentSpeaking && belowCount >= OFF_FRAMES) {
          currentSpeaking = false;
          setSpeaking(false);
        }
      }
    }, POLL_MS);

    return () => {
      clearInterval(interval);
      if (analyserRef.current) {
        try {
          analyserRef.current.analyser.disconnect();
        } catch { /* ignore */ }
        analyserRef.current = null;
      }
    };
  }, [transport, pubkey]);

  return speaking;
}
