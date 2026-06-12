import { useEffect, useRef } from "react";

/**
 * Play a silent audio signal to prevent mobile browsers from
 * suspending the tab when backgrounded. This hints to the browser
 * that audio is active and the tab should stay alive.
 */
export function useAudioKeepAlive(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    try {
      const ctx = new AudioContext();
      ctxRef.current = ctx;

      // Play a very short silent buffer every 25 seconds to keep the audio context alive
      const playSlience = () => {
        if (ctx.state === "suspended") {
          ctx.resume().catch(() => {});
        }
        const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start();
      };

      playSlience();
      intervalRef.current = setInterval(playSlience, 25000);

      console.log("[audio-keep-alive] started");
    } catch (err) {
      console.warn("[audio-keep-alive] failed:", err);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      console.log("[audio-keep-alive] stopped");
    };
  }, [enabled]);
}
