import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, ExternalLink } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { NoteContent } from '@/components/NoteContent';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { sanitizeUrl, displayHost } from '@/lib/sanitizeUrl';
import { openUrl } from '@/lib/downloadFile';
import { cn } from '@/lib/utils';

interface WebBookmarkContentProps {
  event: NostrEvent;
  /** When true, render a larger variant for the detail page. */
  expanded?: boolean;
  className?: string;
}

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/**
 * Renders a NIP-B0 web bookmark (kind 39701).
 *
 * - `content` is the bookmarker's own optional comment — freeform prose authored
 *   by the event creator, so it's tokenized through {@link NoteContent} like a
 *   text note.
 * - The bookmarked page renders as a rich link-preview card built entirely from
 *   the event's `title` / `description` / `image` tags (no network fetch). The
 *   canonical URL comes from the `r` tag, falling back to the `d` tag (which
 *   NIP-B0 defines as the URL without its scheme).
 * - `t` tags render as topic chips below the card.
 */
export function WebBookmarkContent({ event, expanded = false, className }: WebBookmarkContentProps) {
  const { url, title, description, image, hashtags, comment } = useMemo(() => {
    // Prefer the `r` tag's full URL; fall back to reconstructing from the
    // scheme-less `d` tag. Both are sanitized to well-formed https before use.
    const rUrl = sanitizeUrl(getTag(event.tags, 'r'));
    const dTag = getTag(event.tags, 'd');
    const dUrl = !rUrl && dTag ? sanitizeUrl(`https://${dTag.replace(/^\/\//, '')}`) : undefined;

    const seen = new Set<string>();
    const tags: string[] = [];
    for (const [n, v] of event.tags) {
      if (n !== 't' || !v || seen.has(v)) continue;
      seen.add(v);
      tags.push(v);
    }

    return {
      url: rUrl ?? dUrl,
      title: getTag(event.tags, 'title')?.trim() || undefined,
      description: getTag(event.tags, 'description')?.trim() || undefined,
      image: sanitizeUrl(getTag(event.tags, 'image')),
      hashtags: tags,
      comment: event.content.trim(),
    };
  }, [event.tags, event.content]);

  const host = url ? displayHost(url) : undefined;

  return (
    <div className={cn(expanded ? 'mt-3 space-y-3' : 'mt-2 space-y-2.5', className)}>
      {/* The bookmarker's own note about the link. */}
      {comment && (
        <div className="whitespace-pre-wrap break-words">
          <NoteContent
            event={event}
            className={cn(expanded ? 'text-[17px] leading-relaxed' : 'text-[15px] leading-relaxed')}
          />
        </div>
      )}

      {/* Rich link-preview card, built from the event's own metadata tags. */}
      <div
        className={cn(
          'group overflow-hidden rounded-xl border border-border',
          url && 'cursor-pointer transition-colors hover:bg-secondary/40',
        )}
        role={url ? 'link' : undefined}
        tabIndex={url ? 0 : undefined}
        onClick={url ? (e) => {
          e.stopPropagation();
          openUrl(url);
        } : undefined}
        onKeyDown={url ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            openUrl(url);
          }
        } : undefined}
      >
        {image && (
          <div className="relative w-full overflow-hidden bg-muted/30" style={{ aspectRatio: '1.91' }}>
            <img
              src={image}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 size-full object-cover"
            />
          </div>
        )}

        <div className="space-y-1 px-3.5 py-3">
          {/* Domain row */}
          {host && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ExternalFavicon url={url} size={14} className="shrink-0" />
              <span className="truncate">{host}</span>
              {url && (
                <span className="ml-auto flex items-center gap-1 text-muted-foreground group-hover:text-primary">
                  <ExternalLink className="size-3" />
                  <span>Open</span>
                </span>
              )}
            </div>
          )}

          {title && (
            <p dir="auto" className="text-sm font-semibold leading-snug line-clamp-2 break-words">
              {title}
            </p>
          )}

          {description && (
            <p
              dir="auto"
              className={cn(
                'text-xs text-muted-foreground leading-relaxed break-words',
                expanded ? 'line-clamp-4' : 'line-clamp-3',
              )}
            >
              {description}
            </p>
          )}

          {/* Fallback label when the page has no title of its own. */}
          {!title && !description && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Bookmark className="size-3.5 shrink-0" />
              <span className="truncate">{url ?? 'Web bookmark'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Topic chips */}
      {hashtags.length > 0 && (
        <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
          {hashtags.slice(0, expanded ? 8 : 5).map((tag) => (
            <Link
              key={tag}
              to={`/t/${encodeURIComponent(tag)}`}
              className="text-[13px] text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
