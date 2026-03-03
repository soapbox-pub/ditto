import { FileText, GitCommit, User, Wand2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { NostrEvent } from '@nostrify/nostrify';

interface PatchCardProps {
  event: NostrEvent;
  /** If true, show a compact preview. If false, show the full patch content. Defaults to true. */
  preview?: boolean;
}

/** Parse the git format-patch content into structured parts. */
function parsePatchContent(content: string) {
  const lines = content.split('\n');
  let subject = '';
  let commitMessage = '';
  let diff = '';

  // Extract subject from first line or Subject: header
  const firstLine = lines[0]?.trim() ?? '';
  if (firstLine.startsWith('Subject:')) {
    subject = firstLine.replace(/^Subject:\s*(\[PATCH[^\]]*\])?\s*/, '');
  } else {
    subject = firstLine;
  }

  // Find the diff start (lines starting with "---" followed by diff content, or "diff --git")
  let diffStartIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('diff --git ')) {
      diffStartIdx = i;
      break;
    }
  }

  if (diffStartIdx > 0) {
    // Everything between subject and diff is the commit message
    // Skip blank lines and email-style headers
    const messageLines: string[] = [];
    for (let i = 1; i < diffStartIdx; i++) {
      const line = lines[i];
      // Skip email-style headers (From:, Date:, Subject:, etc.)
      if (/^[A-Z][a-z-]+:/.test(line) && messageLines.length === 0) continue;
      // Skip the "---" separator before diff stats
      if (line === '---') continue;
      // Skip diff stat lines (e.g. " file.ts | 5 ++---")
      if (/^\s+\S+.*\|.*\d+/.test(line)) continue;
      // Skip the summary line (e.g. "2 files changed, 10 insertions(+)")
      if (/^\s*\d+ files? changed/.test(line)) continue;
      messageLines.push(line);
    }
    commitMessage = messageLines.join('\n').trim();
    diff = lines.slice(diffStartIdx).join('\n');
  } else {
    // No diff found — treat everything after the first line as the message
    commitMessage = lines.slice(1).join('\n').trim();
  }

  return { subject, commitMessage, diff };
}

/** Renders a NIP-34 kind 1617 patch event card. */
export function PatchCard({ event, preview = true }: PatchCardProps) {
  const { subject, commitMessage, diff } = parsePatchContent(event.content);

  const isRoot = event.tags.some(([n, v]) => n === 't' && v === 'root');
  const isRevision = event.tags.some(([n, v]) => n === 't' && v === 'root-revision');
  const hasShakespeare = event.tags.some(([n, v]) => n === 't' && v === 'shakespeare');
  const repoTag = event.tags.find(([n]) => n === 'a')?.[1];
  const repoName = repoTag?.split(':')[2] ?? '';
  const commitId = event.tags.find(([n]) => n === 'commit')?.[1];
  const parentCommit = event.tags.find(([n]) => n === 'parent-commit')?.[1];
  const committerTag = event.tags.find(([n]) => n === 'committer');
  const hashtags = event.tags
    .filter(([n]) => n === 't')
    .map(([, v]) => v)
    .filter((t) => t !== 'root' && t !== 'root-revision' && t !== 'shakespeare');

  return (
    <div className="space-y-3 mt-1">
      {/* Title + status badges */}
      <div className="flex items-start gap-2">
        <FileText className="size-5 text-orange-500 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-base leading-tight line-clamp-2">{subject || 'Patch'}</span>
            {isRoot && (
              <Badge variant="outline" className="text-xs px-2 py-0 border-orange-500/30 text-orange-500">root</Badge>
            )}
            {isRevision && (
              <Badge variant="outline" className="text-xs px-2 py-0 border-orange-500/30 text-orange-500">revision</Badge>
            )}
          </div>
          {repoName && (
            <p className="text-sm text-muted-foreground mt-1">{repoName}</p>
          )}
        </div>
      </div>

      {/* Commit metadata — detail view only */}
      {!preview && (commitId || parentCommit || committerTag) && (
        <div className="space-y-2">
          {commitId && (
            <div className="flex items-center gap-2 text-sm">
              <GitCommit className="size-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Commit</span>
              <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono">{commitId.slice(0, 12)}</code>
            </div>
          )}
          {parentCommit && (
            <div className="flex items-center gap-2 text-sm">
              <GitCommit className="size-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Parent</span>
              <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono">{parentCommit.slice(0, 12)}</code>
            </div>
          )}
          {committerTag && (
            <div className="flex items-center gap-2 text-sm">
              <User className="size-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Committer</span>
              <span>{committerTag[1]}</span>
              {committerTag[2] && <span className="text-muted-foreground">&lt;{committerTag[2]}&gt;</span>}
            </div>
          )}
        </div>
      )}

      {/* Commit message — detail view only */}
      {!preview && commitMessage && (
        <div className="space-y-1.5">
          <h4 className="text-sm font-medium text-muted-foreground">Message</h4>
          <div className="bg-muted/50 rounded-lg px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words">
            {commitMessage}
          </div>
        </div>
      )}

      {/* Diff — detail view only */}
      {!preview && diff && (
        <div className="space-y-1.5">
          <h4 className="text-sm font-medium text-muted-foreground">Diff</h4>
          <div className="bg-muted/50 rounded-lg overflow-x-auto">
            <pre className="px-4 py-3 text-xs font-mono leading-relaxed overflow-x-auto">
              {diff.split('\n').map((line, i) => {
                let lineClass = 'text-foreground';
                if (line.startsWith('+') && !line.startsWith('+++')) lineClass = 'text-green-600 dark:text-green-400';
                else if (line.startsWith('-') && !line.startsWith('---')) lineClass = 'text-red-600 dark:text-red-400';
                else if (line.startsWith('@@')) lineClass = 'text-blue-600 dark:text-blue-400';
                else if (line.startsWith('diff --git')) lineClass = 'text-muted-foreground font-semibold';
                return <div key={i} className={lineClass}>{line}</div>;
              })}
            </pre>
          </div>
        </div>
      )}

      {/* Tags section */}
      {hashtags.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-sm font-medium text-muted-foreground">Tags</h4>
          <div className="flex flex-wrap gap-1.5">
            {hashtags.slice(0, preview ? 6 : hashtags.length).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {preview && hashtags.length > 6 && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                +{hashtags.length - 6} more
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {hasShakespeare && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            onClick={(e) => { e.stopPropagation(); window.open('https://shakespeare.diy', '_blank', 'noopener,noreferrer'); }}
          >
            <Wand2 className="size-4" />
            Edit with Shakespeare
          </button>
        </div>
      )}
    </div>
  );
}
