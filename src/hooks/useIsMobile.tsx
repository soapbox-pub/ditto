import { useEffect, useState } from "react"

/** Matches the `md` breakpoint in tailwind.config.ts (768px). Hardcoded to avoid pulling the entire Tailwind config + plugins into the client bundle. */
const MOBILE_BREAKPOINT = 768;

const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

export function useIsMobile(): boolean {
  // The media query, never `window.innerWidth`: reading that brings layout up
  // to date, so a mount mid-page-switch lays out the whole half-built page.
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => {
      setIsMobile(mql.matches);
    }
    mql.addEventListener("change", onChange);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
