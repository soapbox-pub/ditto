import { useState } from 'react';
import { Blocks, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Webxdc } from '@/components/Webxdc';
import { useWebxdc } from '@/hooks/useWebxdc';
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
    />
  );
}

export default WebxdcEmbed;
