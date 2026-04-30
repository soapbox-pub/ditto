import { useState, useRef, useCallback, useEffect, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { Blocks, X, Gamepad2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Webxdc, type WebxdcHandle } from '@/components/Webxdc';
import { GameControls } from '@/components/GameControls';
import { useCenterColumn } from '@/contexts/LayoutContext';
import { useAppContext } from '@/hooks/useAppContext';
import { useCardTilt } from '@/hooks/useCardTilt';
import { useDominantColor } from '@/hooks/useDominantColor';
import { useWebxdc } from '@/hooks/useWebxdc';
import { deriveIframeSubdomain } from '@/lib/iframeSubdomain';
import { cn } from '@/lib/utils';

export interface WebxdcEmbedProps {
  /** URL to the .xdc file. */
  url: string;
  /** UUID for stateful webxdc coordination. If absent, the app is stateless. */
  uuid?: string;
  /** App name from manifest.toml. */
  name?: string;
  /** App icon URL. */
  icon?: string;
  /**
   * If true, renders a description-style card below the cartridge with the
   * app name. Defaults to true. Set to false when a parent component is
   * rendering its own card (e.g. `FileMetadataContent`).
   */
  showNameCard?: boolean;
  className?: string;
}

interface Rect { left: number; top: number; width: number; height: number }

/** Track the viewport-relative bounding rect of an element, updating on resize. */
function useElementRect(el: HTMLElement | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!el) { setRect(null); return; }

    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [el]);

  return rect;
}

/**
 * Renders a webxdc app embedded in the feed. Shows a launch card initially,
 * then opens a fullscreen panel (covering the center column on desktop, the
 * full screen on mobile) when the user clicks Play — matching the nsite UX.
 */
export function WebxdcEmbed({ url, uuid, name, icon, showNameCard = true, className }: WebxdcEmbedProps) {
  const [launched, setLaunched] = useState(false);
  const [showGamepad, setShowGamepad] = useState(false);
  const webxdcHandleRef = useRef<WebxdcHandle>(null);

  const centerColumn = useCenterColumn();
  const columnRect = useElementRect(launched ? centerColumn : null);
  const { config } = useAppContext();

  // Derive a private, stable subdomain from a device-local seed + the identifier.
  const identifier = uuid ?? url;
  const iframeId = deriveIframeSubdomain(config.appId, 'webxdc', identifier);

  const handleClose = useCallback(() => {
    setLaunched(false);
    setShowGamepad(false);
  }, []);

  const toggleGamepad = useCallback(() => {
    setShowGamepad((prev) => {
      if (!prev) webxdcHandleRef.current?.focus();
      return !prev;
    });
  }, []);

  if (!launched) {
    const appName = name ?? 'Webxdc App';
    return (
      <div
        className={cn('mt-3 flex flex-col items-center', className)}
        onClick={(e) => e.stopPropagation()}
      >
        <WebxdcCartridgeButton
          appName={appName}
          icon={icon}
          onLaunch={() => setLaunched(true)}
        />
        {showNameCard && (
          <div className="mt-2.5 w-full max-w-sm rounded-xl bg-secondary/50 px-3.5 py-2.5">
            <p className="text-base font-semibold text-foreground break-words">{appName}</p>
          </div>
        )}
      </div>
    );
  }

  if (!centerColumn || !columnRect) return null;

  // Clamp to viewport top edge so the panel never grows taller than the viewport.
  const panelTop = Math.max(0, columnRect.top);
  const panelHeight = window.innerHeight - panelTop;

  return createPortal(
    <div
      className="fixed z-50 flex flex-col bg-background"
      style={{
        left: columnRect.left,
        top: panelTop,
        width: columnRect.width,
        height: panelHeight,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Nav bar */}
      <div className="min-h-11 flex items-center gap-2 px-3 border-b bg-muted/30 shrink-0 safe-area-top">
        {/* App icon + name */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {icon ? (
            <img
              src={icon}
              alt={name ?? 'Webxdc App'}
              className="size-6 rounded-md object-cover shrink-0"
            />
          ) : (
            <div className="size-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <Blocks className="size-3.5 text-primary/50" />
            </div>
          )}
          <span className="text-sm font-medium truncate">{name ?? 'Webxdc App'}</span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-7 w-7 p-0 shrink-0', showGamepad && 'text-primary')}
            onClick={toggleGamepad}
            title={showGamepad ? 'Hide gamepad' : 'Show gamepad'}
          >
            <Gamepad2 className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={handleClose}
            title="Close"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Iframe area */}
      <div className="flex-1 min-h-0 bg-white relative">
        <WebxdcIframe
          ref={webxdcHandleRef}
          id={iframeId}
          url={url}
          uuid={uuid}
        />
      </div>

      {/* Game controls overlay */}
      {showGamepad && (
        <div className="border-t border-border bg-background/80 backdrop-blur-sm">
          <GameControls webxdcHandle={webxdcHandleRef.current} />
        </div>
      )}
    </div>,
    document.body,
  );
}

/**
 * Interactive cartridge button with a 3D mouse-tilt effect. The tilt hook
 * needs to own the pointer events on a `<div>`, so the button sits inside
 * the tilted wrapper rather than the other way around.
 */
function WebxdcCartridgeButton({
  appName,
  icon,
  onLaunch,
}: {
  appName: string;
  icon?: string;
  onLaunch: () => void;
}) {
  // Matches the subtle feel used by encrypted letters (18° max, 1.03x scale).
  const tilt = useCardTilt(18, 1.03, 800);
  const dominant = useDominantColor(icon);

  // Boost saturation + keep mid-lightness so the tint reads vividly when
  // blended with the cartridge's mid-gray shading via `mix-blend-mode: color`.
  const tintColor = dominant
    ? `hsl(${dominant.h.toFixed(1)}, ${Math.min(100, Math.max(70, dominant.s * 100 + 20)).toFixed(1)}%, 50%)`
    : null;

  return (
    <div
      ref={tilt.ref}
      style={{
        ...tilt.style,
        // Allow vertical page scrolling to still work on touch — tilt is a
        // bonus, not the primary interaction (tap to launch is).
        touchAction: 'pan-y',
      }}
      onPointerDown={tilt.onPointerDown}
      onPointerMove={tilt.onPointerMove}
      onPointerUp={tilt.onPointerUp}
      onPointerLeave={tilt.onPointerLeave}
      className="w-full max-w-sm"
    >
      <button
        type="button"
        onClick={onLaunch}
        aria-label={`Launch ${appName}`}
        className={cn(
          'relative block w-full bg-transparent p-0 border-0',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-xl',
          // Create an isolated stacking context so the tint's mix-blend-mode
          // only blends within this button, not with whatever is behind it.
          'isolate',
        )}
      >
        {/* Cartridge background image establishes aspect ratio; icon is absolutely positioned over the label */}
        <img
          src="/cartridge.png"
          alt=""
          aria-hidden="true"
          className="w-full h-auto block select-none pointer-events-none drop-shadow-md"
          draggable={false}
        />
        {/* Color tint layer — masked to cartridge silhouette, blended with the
            grayscale PNG beneath to colorize it while preserving shading. */}
        {tintColor && (
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundColor: tintColor,
              WebkitMaskImage: 'url(/cartridge.png)',
              maskImage: 'url(/cartridge.png)',
              WebkitMaskSize: '100% 100%',
              maskSize: '100% 100%',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              mixBlendMode: 'color',
            }}
          />
        )}
        {/* Label region — coordinates match the inset rectangle in cartridge.png (1024x1024) */}
        <div
          className="absolute flex items-center justify-center"
          style={{
            left: '21.48%',
            top: '29.66%',
            width: '57.32%',
            height: '45.99%',
          }}
        >
          {icon ? (
            <img
              src={icon}
              alt=""
              aria-hidden="true"
              className="w-[70%] aspect-square rounded-[12%] object-cover drop-shadow-md"
              draggable={false}
            />
          ) : (
            <div className="w-[70%] aspect-square rounded-[12%] bg-primary/15 flex items-center justify-center drop-shadow-md">
              <Blocks className="w-1/2 h-1/2 text-primary" />
            </div>
          )}
        </div>
      </button>
    </div>
  );
}

/**
 * Inner component that renders the actual webxdc iframe.
 * Separated so the useWebxdc hook only runs when the app is launched.
 */
const WebxdcIframe = forwardRef<WebxdcHandle, {
  id: string;
  url: string;
  uuid?: string;
}>(function WebxdcIframe({ id, url, uuid }, ref) {
  const webxdc = useWebxdc(uuid ?? '');

  return (
    <Webxdc
      ref={ref}
      id={id}
      xdc={url}
      webxdc={webxdc}
      allow="autoplay; fullscreen; gamepad"
      className="w-full h-full border-0"
    />
  );
});

export default WebxdcEmbed;
