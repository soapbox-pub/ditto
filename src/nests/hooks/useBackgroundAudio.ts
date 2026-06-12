import { useEffect, useRef } from "react";

/**
 * Start/stop the Android foreground service for background audio.
 * On web browsers, this is a no-op.
 */
export function useBackgroundAudio(roomTitle: string, enabled: boolean) {
  const activeRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      if (activeRef.current) {
        stopService();
        activeRef.current = false;
      }
      return;
    }

    startService(roomTitle);
    activeRef.current = true;

    return () => {
      stopService();
      activeRef.current = false;
    };
  }, [roomTitle, enabled]);
}

interface BackgroundAudioPlugin {
  start(options: { roomTitle: string }): Promise<void>;
  stop(): Promise<void>;
}

async function startService(roomTitle: string) {
  try {
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const BackgroundAudio = registerPlugin<BackgroundAudioPlugin>("BackgroundAudio");
      await BackgroundAudio.start({ roomTitle });
      console.log("[background-audio] foreground service started");
    }
  } catch {
    // Not on native platform — no-op
  }
}

async function stopService() {
  try {
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const BackgroundAudio = registerPlugin<BackgroundAudioPlugin>("BackgroundAudio");
      await BackgroundAudio.stop();
      console.log("[background-audio] foreground service stopped");
    }
  } catch {
    // Not on native platform — no-op
  }
}
