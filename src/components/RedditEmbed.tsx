import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

interface RedditEmbedProps {
  /** Full URL of the Reddit post (www.reddit.com or old.reddit.com). */
  url: string;
  className?: string;
}

/**
 * Renders a Reddit post embed using a direct iframe to `embed.reddit.com`.
 *
 * Reddit's embed sends `postMessage` events with `{ type: "resize.embed", data: height }`
 * from `https://embed.reddit.com` for auto-sizing.
 */
export function RedditEmbed({ url, className }: RedditEmbedProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Convert the post URL to the embed URL
  const embedUrl = (() => {
    try {
      const u = new URL(url);
      u.hostname = 'embed.reddit.com';
      // Clean trailing query/hash
      u.search = '';
      u.hash = '';
      return u.toString();
    } catch {
      return url;
    }
  })();

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.origin !== 'https://embed.reddit.com') return;
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;

      // Reddit sends: { type: "resize.embed", data: number }
      const data = e.data;
      if (typeof data !== 'object' || !data) return;

      if (data.type === 'resize.embed' && typeof data.data === 'number' && data.data > 0) {
        iframeRef.current.style.height = `${data.data}px`;
        iframeRef.current.style.minHeight = '0';
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className={cn('overflow-hidden rounded-2xl', className)}>
      <iframe
        ref={iframeRef}
        src={embedUrl}
        title="Reddit post"
        className="w-full border-0 rounded-2xl"
        style={{ minHeight: 320 }}
        scrolling="no"
        allowFullScreen
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
    </div>
  );
}
