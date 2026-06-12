import { useEffect, useRef } from "react";

/**
 * Request a screen wake lock to prevent the screen from dimming
 * while the user is in a room. Automatically re-acquires on
 * visibility change (e.g., switching back to the tab).
 */
export function useWakeLock(enabled: boolean) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;

    const request = async () => {
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        console.log("[wake-lock] acquired");
        wakeLockRef.current.addEventListener("release", () => {
          console.log("[wake-lock] released");
        });
      } catch (err) {
        console.warn("[wake-lock] failed to acquire:", err);
      }
    };

    // Re-acquire when page becomes visible again (tab switch, screen on)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && enabled) {
        request();
      }
    };

    request();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [enabled]);
}
