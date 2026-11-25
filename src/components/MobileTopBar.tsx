import { useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { DittoLogo } from '@/components/DittoLogo';
import { EmojifiedText } from '@/components/CustomEmoji';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BarsStaggeredIcon } from '@/components/icons/BarsStaggeredIcon';
import { useAuthor } from '@/hooks/useAuthor';
import { getAvatarShape } from '@/lib/avatarShape';
import { profileName } from '@/lib/getDisplayName';
import { TOP_BAR_ARC_OVERHANG_PX, topBarArcPaths } from '@/lib/topBarArc';
import { cn } from '@/lib/utils';

interface MobileTopBarProps {
  onAvatarClick: () => void;
  /** When true, a SubHeaderBar with an arc follows immediately below — the bar is flat here to avoid doubling up. */
  hasSubHeader?: boolean;
  /** Profile whose avatar and name can stand in for the logo (see `titleVisible`). */
  titlePubkey?: string;
  /** Show the `titlePubkey` profile in place of the logo. */
  titleVisible?: boolean;
}

export function MobileTopBar({ onAvatarClick, hasSubHeader, titlePubkey, titleVisible }: MobileTopBarProps) {
  const location = useLocation();
  const arc = topBarArcPaths(hasSubHeader ? 1 : 0);
  const showTitle = !!titlePubkey && !!titleVisible;

  const handleLogoClick = useCallback((e: React.MouseEvent) => {
    if (location.pathname === '/') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location.pathname]);

  return (
    <header className="push-transition-top-bar sticky top-0 z-20 sidebar:hidden safe-area-top chrome-follow chrome-follow-top-bar">
      {/* Safe-area fill — only covers the padding zone above the content with a single layer of bg. */}
      <div
        className="absolute top-0 left-0 right-0 bg-surface"
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

          {/* Center: Ditto logo, or the profile the page shows once its header scrolls away */}
          <div className="relative flex-1 min-w-0 flex items-center justify-center overflow-hidden h-full">
            <Link
              to="/"
              onClick={handleLogoClick}
              tabIndex={showTitle ? -1 : undefined}
              aria-hidden={showTitle || undefined}
              className={cn(
                'transition-[opacity,transform] duration-300 ease-out',
                showTitle && 'opacity-0 -translate-y-3 pointer-events-none',
              )}
            >
              <DittoLogo size={28} />
            </Link>
            {titlePubkey && <TopBarTitle pubkey={titlePubkey} visible={showTitle} />}
          </div>

          {/* Right: spacer for symmetry */}
          <div className="w-7 shrink-0" />
        </div>
      </div>
    </header>
  );
}

/** A profile's avatar and name, rising into the top bar; tapping it scrolls back to the top. */
function TopBarTitle({ pubkey, visible }: { pubkey: string; visible: boolean }) {
  const intl = useIntl();
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const name = profileName(metadata) || intl.formatMessage({ id: 'common.anonymous', defaultMessage: 'Anonymous' });

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      tabIndex={visible ? undefined : -1}
      aria-hidden={!visible || undefined}
      className={cn(
        'absolute inset-0 flex items-center justify-center gap-2 px-2 min-w-0',
        'transition-[opacity,transform] duration-300 ease-out',
        !visible && 'opacity-0 translate-y-3 pointer-events-none',
      )}
    >
      <Avatar shape={getAvatarShape(metadata)} className="size-6 shrink-0">
        <AvatarImage src={metadata?.picture} imeta={author.data?.imeta?.picture} alt="" />
        <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
          {name[0]?.toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="text-sm font-bold truncate">
        {author.data?.event ? <EmojifiedText tags={author.data.event.tags}>{name}</EmojifiedText> : name}
      </span>
    </button>
  );
}
