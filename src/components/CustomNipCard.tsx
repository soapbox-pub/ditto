import { FileCode } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { NostrEvent } from '@nostrify/nostrify';

interface CustomNipCardProps {
  event: NostrEvent;
}

/** Renders a NostrHub kind 30817 custom NIP proposal as a compact card. */
export function CustomNipCard({ event }: CustomNipCardProps) {
  const title = event.tags.find(([n]) => n === 'title')?.[1];
  const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
  const relatedKinds = event.tags.filter(([n]) => n === 'k').map(([, v]) => v);

  // Extract first ~200 chars of content as preview, stripping markdown headings
  const contentPreview = event.content
    .replace(/^#{1,6}\s+.*/gm, '') // strip headings
    .replace(/\n{2,}/g, '\n')      // collapse blank lines
    .trim()
    .slice(0, 200);

  const displayTitle = title || `NIP: ${dTag}`;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-start gap-2">
        <FileCode className="size-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <span className="font-semibold text-sm">{displayTitle}</span>
          {contentPreview && (
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-3">{contentPreview}{event.content.length > 200 ? '…' : ''}</p>
          )}
        </div>
      </div>

      {/* Related kinds */}
      {relatedKinds.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {relatedKinds.slice(0, 8).map((k) => (
            <Badge key={k} variant="secondary" className="text-[10px] px-1.5 py-0">kind:{k}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}
