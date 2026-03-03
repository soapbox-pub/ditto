import { useState } from 'react';
import { GitBranch, Globe, Copy, ExternalLink, Wand2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { NostrEvent } from '@nostrify/nostrify';

interface GitRepoCardProps {
  event: NostrEvent;
}

/** Derive a favicon URL from a website URL. */
function getFaviconUrl(webUrl: string): string | undefined {
  try {
    const origin = new URL(webUrl).origin;
    return `${origin}/favicon.ico`;
  } catch {
    return undefined;
  }
}

/** Renders a NIP-34 kind 30617 event. Shakespeare apps show as app cards; others as repo cards. */
export function GitRepoCard({ event }: GitRepoCardProps) {
  const name = event.tags.find(([n]) => n === 'name')?.[1];
  const description = event.tags.find(([n]) => n === 'description')?.[1];
  const webUrls = event.tags.filter(([n]) => n === 'web').map(([, v]) => v);
  const cloneUrls = event.tags.filter(([n]) => n === 'clone').map(([, v]) => v);
  const hashtags = event.tags.filter(([n]) => n === 't').map(([, v]) => v).filter((t) => t !== 'personal-fork' && t !== 'shakespeare');
  const isPersonalFork = event.tags.some(([n, v]) => n === 't' && v === 'personal-fork');
  const hasShakespeare = event.tags.some(([n, v]) => n === 't' && v === 'shakespeare');
  const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';

  // Shakespeare + web URL = this is a deployed application, not a repo
  const isApp = hasShakespeare && !!webUrls[0];
  const faviconUrl = isApp ? getFaviconUrl(webUrls[0]) : undefined;

  const displayName = name || dTag;

  const [faviconError, setFaviconError] = useState(false);

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
  };

  const shakespeareUrl = cloneUrls[0]
    ? `https://shakespeare.diy/clone?url=${encodeURIComponent(cloneUrls[0])}`
    : 'https://shakespeare.diy';

  return (
    <div className="space-y-3 mt-1">
      {/* Header: icon/favicon + title */}
      <div className="flex items-start gap-3">
        {isApp && faviconUrl && !faviconError ? (
          <img
            src={faviconUrl}
            alt=""
            className="size-10 rounded-lg object-cover shrink-0"
            loading="lazy"
            onError={() => setFaviconError(true)}
          />
        ) : (
          <GitBranch className="size-5 text-primary shrink-0 mt-0.5" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-base leading-tight">{displayName}</span>
            {isPersonalFork && (
              <Badge variant="outline" className="text-xs px-2 py-0">Fork</Badge>
            )}
          </div>
          {description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{description}</p>
          )}
        </div>
      </div>

      {/* Tags section */}
      {hashtags.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-sm font-medium text-muted-foreground">Tags</h4>
          <div className="flex flex-wrap gap-1.5">
            {hashtags.slice(0, 6).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {hashtags.length > 6 && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                +{hashtags.length - 6} more
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Clone URL section — hidden for apps */}
      {!isApp && cloneUrls[0] && (
        <div className="space-y-1.5">
          <h4 className="text-sm font-medium text-muted-foreground">Clone</h4>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted px-2.5 py-1.5 rounded-md text-xs font-mono truncate">
              {cloneUrls[0]}
            </code>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 shrink-0"
              onClick={(e) => { e.stopPropagation(); handleCopy(cloneUrls[0]); }}
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 pt-1">
        {hasShakespeare && (
          <button
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            onClick={(e) => { e.stopPropagation(); window.open(shakespeareUrl, '_blank', 'noopener,noreferrer'); }}
          >
            <Wand2 className="size-4" />
            Edit with Shakespeare
          </button>
        )}
        {isApp ? (
          <button
            className="flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-medium hover:bg-secondary/60 transition-colors"
            onClick={(e) => { e.stopPropagation(); window.open(webUrls[0], '_blank', 'noopener,noreferrer'); }}
          >
            <ExternalLink className="size-4" />
            Open App
          </button>
        ) : webUrls[0] ? (
          <button
            className="flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-medium hover:bg-secondary/60 transition-colors"
            onClick={(e) => { e.stopPropagation(); window.open(webUrls[0], '_blank', 'noopener,noreferrer'); }}
          >
            <Globe className="size-4" />
            Browse Repository
          </button>
        ) : !hasShakespeare && cloneUrls[0] ? (
          <button
            className="flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-medium hover:bg-secondary/60 transition-colors"
            onClick={(e) => { e.stopPropagation(); handleCopy(cloneUrls[0]); }}
          >
            <Copy className="size-4" />
            Copy Clone URL
          </button>
        ) : null}
      </div>
    </div>
  );
}
