import { GitBranch, ExternalLink, Globe, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { NostrEvent } from '@nostrify/nostrify';

interface GitRepoCardProps {
  event: NostrEvent;
}

/** Renders a NIP-34 kind 30617 repository announcement as a compact card. */
export function GitRepoCard({ event }: GitRepoCardProps) {
  const name = event.tags.find(([n]) => n === 'name')?.[1];
  const description = event.tags.find(([n]) => n === 'description')?.[1];
  const webUrls = event.tags.filter(([n]) => n === 'web').map(([, v]) => v);
  const cloneUrls = event.tags.filter(([n]) => n === 'clone').map(([, v]) => v);
  const hashtags = event.tags.filter(([n]) => n === 't').map(([, v]) => v).filter((t) => t !== 'personal-fork');
  const isPersonalFork = event.tags.some(([n, v]) => n === 't' && v === 'personal-fork');
  const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';

  const displayName = name || dTag;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-start gap-2">
        <GitBranch className="size-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{displayName}</span>
            {isPersonalFork && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">fork</Badge>
            )}
          </div>
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
          )}
        </div>
      </div>

      {/* Tags */}
      {hashtags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {hashtags.slice(0, 6).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">{tag}</Badge>
          ))}
        </div>
      )}

      {/* Links */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {webUrls[0] && (
          <a
            href={webUrls[0]}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-foreground transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <Globe className="size-3" />
            <span>Web</span>
            <ExternalLink className="size-2.5" />
          </a>
        )}
        {cloneUrls[0] && (
          <button
            className="flex items-center gap-1 hover:text-foreground transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(cloneUrls[0]);
            }}
          >
            <Copy className="size-3" />
            <span className="truncate max-w-[200px]">{cloneUrls[0]}</span>
          </button>
        )}
      </div>
    </div>
  );
}
