import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

interface BlueskyEmbedProps {
  /** Handle or DID of the post author. */
  author: string;
  /** Record key (rkey) of the post. */
  rkey: string;
  className?: string;
}

/**
 * Renders a Bluesky post embed using a direct iframe to `embed.bsky.app`.
 *
 * If the author is a handle (not a DID), resolves it first via the public
 * Bluesky API. Listens for resize postMessage events from the embed to
 * auto-size the iframe.
 */
export function BlueskyEmbed({ author, rkey, className }: BlueskyEmbedProps) {
  const { theme } = useTheme();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const embedId = useRef(String(Math.random()).slice(2));

  // If the author is already a DID, use it directly. Otherwise resolve the handle.
  const isDid = author.startsWith('did:');
  const { data: did, isLoading } = useQuery({
    queryKey: ['bsky-resolve-handle', author],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(author)}`,
        { signal },
      );
      if (!res.ok) return null;
      const data = await res.json() as { did?: string };
      return data.did ?? null;
    },
    enabled: !isDid,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24,
    retry: false,
  });

  const resolvedDid = isDid ? author : did;

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.origin !== 'https://embed.bsky.app') return;
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;

      const data = e.data;
      if (typeof data !== 'object' || !data) return;

      if (data.id === embedId.current && typeof data.height === 'number' && data.height > 0) {
        iframeRef.current.style.height = `${data.height}px`;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (!isDid && isLoading) {
    return (
      <div className={cn('overflow-hidden rounded-2xl border border-border animate-pulse bg-secondary/30', className)} style={{ minHeight: 200 }} />
    );
  }

  if (!resolvedDid) {
    return null;
  }

  const params = new URLSearchParams({
    id: embedId.current,
    colorMode: theme === 'dark' ? 'dark' : 'light',
  });

  const embedUrl = `https://embed.bsky.app/embed/${resolvedDid}/app.bsky.feed.post/${rkey}?${params}`;

  return (
    <div className={cn('overflow-hidden', className)}>
      <iframe
        ref={iframeRef}
        src={embedUrl}
        title="Bluesky post"
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
