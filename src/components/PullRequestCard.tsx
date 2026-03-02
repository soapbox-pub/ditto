import { GitPullRequest } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { NostrEvent } from '@nostrify/nostrify';

interface PullRequestCardProps {
  event: NostrEvent;
}

/** Renders a NIP-34 kind 1618 pull request event as a compact card. */
export function PullRequestCard({ event }: PullRequestCardProps) {
  const subject = event.tags.find(([n]) => n === 'subject')?.[1];
  const branchName = event.tags.find(([n]) => n === 'branch-name')?.[1];
  const repoTag = event.tags.find(([n]) => n === 'a')?.[1];
  const repoName = repoTag?.split(':')[2] ?? '';
  const labels = event.tags.filter(([n]) => n === 't').map(([, v]) => v);

  const title = subject || event.content.split('\n')[0]?.trim() || 'Pull Request';

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2">
        <GitPullRequest className="size-4 text-green-500 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm line-clamp-1">{title}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
            {repoName && <span>{repoName}</span>}
            {repoName && branchName && <span>·</span>}
            {branchName && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">{branchName}</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Labels */}
      {labels.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pl-6">
          {labels.slice(0, 6).map((label) => (
            <Badge key={label} variant="secondary" className="text-[10px] px-1.5 py-0">{label}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}
