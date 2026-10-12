import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FormattedMessage, useIntl } from "react-intl";
import { useLayoutOptions } from "@/contexts/LayoutContext";
import { useAppContext } from "@/hooks/useAppContext";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { loadBundledFont } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import "./NotFound.css";

/** A few stars that breathe: [x %, y %, size, period s, delay s]. */
const TWINKLES = [
  [8, 22, 2.2, 5.1, -1], [17, 64, 1.6, 6.3, -3], [29, 30, 1.3, 4.4, -2], [38, 72, 1.8, 7.2, -5],
  [63, 18, 2.4, 5.8, -4], [71, 58, 1.4, 6.8, -1], [82, 34, 2, 5.4, -6], [91, 70, 1.5, 4.8, -2],
  [52, 80, 1.2, 6, -3], [46, 14, 1.6, 7.6, -5], [24, 46, 1.1, 5.6, -4], [76, 86, 1.3, 6.4, -2],
];

/** How long the light stays in the cube's seams after it is touched. */
const SEAM_MS = 2600;

const NotFound = () => {
  const intl = useIntl();
  const location = useLocation();
  const { config } = useAppContext();

  // The night runs edge to edge: no mobile chrome over it (the page pads for
  // the device's safe areas itself) and no overscroll, so it fits the screen
  // without scrolling. "Go home" is the way out.
  useLayoutOptions({ showFAB: false, noOverscroll: true, hideTopBar: true, hideBottomNav: true });

  useSeoMeta({
    title: `${intl.formatMessage({ id: "notFound.title", defaultMessage: "Nothing lives here" })} | ${config.appName}`,
    description: intl.formatMessage({ id: "notFound.description", defaultMessage: "Nothing lives at this address." }),
  });

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  // The title fades in after a second; the serif is usually in by then.
  useEffect(() => {
    loadBundledFont("Playfair Display");
  }, []);

  const [lit, setLit] = useState(false);
  const seamTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(seamTimer.current), []);

  const touchCube = () => {
    clearTimeout(seamTimer.current);
    // Drop the class for a frame so a second touch restarts the animation.
    setLit(false);
    requestAnimationFrame(() => {
      setLit(true);
      seamTimer.current = setTimeout(() => setLit(false), SEAM_MS);
    });
  };

  return (
    <main className="lost">
      <div className="lost-sky" aria-hidden="true">
        <div className="lost-stars far" />
        <div className="lost-stars" />
        {TWINKLES.map(([x, y, s, t, d], i) => (
          <i
            key={i}
            className="lost-twinkle"
            style={{ "--x": `${x}%`, "--y": `${y}%`, "--s": s, "--t": `${t}s`, "--d": `${d}s` } as React.CSSProperties}
          />
        ))}
      </div>

      <div className="lost-saturn" aria-hidden="true">
        <div className="lost-rings far" />
        <div className="lost-planet" />
        <div className="lost-rings near" />
      </div>

      <button
        type="button"
        className={cn("lost-cube-seat", lit && "lit")}
        onClick={touchCube}
        aria-label={intl.formatMessage({ id: "notFound.cube", defaultMessage: "The black cube" })}
      >
        <span className="lost-cube" aria-hidden="true">
          <i /><i /><i /><i /><i /><i />
        </span>
      </button>

      <div className="lost-words">
        <h1 className="lost-title">
          <FormattedMessage id="notFound.heading" defaultMessage="Nothing lives here." />
        </h1>
        <Link to="/" className="lost-pill">
          <FormattedMessage id="notFound.home" defaultMessage="Go home" />
        </Link>
      </div>
    </main>
  );
};

export default NotFound;
