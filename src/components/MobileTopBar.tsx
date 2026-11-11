import { useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { DittoLogo } from '@/components/DittoLogo';
import { BarsStaggeredIcon } from '@/components/icons/BarsStaggeredIcon';
import { useNavHidden } from '@/contexts/LayoutContext';
import { TOP_BAR_ARC_OVERHANG_PX, topBarArcPaths } from '@/lib/topBarArc';

interface MobileTopBarProps {
  onAvatarClick: () => void;
  /** When true, a SubHeaderBar with an arc follows immediately below — the bar is flat here to avoid doubling up. */
  hasSubHeader?: boolean;
}

export function MobileTopBar({ onAvatarClick, hasSubHeader }: MobileTopBarProps) {
  const location = useLocation();
  const navHidden = useNavHidden();
  const arc = topBarArcPaths(hasSubHeader ? 1 : 0);

  const handleLogoClick = useCallback((e: React.MouseEvent) => {
    if (location.pathname === '/') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location.pathname]);

  return (
    <header
      className="push-transition-top-bar sticky top-0 z-20 sidebar:hidden safe-area-top transition-transform duration-300 ease-in-out"
      style={navHidden ? { transform: 'translateY(calc(-100% - 20px - var(--safe-area-inset-top, env(safe-area-inset-top, 0px))))' } : undefined}
    >
      {/* Safe-area fill — only covers the padding zone above the content with a single layer of bg. */}
      <div
        className="absolute top-0 left-0 right-0 bg-background/85"
        style={{ height: 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))' }}
      />
      {/* Relative wrapper so the background shape only covers the content area, not the safe-area padding above it. */}
      <div className="relative">
        {/* One shape for both the flat and the arced bar, so a swipe back can draw the steps between them (see topBarArc). */}
        <svg
          data-top-bar-arc={hasSubHeader ? 'flat' : 'arc'}
          className="absolute inset-0 w-full pointer-events-none"
          viewBox="0 0 100 64"
          preserveAspectRatio="none"
          style={{ height: `calc(100% + ${TOP_BAR_ARC_OVERHANG_PX}px)` }}
        >
          <path d={arc.fill} className="fill-background/85" />
          <path d={arc.edge} fill="none" className="stroke-border" strokeWidth="1" strokeOpacity={arc.edgeOpacity} vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="relative flex items-center px-3 h-10">
          {/* Left: hamburger menu icon */}
          <div className="flex items-center justify-center w-7 shrink-0">
            <button onClick={onAvatarClick} className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background text-muted-foreground hover:text-foreground transition-colors">
              <BarsStaggeredIcon className="size-5" />
            </button>
          </div>

          {/* Center: Ditto logo */}
          <div className="flex-1 flex items-center justify-center">
            <Link to="/" onClick={handleLogoClick}>
              <DittoLogo size={28} />
            </Link>
          </div>

          {/* Right: spacer for symmetry */}
          <div className="w-7 shrink-0" />
        </div>
      </div>
    </header>
  );
}
