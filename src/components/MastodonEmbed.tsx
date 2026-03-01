import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

interface MastodonEmbedProps {
  /** Full URL of the Mastodon post. */
  url: string;
  className?: string;
}

/**
 * Renders a Mastodon post embed using a direct iframe to the instance's
 * embed endpoint (`{postUrl}/embed`).
 *
 * Listens for `setHeight` postMessage events from the embed to auto-size
 * the iframe to fit the post content.
 */
export function MastodonEmbed({ url, className }: MastodonEmbedProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const origin = (() => {
    try {
      return new URL(url).origin;
    } catch {
      return '';
    }
  })();

  useEffect(() => {
    if (!origin) return;

    const handleMessage = (e: MessageEvent) => {
      if (e.origin !== origin) return;
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;

      const data = e.data;
      if (typeof data !== 'object' || !data) return;

      if (data.type === 'setHeight' && typeof data.height === 'number' && data.height > 0) {
        iframeRef.current.style.height = `${data.height}px`;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [origin]);

  const embedUrl = `${url}/embed`;

  return (
    <div className={cn('overflow-hidden', className)}>
      <iframe
        ref={iframeRef}
        src={embedUrl}
        title="Mastodon post"
        className="w-full border-0"
        style={{ minHeight: 200 }}
        scrolling="no"
        allowFullScreen
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  );
}
