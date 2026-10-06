import { useEffect, useState } from "react"

/** Matches the `md` breakpoint in src/index.css (768px). */
const MOBILE_BREAKPOINT = 768;

export function useIsMobile(): boolean {
  // Lazy: `window.innerWidth` can force a layout, and an eager initial value
  // is re-read on every render of every caller.
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    }
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
