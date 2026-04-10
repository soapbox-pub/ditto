import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { DittoLogo } from '@/components/DittoLogo';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/hooks/useAppContext';
import { useTheme } from '@/hooks/useTheme';
import { themePresets, coreToTokens, type CoreThemeColors } from '@/themes';
import { cn } from '@/lib/utils';

interface LandingHeroProps {
  onLoginClick: () => void;
  onSignupClick: () => void;
}

/** Converts an HSL token string like "258 70% 60%" to a CSS hsl() value. */
function hsl(value: string): string {
  return `hsl(${value})`;
}

/** A mini theme preview swatch that shows a visual taste of the theme's personality. */
function ThemeSwatch({
  colors,
  label,
  emoji,
  backgroundUrl,
  isActive,
  onClick,
}: {
  colors: CoreThemeColors;
  label: string;
  emoji: string;
  backgroundUrl?: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const tokens = useMemo(() => coreToTokens(colors), [colors]);

  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex-shrink-0 rounded-xl border-2 p-1 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isActive
          ? 'border-primary shadow-md scale-[1.02]'
          : 'border-border/50 hover:border-primary/40 hover:shadow-sm',
      )}
    >
      {/* Mini preview */}
      <div
        className="w-[88px] aspect-[4/3] rounded-lg overflow-hidden relative"
        style={{ backgroundColor: hsl(tokens.background) }}
      >
        {backgroundUrl && (
          <img
            src={backgroundUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover opacity-40"
          />
        )}
        {/* Content area */}
        <div className="p-1.5 pt-2.5 space-y-0.5 relative">
          <div
            className="h-0.5 w-3/4 rounded-full"
            style={{ backgroundColor: hsl(tokens.foreground), opacity: 0.5 }}
          />
          <div
            className="h-0.5 w-1/2 rounded-full"
            style={{ backgroundColor: hsl(tokens.mutedForeground), opacity: 0.3 }}
          />
          <div className="pt-0.5">
            <div
              className="h-1.5 w-6 rounded-sm"
              style={{ backgroundColor: hsl(tokens.primary) }}
            />
          </div>
        </div>
      </div>
      {/* Label */}
      <p className={cn(
        'mt-1 text-[10px] font-medium text-center truncate transition-colors',
        isActive ? 'text-foreground' : 'text-muted-foreground',
      )}>
        {emoji} {label}
      </p>
    </button>
  );
}

export function LandingHero({ onLoginClick, onSignupClick }: LandingHeroProps) {
  const { config } = useAppContext();
  const { theme, customTheme, applyCustomTheme, setTheme } = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Get featured presets for the theme strip
  const featuredPresets = useMemo(() =>
    Object.entries(themePresets)
      .filter(([, preset]) => preset.featured)
      .slice(0, 12),
    [],
  );

  // Check which preset is active
  const activePresetId = useMemo(() => {
    if (theme !== 'custom' || !customTheme) return null;
    const serialized = JSON.stringify(customTheme.colors);
    for (const [id, preset] of Object.entries(themePresets)) {
      if (JSON.stringify(preset.colors) === serialized) return id;
    }
    return null;
  }, [theme, customTheme]);

  const updateScrollButtons = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.6;
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  return (
    <div className="landing-hero">
      {/* ── Hero Header ── */}
      <div className="px-4 pt-8 pb-6 text-center space-y-4">
        <div className="flex justify-center landing-hero-fade" style={{ animationDelay: '0ms' }}>
          <DittoLogo size={56} />
        </div>

        <div className="space-y-2 landing-hero-fade" style={{ animationDelay: '80ms' }}>
          <h1 className="text-2xl sidebar:text-3xl font-bold tracking-tight">
            {config.appName}
          </h1>
          <p className="text-muted-foreground text-sm sidebar:text-base max-w-xs mx-auto leading-relaxed">
            Your content. Your vibe. Your&nbsp;rules.
          </p>
        </div>

        <div className="flex gap-3 justify-center landing-hero-fade" style={{ animationDelay: '160ms' }}>
          <Button onClick={onSignupClick} className="rounded-full px-6" size="sm">
            Sign up
          </Button>
          <Button onClick={onLoginClick} variant="outline" className="rounded-full px-6" size="sm">
            Log in
          </Button>
          <Button variant="outline" className="rounded-full px-6" size="sm" asChild>
            <Link to="/help">FAQ</Link>
          </Button>
        </div>
      </div>

      {/* ── Theme Showcase ── */}
      <div className="pb-5 landing-hero-fade" style={{ animationDelay: '240ms' }}>
        <div className="px-4 mb-2.5 flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Make it yours
          </p>
          <Link
            to="/themes"
            className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
          >
            All themes
          </Link>
        </div>

        {/* Scrollable theme strip */}
        <div className="relative group/scroll">
          {/* Left arrow */}
          {canScrollLeft && (
            <button
              onClick={() => scroll('left')}
              className="absolute left-1 top-1/2 -translate-y-1/2 z-10 size-7 rounded-full bg-background/90 border border-border shadow-sm flex items-center justify-center opacity-0 group-hover/scroll:opacity-100 transition-opacity"
              aria-label="Scroll left"
            >
              <ChevronLeft className="size-4" />
            </button>
          )}

          <div
            ref={scrollRef}
            onScroll={updateScrollButtons}
            className="flex gap-2 px-4 overflow-x-auto scrollbar-none scroll-smooth"
          >
            {featuredPresets.map(([id, preset]) => (
              <ThemeSwatch
                key={id}
                colors={preset.colors}
                label={preset.label}
                emoji={preset.emoji}
                backgroundUrl={preset.background?.url}
                isActive={activePresetId === id}
                onClick={() => applyCustomTheme({
                  colors: preset.colors,
                  font: preset.font,
                  background: preset.background,
                })}
              />
            ))}

            {/* Reset to default */}
            <button
              onClick={() => setTheme('system')}
              className={cn(
                'flex-shrink-0 rounded-xl border-2 p-1 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                theme === 'system'
                  ? 'border-primary shadow-md scale-[1.02]'
                  : 'border-border/50 hover:border-primary/40 hover:shadow-sm',
              )}
            >
              <div className="w-[88px] aspect-[4/3] rounded-lg overflow-hidden relative bg-gradient-to-br from-background to-muted flex items-center justify-center">
                <span className="text-lg">🔄</span>
              </div>
              <p className={cn(
                'mt-1 text-[10px] font-medium text-center truncate transition-colors',
                theme === 'system' ? 'text-foreground' : 'text-muted-foreground',
              )}>
                Default
              </p>
            </button>
          </div>

          {/* Right arrow */}
          {canScrollRight && (
            <button
              onClick={() => scroll('right')}
              className="absolute right-1 top-1/2 -translate-y-1/2 z-10 size-7 rounded-full bg-background/90 border border-border shadow-sm flex items-center justify-center opacity-0 group-hover/scroll:opacity-100 transition-opacity"
              aria-label="Scroll right"
            >
              <ChevronRight className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Divider into feed ── */}
      <div className="border-b border-border" />
    </div>
  );
}
