import { useEffect, useRef } from 'react';

import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

interface TweetEmbedProps {
  tweetId: string;
  className?: string;
}

/**
 * Renders a Twitter/X tweet embed using a direct iframe to Twitter's
 * embed page. No third-party scripts are loaded — just an iframe to
 * `platform.twitter.com/embed/Tweet.html` with the tweet ID and options.
 *
 * Listens for `twttr.private.resize` postMessage events from the embed
 * to auto-size the iframe to fit the tweet content.
 */
export function TweetEmbed({ tweetId, className }: TweetEmbedProps) {
  const { theme } = useTheme();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const params = new URLSearchParams({
    id: tweetId,
    dnt: 'true',
    theme: theme === 'dark' ? 'dark' : 'light',
  });

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.origin !== 'https://platform.twitter.com') return;
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;

      const wrapper = e.data?.['twttr.embed'];
      if (!wrapper || typeof wrapper !== 'object') return;

      if (wrapper.method === 'twttr.private.resize') {
        const height = wrapper.params?.[0]?.height;
        if (typeof height === 'number' && height > 0) {
          iframeRef.current.style.height = `${height}px`;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className={cn('overflow-hidden', className)}>
      <iframe
        ref={iframeRef}
        src={`https://platform.twitter.com/embed/Tweet.html?${params}`}
        title="Tweet"
        className="w-full border-0"
        style={{ minHeight: 250 }}
        scrolling="no"
        allowFullScreen
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  );
}
