import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useNests } from "@/contexts/nestsContextDef";

/**
 * Auto-minimizes the active nest when the user navigates away from its room
 * page. No dialog — audio keeps playing in the floating mini-bar. Leaving
 * only happens via explicit buttons (menu bar, mini-bar X, kick).
 */
export function NestsNavigationGuard() {
  const { session, minimize } = useNests();
  const location = useLocation();
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname !== prevPath.current) {
      const roomPath = session ? `/nests/${session.naddr}` : null;
      if (session && !session.minimized && location.pathname !== roomPath) {
        minimize();
      }
      prevPath.current = location.pathname;
    }
  }, [location.pathname, session, minimize]);

  return null;
}
