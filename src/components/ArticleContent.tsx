import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import type { NostrEvent } from '@nostrify/nostrify';

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

  if (preview) {
    return (
      <div className={className}>
        {title && (
          <h3 className="text-base font-bold leading-snug">{title}</h3>
        )}
        {image && (
          <img
            src={image}
            alt={title ?? 'Article image'}
            className="w-full rounded-lg object-cover max-h-64 mt-2"
          />
        )}
        {summary ? (
          <p className="text-[15px] leading-relaxed line-clamp-3 mt-2">{summary}</p>
        ) : (
          <p className="text-[15px] leading-relaxed line-clamp-3 mt-2">
            {event.content.slice(0, 280)}{event.content.length > 280 ? '...' : ''}
          </p>
        )}
        <span className="inline-block text-xs font-medium text-primary mt-2">Read article</span>
      </div>
    );
  }

  return (
    <div className={className}>
      {title && (
        <h1 className="text-2xl font-bold leading-tight mb-4">{title}</h1>
      )}
      {image && (
        <img
          src={image}
          alt={title ?? 'Article image'}
          className="w-full rounded-xl object-cover max-h-96 mb-6"
        />
      )}
      <div className="prose prose-sm max-w-none break-words text-foreground prose-headings:text-foreground prose-headings:font-bold prose-strong:text-foreground prose-a:text-primary prose-img:rounded-lg prose-pre:overflow-x-auto prose-pre:rounded-lg prose-pre:bg-muted prose-pre:text-foreground prose-code:text-[13px] prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none prose-code:bg-muted prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:font-normal prose-li:marker:text-muted-foreground prose-blockquote:text-muted-foreground prose-blockquote:border-border prose-hr:border-border prose-th:text-foreground">
        <Markdown rehypePlugins={[rehypeSanitize]}>
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
