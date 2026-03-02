import { FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { NostrEvent } from '@nostrify/nostrify';

interface PatchCardProps {
  event: NostrEvent;
}

/** Renders a NIP-34 kind 1617 patch event as a compact card. */
export function PatchCard({ event }: PatchCardProps) {
  // Subject is typically the first line of the patch content (git format-patch)
  const firstLine = event.content.split('\n')[0]?.trim() ?? '';
  const subject = firstLine.startsWith('Subject:')
    ? firstLine.replace(/^Subject:\s*(\[PATCH[^\]]*\])?\s*/, '')
    : firstLine;

  const isRoot = event.tags.some(([n, v]) => n === 't' && v === 'root');
  const isRevision = event.tags.some(([n, v]) => n === 't' && v === 'root-revision');
  const repoTag = event.tags.find(([n]) => n === 'a')?.[1];
  const repoName = repoTag?.split(':')[2] ?? '';

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2">
        <FileText className="size-4 text-orange-500 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm line-clamp-1">{subject || 'Patch'}</span>
            {isRoot && <Badge variant="outline" className="text-[10px] px-1.5 py-0">root</Badge>}
            {isRevision && <Badge variant="outline" className="text-[10px] px-1.5 py-0">revision</Badge>}
          </div>
          {repoName && (
            <p className="text-xs text-muted-foreground mt-0.5">{repoName}</p>
          )}
        </div>
      </div>
    </div>
  );
}
