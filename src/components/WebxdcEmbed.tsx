import { useState } from 'react';
import { Blocks, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Webxdc } from '@/components/Webxdc';
import { useWebxdc } from '@/hooks/useWebxdc';
import { cn } from '@/lib/utils';

interface WebxdcEmbedProps {
  /** URL to the .xdc file. */
  url: string;
  /** UUID for stateful webxdc coordination. If absent, the app is stateless. */
  uuid?: string;
  className?: string;
}

/**
 * Renders a webxdc app embedded in the feed. Shows a launch button initially,
 * then loads the sandboxed iframe when the user clicks to interact.
 */
export function WebxdcEmbed({ url, uuid, className }: WebxdcEmbedProps) {
  const [launched, setLaunched] = useState(false);

  // Derive a stable iframe ID from the UUID or URL
  const iframeId = uuid ?? url.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);

  if (!launched) {
    return (
      <div
        className={cn(
          'mt-3 rounded-2xl border border-border bg-secondary/30 overflow-hidden',
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center justify-center gap-4 py-10 px-6">
          <div className="flex items-center justify-center size-14 rounded-2xl bg-primary/10">
            <Blocks className="size-7 text-primary" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium">Webxdc App</p>
            <p className="text-xs text-muted-foreground max-w-xs truncate">{url.split('/').pop()}</p>
            {uuid && (
              <p className="text-xs text-muted-foreground">
                Stateful &middot; shared session
              </p>
            )}
          </div>
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
      className={cn('mt-3 rounded-2xl border border-border overflow-hidden', className)}
      onClick={(e) => e.stopPropagation()}
    >
      <WebxdcIframe id={iframeId} url={url} uuid={uuid} />
    </div>
  );
}

/**
 * Inner component that renders the actual webxdc iframe.
 * Separated so the useWebxdc hook only runs when the app is launched.
 */
function WebxdcIframe({ id, url, uuid }: { id: string; url: string; uuid?: string }) {
  const webxdc = useWebxdc(uuid ?? '');

  return (
    <Webxdc
      id={id}
      xdc={url}
      webxdc={webxdc}
      className="w-full border-0"
      style={{ height: '400px' }}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
    />
  );
}

export default WebxdcEmbed;
