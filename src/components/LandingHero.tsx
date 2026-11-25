import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FormattedMessage, useIntl } from 'react-intl';

import { DittoLogo } from '@/components/DittoLogo';
import { ThemeCard } from '@/components/ThemeSelector';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/hooks/useAppContext';
import { useTheme } from '@/hooks/useTheme';
import { themePresets, coreToTokens, resolveThemeConfig } from '@/themes';
import { isSlideRender } from '@/lib/pushTransition';
import { cn } from '@/lib/utils';

interface LandingHeroProps {
  onLoginClick: () => void;
  onSignupClick: () => void;
}

/** Pixels per second the theme strip pans on its own. */
const PAN_SPEED = 20;

/** Pointer travel past which a press counts as a drag rather than a click. */
const DRAG_THRESHOLD = 4;

const EDGE_FADE = 'linear-gradient(to right, transparent, black 2rem, black calc(100% - 2rem), transparent)';

/**
 * A strip that pans slowly and loops. The items are rendered twice so the
 * track can wrap at half its width without a visible jump. Hover or focus
 * pauses it, it can be dragged (with momentum), and with reduced motion it
 * sits still as a plain horizontal scroll.
 */
function ThemeMarquee({ items }: { items: { key: string; node: ReactNode }[] }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const offset = useRef(0);
  const paused = useRef(false);
  const drag = useRef({ active: false, pointerId: -1, startX: 0, startOffset: 0, lastX: 0, lastTime: 0, velocity: 0, travel: 0 });
  const momentumRaf = useRef(0);
  const [reduceMotion, setReduceMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  /** Moves the track, keeping the offset within one copy of the items so the loop stays seamless. */
  const place = useCallback((value: number) => {
    const track = trackRef.current;
    if (!track) return;
    const half = track.scrollWidth / 2;
    if (half > 0 && -value >= half) value += half;
    if (half > 0 && value > 0) value -= half;
    offset.current = value;
    track.style.transform = `translate3d(${value}px, 0, 0)`;
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    let last = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!paused.current) place(offset.current - PAN_SPEED * dt);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(momentumRaf.current);
    };
  }, [reduceMotion, place]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduceMotion || (e.pointerType === 'mouse' && e.button !== 0)) return;
    cancelAnimationFrame(momentumRaf.current);
    paused.current = true;
    drag.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startOffset: offset.current,
      lastX: e.clientX,
      lastTime: performance.now(),
      velocity: 0,
      travel: 0,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active) return;
    // Capture only once it's a real drag: capturing on pointerdown would
    // retarget the click away from the card under the pointer.
    if (d.travel <= DRAG_THRESHOLD && Math.abs(e.clientX - d.startX) > DRAG_THRESHOLD) {
      viewportRef.current?.setPointerCapture(d.pointerId);
    }
    place(d.startOffset + e.clientX - d.startX);
    d.travel += Math.abs(e.clientX - d.lastX);
    const now = performance.now();
    if (now > d.lastTime) d.velocity = ((e.clientX - d.lastX) / (now - d.lastTime)) * 1000;
    d.lastX = e.clientX;
    d.lastTime = now;
  };

  const handlePointerUp = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    // The click fires right after pointerup and still needs to see the travel.
    requestAnimationFrame(() => { drag.current.travel = 0; });

    let v = drag.current.velocity;
    const coast = () => {
      v *= 0.92;
      if (Math.abs(v) < 1) {
        paused.current = viewportRef.current?.matches(':hover, :focus-within') ?? false;
        return;
      }
      place(offset.current + v / 60);
      momentumRaf.current = requestAnimationFrame(coast);
    };
    momentumRaf.current = requestAnimationFrame(coast);
  };

  const handlePointerCancel = () => {
    drag.current.active = false;
    paused.current = false;
    cancelAnimationFrame(momentumRaf.current);
  };

  return (
    <div
      ref={viewportRef}
      className={cn(
        'select-none',
        reduceMotion ? 'overflow-x-auto scrollbar-none' : 'overflow-hidden cursor-grab active:cursor-grabbing',
      )}
      style={{ maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE, touchAction: reduceMotion ? undefined : 'pan-y' }}
      onMouseEnter={() => { if (!drag.current.active) paused.current = true; }}
      onMouseLeave={() => { if (!drag.current.active) paused.current = false; }}
      onFocusCapture={() => { paused.current = true; }}
      onBlurCapture={() => { if (!drag.current.active) paused.current = false; }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClickCapture={(e) => {
        if (drag.current.travel > DRAG_THRESHOLD) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onDragStart={(e) => e.preventDefault()}
    >
      <div ref={trackRef} className={cn('flex w-max py-1', reduceMotion ? 'pl-4' : 'will-change-transform')}>
        {[0, 1].map((copy) => (copy === 1 && reduceMotion ? null : (
          // The second copy only exists for the loop, so it's hidden from assistive tech and focus.
          <div key={copy} className="flex gap-2 pr-2" inert={copy === 1}>
            {items.map((item) => (
              <div key={item.key} className="w-32 flex-shrink-0">{item.node}</div>
            ))}
          </div>
        )))}
      </div>
    </div>
  );
}

export function LandingHero({ onLoginClick, onSignupClick }: LandingHeroProps) {
  const intl = useIntl();
  const { config } = useAppContext();
  const { theme, customTheme, themes, applyCustomTheme, setTheme } = useTheme();
  // Fades in on arrival, not when coming back to it (a swipe back already showed it).
  const [fade] = useState(() => !isSlideRender() && 'landing-hero-fade');

  // Get featured presets for the theme strip
  const featuredPresets = useMemo(() =>
    Object.entries(themePresets)
      .filter(([, preset]) => preset.featured)
      .slice(0, 12),
    [],
  );

  const systemTokens = useMemo(() => ({
    light: coreToTokens(resolveThemeConfig('light', themes).colors),
    dark: coreToTokens(resolveThemeConfig('dark', themes).colors),
  }), [themes]);

  // Check which preset is active
  const activePresetId = useMemo(() => {
    if (theme !== 'custom' || !customTheme) return null;
    const serialized = JSON.stringify(customTheme.colors);
    for (const [id, preset] of Object.entries(themePresets)) {
      if (JSON.stringify(preset.colors) === serialized) return id;
    }
    return null;
  }, [theme, customTheme]);

  const themeItems = [
    ...featuredPresets.map(([id, preset]) => ({
      key: id,
      node: (
        <ThemeCard
          tokens={coreToTokens(preset.colors)}
          backgroundUrl={preset.background?.url}
          label={intl.formatMessage(preset.label)}
          isActive={activePresetId === id}
          onSelect={() => applyCustomTheme({
            colors: preset.colors,
            font: preset.font,
            titleFont: preset.titleFont,
            background: preset.background,
          })}
        />
      ),
    })),
    {
      key: 'system',
      node: (
        <ThemeCard
          tokens={systemTokens.light}
          darkTokens={systemTokens.dark}
          label={intl.formatMessage({ id: 'landingHero.defaultTheme', defaultMessage: 'Default' })}
          isActive={theme === 'system'}
          onSelect={() => setTheme('system')}
        />
      ),
    },
  ];

  return (
    <div className="landing-hero">
      {/* ── Hero Header ── */}
      <div className="px-4 pt-8 pb-6 text-center space-y-4">
        <div className={cn('flex justify-center', fade)} style={{ animationDelay: '0ms' }}>
          <DittoLogo size={56} />
        </div>

        <div className={cn('space-y-2', fade)} style={{ animationDelay: '80ms' }}>
          <h1 className="text-2xl sidebar:text-3xl font-bold tracking-tight">
            {config.appName}
          </h1>
          <p className="text-muted-foreground text-sm sidebar:text-base max-w-xs mx-auto leading-relaxed">
            <FormattedMessage id="landingHero.tagline" defaultMessage="Your content. Your vibe. Your rules." />
          </p>
        </div>

        <div className={cn('flex gap-3 justify-center', fade)} style={{ animationDelay: '160ms' }}>
          <Button onClick={onSignupClick} className="rounded-full px-6" size="sm">
            <FormattedMessage id="loginArea.signUp" defaultMessage="Sign up" />
          </Button>
          <Button onClick={onLoginClick} variant="outline" className="rounded-full px-6" size="sm">
            <FormattedMessage id="loginArea.logIn" defaultMessage="Log in" />
          </Button>
          <Button variant="outline" className="rounded-full px-6" size="sm" asChild>
            <Link to="/help"><FormattedMessage id="landingHero.faq" defaultMessage="FAQ" /></Link>
          </Button>
        </div>
      </div>

      {/* ── Theme Showcase ── */}
      <div className={cn('pb-5', fade)} style={{ animationDelay: '240ms' }}>
        <div className="px-4 mb-2.5 flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <FormattedMessage id="landingHero.makeItYours" defaultMessage="Make it yours" />
          </p>
          <Link
            to="/themes"
            className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
          >
            <FormattedMessage id="landingHero.allThemes" defaultMessage="All themes" />
          </Link>
        </div>

        <ThemeMarquee items={themeItems} />
      </div>

      {/* ── Divider into feed ── */}
      <div className="border-b border-border-subtle" />
    </div>
  );
}
