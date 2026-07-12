import type { NostrEvent } from '@nostrify/nostrify';
import { LayoutGrid } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';
import { parseTileDefinition } from '@/tiles/definition';

interface TilePublishCardProps {
  event: NostrEvent;
}

export function TilePublishCard(_props: TilePublishCardProps) {
  const tile = parseTileDefinition(_props.event);
  if (!tile) return null;

  const href = `/tiles/${nip19.naddrEncode({
    kind: _props.event.kind,
    pubkey: _props.event.pubkey,
    identifier: tile.identifier,
  })}`;

  return (
    <Link
      to={href}
      className="mt-2 flex gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-primary">
        {tile.image ? <img src={tile.image} alt="" className="size-full object-cover" /> : <LayoutGrid className="size-6" />}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="truncate font-semibold">{tile.name}</h2>
          <span className="shrink-0 text-xs text-muted-foreground">v{tile.version}</span>
        </div>
        {tile.summary && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{tile.summary}</p>}
        <span className="mt-2 inline-flex text-xs font-medium text-primary">View tile</span>
      </div>
    </Link>
  );
}
