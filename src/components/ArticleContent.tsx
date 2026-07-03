import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { retextSmartypants } from './articleSmartypants';
import type { NostrEvent } from '@nostrify/nostrify';
import { Clock } from 'lucide-react';

import { buildMarkdownComponents } from '@/components/markdownComponents';
import { formatReadingTime } from '@/lib/articleHelpers';
import { highlightSourceAttrs } from '@/lib/highlightSource';

/** Gets a tag value by name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

interface ArticleContentProps {
  event: NostrEvent;
  /** If true, show a truncated preview instead of the full article. */
  preview?: boolean;
  className?: string;
}

/** Renders kind 30023 long-form article content with Markdown. */
export function ArticleContent({ event, preview, className }: ArticleContentProps) {
  const title = getTag(event.tags, 'title');
  const summary = getTag(event.tags, 'summary');
  const image = getTag(event.tags, 'image');
  const hashtags = event.tags.filter(([n]) => n === 't').map(([, v]) => v);
  const readingTime = formatReadingTime(event.content);

  if (preview) {
    return (
      <div className={className}>
        {title && (
          <h3 dir="auto" className="text-base font-bold leading-snug">{title}</h3>
        )}
        {image && (
          <img
            src={image}
            alt={title ?? 'Article image'}
            className="w-full rounded-lg object-cover max-h-64 mt-2"
          />
        )}
        {summary ? (
          <p dir="auto" className="text-[15px] leading-relaxed line-clamp-3 mt-2">{summary}</p>
        ) : (
          <p dir="auto" className="text-[15px] leading-relaxed line-clamp-3 mt-2">
            {event.content.slice(0, 280)}{event.content.length > 280 ? '...' : ''}
          </p>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span className="inline-block text-xs font-medium text-primary">Read article</span>
          {readingTime && (
            <>
              <span className="text-xs text-muted-foreground" aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3 shrink-0" aria-hidden="true" />
                {readingTime}
              </span>
            </>
          )}
        </div>
      </div>
    );
  }

  const components = buildMarkdownComponents(event);

  return (
    <div className={className}>
      {title && (
        <h1 dir="auto" className="text-2xl font-bold leading-tight mb-4">{title}</h1>
      )}
      {readingTime && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground -mt-2 mb-4">
          <Clock className="size-3.5 shrink-0" aria-hidden="true" />
          {readingTime}
        </p>
      )}
      {image && (
        <img
          src={image}
          alt={title ?? 'Article image'}
          className="w-full rounded-xl object-cover max-h-96 mb-6"
        />
      )}
      <div dir="auto" {...highlightSourceAttrs(event)} className="prose prose-sm max-w-none break-words text-foreground prose-headings:text-foreground prose-headings:font-bold prose-strong:text-foreground prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-img:rounded-lg prose-pre:overflow-x-auto prose-pre:rounded-lg prose-pre:bg-muted prose-pre:text-foreground prose-code:text-[13px] prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none prose-code:bg-muted prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:font-normal prose-li:marker:text-muted-foreground prose-blockquote:text-muted-foreground prose-blockquote:border-border prose-hr:border-border prose-th:text-foreground">
        <Markdown remarkPlugins={[retextSmartypants]} rehypePlugins={[rehypeSanitize]} components={components}>
          {event.content}
        </Markdown>
      </div>
      {hashtags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-border">
          {hashtags.map((tag) => (
            <a
              key={tag}
              href={`/t/${encodeURIComponent(tag)}`}
              className="text-sm text-primary hover:underline"
            >
              #{tag}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
