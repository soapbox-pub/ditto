import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

import { CHANGELOG_SANITIZE_SCHEMA } from '@/lib/changelogMarkdown';
import { cn } from '@/lib/utils';

/** A release's Markdown notes, flattened to body-size text and clamped to a few lines. */
export function ReleaseNotesPreview({ notes, className }: { notes: string; className?: string }) {
  return (
    <div
      className={cn(
        `prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed text-muted-foreground line-clamp-4
        [&_h1]:text-sm [&_h1]:font-semibold
        [&_h2]:text-sm [&_h2]:font-semibold
        [&_h3]:text-sm [&_h3]:font-semibold
        [&_ul]:pl-4 [&_ul]:list-disc
        [&_ol]:pl-4 [&_ol]:list-decimal
        prose-code:before:content-none prose-code:after:content-none [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono
        [&_p]:my-0 [&_li]:my-0 [&_h1]:my-0 [&_h2]:my-0 [&_h3]:my-0`,
        className,
      )}
    >
      <Markdown rehypePlugins={[[rehypeSanitize, CHANGELOG_SANITIZE_SCHEMA]]}>
        {notes}
      </Markdown>
    </div>
  );
}
