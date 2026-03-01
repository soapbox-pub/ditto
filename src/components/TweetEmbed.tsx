import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

interface TweetEmbedProps {
  tweetId: string;
  url: string;
  className?: string;
}

/**
 * Renders a Twitter/X tweet embed using the official Twitter widgets.js.
 *
 * Loads the Twitter widget script on mount and renders the tweet inside
 * a container using `twttr.widgets.createTweet()`. Falls back to a link
 * if the script fails to load.
 */
export function TweetEmbed({ tweetId, url, className }: TweetEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      try {
        // Load the Twitter widgets.js script if not already present
        await loadTwitterScript();

        if (cancelled || !containerRef.current) return;

        // Clear any previous content
        containerRef.current.innerHTML = '';

        // Use the Twitter widgets API to render the tweet
        const twttr = (window as TwttrWindow).twttr;
        if (!twttr?.widgets?.createTweet) {
          throw new Error('Twitter widgets API not available');
        }

        const el = await twttr.widgets.createTweet(tweetId, containerRef.current, {
          align: 'center',
          dnt: true,
          theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
        });

        if (cancelled) return;

        if (el) {
          setStatus('ready');
        } else {
          // createTweet returns undefined if the tweet doesn't exist
          setStatus('error');
        }
      } catch {
        if (!cancelled) {
          setStatus('error');
        }
      }
    };

    render();

    return () => {
      cancelled = true;
    };
  }, [tweetId]);

  return (
    <div
      className={cn(
        'rounded-2xl border border-border overflow-hidden',
        className,
      )}
    >
      <div
        ref={containerRef}
        className={cn(
          'flex items-center justify-center min-h-[200px]',
          status === 'loading' && 'animate-pulse bg-secondary/30',
        )}
      />

      {status === 'error' && (
        <div className="p-5 text-center">
          <p className="text-sm text-muted-foreground mb-2">Could not load tweet</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            View on Twitter / X
          </a>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Twitter widgets.js loader
// ---------------------------------------------------------------------------

interface TwttrWindow extends Window {
  twttr?: {
    widgets: {
      createTweet: (
        tweetId: string,
        container: HTMLElement,
        options?: Record<string, unknown>,
      ) => Promise<HTMLElement | undefined>;
    };
    _e?: Array<() => void>;
    ready: (fn: () => void) => void;
  };
}

let scriptPromise: Promise<void> | null = null;

function loadTwitterScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;

  const twttr = (window as TwttrWindow).twttr;
  if (twttr?.widgets?.createTweet) {
    scriptPromise = Promise.resolve();
    return scriptPromise;
  }

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://platform.twitter.com/widgets.js';
    script.async = true;
    script.charset = 'utf-8';

    script.onload = () => {
      // Twitter script sets up twttr.ready callback
      const w = window as TwttrWindow;
      if (w.twttr?.ready) {
        w.twttr.ready(() => resolve());
      } else {
        resolve();
      }
    };

    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Failed to load Twitter widgets.js'));
    };

    document.head.appendChild(script);
  });

  return scriptPromise;
}
