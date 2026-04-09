import { useState, useRef, useCallback, useEffect, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { Blocks, Play, X, Gamepad2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Webxdc, type WebxdcHandle } from '@/components/Webxdc';
import { GameControls } from '@/components/GameControls';
import { useCenterColumn } from '@/contexts/LayoutContext';
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
export function WebxdcEmbed({ url, uuid, name, icon, className }: WebxdcEmbedProps) {
  const [launched, setLaunched] = useState(false);
  const [showGamepad, setShowGamepad] = useState(false);
  const webxdcHandleRef = useRef<WebxdcHandle>(null);

  const centerColumn = useCenterColumn();
  const columnRect = useElementRect(launched ? centerColumn : null);

  // Derive a private, stable subdomain from a device-local seed + the identifier.
  const identifier = uuid ?? url;
  const iframeId = deriveIframeSubdomain('webxdc', identifier);

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
    return (
      <div
        className={cn(
          'mt-3 rounded-2xl border border-border bg-secondary/30 overflow-hidden',
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center justify-center gap-4 py-8 px-6">
          {icon ? (
            <img
              src={icon}
              alt={name ?? 'Webxdc App'}
              className="size-14 rounded-2xl object-cover"
            />
          ) : (
            <div className="flex items-center justify-center size-14 rounded-2xl bg-primary/10">
              <Blocks className="size-7 text-primary" />
            </div>
          )}
          <p className="text-sm font-medium">{name ?? 'Webxdc App'}</p>
          <Button
            size="sm"
            onClick={() => setLaunched(true)}
            className="rounded-full gap-2"
          >
            <Play className="size-4" />
            Launch App
          </Button>
        </div>
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
