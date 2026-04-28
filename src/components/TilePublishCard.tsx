import type { NostrEvent } from '@nostrify/nostrify';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { parseTileDefEvent } from '@soapbox.pub/nostr-canvas';
import { LayoutGrid } from 'lucide-react';

import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { tileEventToNaddr } from '@/lib/nostr-canvas/identifiers';

interface TilePublishCardProps {
  event: NostrEvent;
}

/**
 * Feed card for kind 30207 tile-definition events.
 * Shows the tile image, name, version, and a short description,
 * with a link to the tile's detail page in the marketplace.
 */
export function TilePublishCard({ event }: TilePublishCardProps) {
  const parsed = useMemo(() => {
    try {
      return parseTileDefEvent({
        id: event.id,
        pubkey: event.pubkey,
        created_at: event.created_at,
        kind: event.kind,
        content: event.content,
        tags: event.tags,
      });
    } catch {
      return null;
    }
  }, [event]);

  if (!parsed) return null;

  const naddr = tileEventToNaddr(event);
  const href = `/tiles/${encodeURIComponent(naddr)}`;
  const image = sanitizeUrl(parsed.image);

  return (
    <Link
      to={href}
      className="mt-2 flex gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-accent"
    >
      {/* Thumbnail */}
      <div className="shrink-0 size-16 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
        {image ? (
          <img
            src={image}
            alt=""
            className="size-full object-cover"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <LayoutGrid className="size-7 text-muted-foreground/40" />
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="font-semibold leading-tight truncate">{parsed.name}</span>
          <span className="text-xs text-muted-foreground shrink-0">v{parsed.version}</span>
        </div>
        {parsed.summary && (
          <p className="text-sm text-muted-foreground line-clamp-2">{parsed.summary}</p>
        )}
        <p className="text-xs text-primary mt-0.5">View in Marketplace →</p>
      </div>
    </Link>
  );
}
