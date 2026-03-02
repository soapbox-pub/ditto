import { Rocket, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { NostrEvent } from '@nostrify/nostrify';

interface AppSubmissionCardProps {
  event: NostrEvent;
}

/** Renders a Shakespeare kind 31733 app submission as a compact card. */
export function AppSubmissionCard({ event }: AppSubmissionCardProps) {
  const title = event.tags.find(([n]) => n === 'title')?.[1]
    ?? event.tags.find(([n]) => n === 'name')?.[1];
  const website = event.tags.find(([n]) => n === 'website')?.[1]
    ?? event.tags.find(([n]) => n === 'r')?.[1];
  const icon = event.tags.find(([n]) => n === 'icon')?.[1]
    ?? event.tags.find(([n]) => n === 'image')?.[1];
  const hashtags = event.tags.filter(([n]) => n === 't').map(([, v]) => v)
    .filter((t) => t !== 'soapbox-app-submission');
  const description = event.content.trim().slice(0, 200);

  const displayTitle = title || 'App Submission';

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-start gap-3">
        {icon ? (
          <img
            src={icon}
            alt=""
            className="size-10 rounded-lg object-cover shrink-0"
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Rocket className="size-5 text-primary" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{displayTitle}</span>
          </div>
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{description}{event.content.length > 200 ? '…' : ''}</p>
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

      {/* Website link */}
      {website && (
        <a
          href={website}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="size-3" />
          <span className="truncate max-w-[240px]">{new URL(website).hostname}</span>
        </a>
      )}
    </div>
  );
}
