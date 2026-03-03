import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { FileCode, Wand2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { NostrEvent } from '@nostrify/nostrify';

interface CustomNipCardProps {
  event: NostrEvent;
  /** If true, show a truncated preview instead of the full NIP content. Defaults to true. */
  preview?: boolean;
}

/** Extracts the first meaningful paragraph from markdown content. */
function extractFirstParagraph(content: string, maxLength: number = 200): string {
  if (!content) return '';

  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Skip markdown headers, rules, code fences, lists, blockquotes
    if (line.startsWith('#')) continue;
    if (line.match(/^[-*_]{3,}$/)) continue;
    if (line.startsWith('```')) continue;
    if (line.match(/^[-*+]\s/)) continue;
    if (line.match(/^\d+\.\s/)) continue;
    if (line.startsWith('>')) continue;

    if (line.length > 10) {
      const cleaned = line
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .trim();

      if (cleaned.length > maxLength) {
        const truncated = cleaned.slice(0, maxLength);
        const lastSpace = truncated.lastIndexOf(' ');
        return (lastSpace > maxLength * 0.7 ? truncated.slice(0, lastSpace) : truncated) + '...';
      }
      return cleaned;
    }
  }

  const fallback = content.replace(/\n/g, ' ').trim();
  return fallback.length > maxLength ? fallback.slice(0, maxLength).trim() + '...' : fallback;
}

/** Renders a NostrHub kind 30817 custom NIP proposal card (NostrHub-style). */
export function CustomNipCard({ event, preview = true }: CustomNipCardProps) {
  const title = event.tags.find(([n]) => n === 'title')?.[1];
  const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
  const relatedKinds = event.tags.filter(([n]) => n === 'k').map(([, v]) => v);
  const hasShakespeare = event.tags.some(([n, v]) => n === 't' && v === 'shakespeare');
  const contentPreview = preview ? extractFirstParagraph(event.content, 200) : '';

  const displayTitle = title || `NIP: ${dTag}`;

  return (
    <div className="space-y-3 mt-1">
      {/* Title */}
      <div className="flex items-start gap-2">
        <FileCode className="size-5 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <span className="font-semibold text-base leading-tight">{displayTitle}</span>
          {preview && contentPreview && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-3 leading-relaxed">{contentPreview}</p>
          )}
        </div>
      </div>

      {/* Full markdown content — detail view only */}
      {!preview && event.content && (
        <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-bold prose-a:text-primary prose-img:rounded-lg">
          <Markdown rehypePlugins={[rehypeSanitize]}>
            {event.content}
          </Markdown>
        </div>
      )}

      {/* Related Kinds section */}
      {relatedKinds.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-sm font-medium text-muted-foreground">Kinds</h4>
          <div className="flex flex-wrap gap-1.5">
            {relatedKinds.slice(0, preview ? 6 : relatedKinds.length).map((k) => (
              <Badge key={k} variant="secondary" className="text-xs">
                Kind {k}
              </Badge>
            ))}
            {preview && relatedKinds.length > 6 && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                +{relatedKinds.length - 6} more
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
