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
 */
export function TweetEmbed({ tweetId, className }: TweetEmbedProps) {
  const { theme } = useTheme();

  const params = new URLSearchParams({
    id: tweetId,
    dnt: 'true',
    theme: theme === 'dark' ? 'dark' : 'light',
  });

  return (
    <div className={cn('rounded-2xl border border-border overflow-hidden', className)}>
      <iframe
        src={`https://platform.twitter.com/embed/Tweet.html?${params}`}
        title="Tweet"
        className="w-full border-0"
        style={{ minHeight: 250 }}
        allowFullScreen
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups"
        onLoad={(e) => {
          // Auto-resize iframe to fit tweet content
          const iframe = e.currentTarget;
          const tryResize = () => {
            try {
              const height = iframe.contentDocument?.documentElement?.scrollHeight;
              if (height && height > 100) {
                iframe.style.height = `${height}px`;
              }
            } catch {
              // Cross-origin — can't access contentDocument, keep minHeight
            }
          };
          tryResize();
          // Retry after a delay since tweets render async inside the iframe
          setTimeout(tryResize, 1500);
          setTimeout(tryResize, 3000);
        }}
      />
    </div>
  );
}
