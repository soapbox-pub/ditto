import { useState, useRef, useCallback, forwardRef } from 'react';
import { Blocks, Play, Maximize2, Minimize2, RotateCcw, X, Gamepad2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Webxdc, type WebxdcHandle } from '@/components/Webxdc';
import { GameControls } from '@/components/GameControls';
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

/**
 * Renders a webxdc app embedded in the feed. Shows a launch button initially,
 * then loads the sandboxed iframe when the user clicks to interact.
 */
export function WebxdcEmbed({ url, uuid, name, icon, className }: WebxdcEmbedProps) {
  const [launched, setLaunched] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [showGamepad, setShowGamepad] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const webxdcHandleRef = useRef<WebxdcHandle>(null);

  // Derive a private, stable subdomain from a device-local seed + the identifier.
  // This prevents event authors from choosing a subdomain that collides with
  // another app's origin on iframe.diy.
  const identifier = uuid ?? url;
  const iframeId = deriveIframeSubdomain('webxdc', identifier);

  const handleReload = useCallback(() => {
    setIframeKey((k) => k + 1);
  }, []);

  const handleClose = useCallback(() => {
    setLaunched(false);
    setIsFullscreen(false);
    setShowGamepad(false);
  }, []);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
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

  return (
    <div
      ref={containerRef}
      className={cn(
        isFullscreen
          ? 'fixed inset-0 z-50 bg-background flex flex-col'
          : 'mt-3 rounded-2xl border border-border overflow-hidden flex flex-col',
        !isFullscreen && className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Controls bar */}
      <div className={cn(
        'flex items-center justify-between px-3 py-1.5 bg-muted/60 border-b border-border',
        isFullscreen ? '' : 'rounded-t-2xl',
      )}>
        <div className="flex items-center gap-2 min-w-0">
          {icon ? (
            <img
              src={icon}
              alt={name ?? 'Webxdc App'}
              className="size-5 rounded-md object-cover flex-shrink-0"
            />
          ) : (
            <Blocks className="size-4 text-muted-foreground flex-shrink-0" />
          )}
          <span className="text-xs font-medium text-muted-foreground truncate">
            {name ?? 'Webxdc App'}
          </span>
        </div>

        <TooltipProvider delayDuration={300}>
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('size-7', showGamepad && 'text-primary')}
                  onClick={toggleGamepad}
                >
                  <Gamepad2 className="size-3.5" />
                  <span className="sr-only">
                    {showGamepad ? 'Hide gamepad' : 'Show gamepad'}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {showGamepad ? 'Hide gamepad' : 'Show gamepad'}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={handleReload}
                >
                  <RotateCcw className="size-3.5" />
                  <span className="sr-only">Reload</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Reload</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? (
                    <Minimize2 className="size-3.5" />
                  ) : (
                    <Maximize2 className="size-3.5" />
                  )}
                  <span className="sr-only">
                    {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={handleClose}
                >
                  <X className="size-3.5" />
                  <span className="sr-only">Close</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      {/* Iframe area */}
      <div className={cn("bg-white", isFullscreen ? 'flex-1 relative' : 'relative')}>
        <WebxdcIframe
          key={iframeKey}
          ref={webxdcHandleRef}
          id={iframeId}
          url={url}
          uuid={uuid}
          isFullscreen={isFullscreen}
        />
      </div>

      {/* Game controls overlay */}
      {showGamepad && (
        <div className={cn(
          'border-t border-border bg-background/80 backdrop-blur-sm',
          isFullscreen ? '' : 'rounded-b-2xl',
        )}>
          <GameControls webxdcHandle={webxdcHandleRef.current} />
        </div>
      )}
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
  isFullscreen: boolean;
}>(function WebxdcIframe({ id, url, uuid, isFullscreen }, ref) {
  const webxdc = useWebxdc(uuid ?? '');

  return (
    <Webxdc
      ref={ref}
      id={id}
      xdc={url}
      webxdc={webxdc}
      allow="autoplay; fullscreen; gamepad"
      className="w-full border-0"
      style={{ height: isFullscreen ? '100%' : '400px' }}
    />
  );
});

export default WebxdcEmbed;
