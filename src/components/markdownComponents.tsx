import { Children, createElement, type ReactNode } from 'react';
import type { Components } from 'react-markdown';
import type { NostrEvent } from '@nostrify/nostrify';

import { ImetaImage } from '@/components/ImetaImage';
import { MarkdownLink } from '@/components/MarkdownLink';
import { NoteContent } from '@/components/NoteContent';
import { VideoFileCard } from '@/components/VideoFileCard';
import { VideoPlayer } from '@/components/VideoPlayer';
import { parseImetaMap, type ImetaEntry } from '@/lib/imeta';
import { isVideoUrl } from '@/lib/mediaTypeDetection';
import { isUnplayableVideo } from '@/lib/mediaUrls';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

/** Options controlling how text leaves are enriched inside a particular markdown tag. */
interface EnrichOptions {
  /** When true, `nostr:nevent/note/naddr` URIs render as inline links (not block-level quote cards),
   *  and media embeds (images/video/audio) are suppressed. Used for headings and other tight contexts. */
  inlineOnly?: boolean;
}

/**
 * Recursively walk markdown children, replacing each string leaf with a
 * `<NoteContent as="span">` instance so Nostr URIs, URLs, hashtags, and
 * custom emoji render with identical behavior to regular note content
 * (mentions, quoted-note cards, link-preview cards, images, custom emoji).
 *
 * The synthetic event clones the article's own tags so NIP-30 emoji,
 * imeta metadata, and q-tag relay hints resolve correctly for each run.
 */
function enrichChildren(
  children: ReactNode,
  event: NostrEvent,
  opts: EnrichOptions = {},
): ReactNode {
  return Children.map(children, (child, i) => {
    if (typeof child === 'string') {
      // Whitespace-only leaves are insignificant inter-element whitespace from
      // the markdown tree (e.g. the "\n" nodes around a paragraph inside a loose
      // list item). Pass them through as plain text: wrapping them in NoteContent
      // would render the newline literally (its wrapper is whitespace-pre-wrap)
      // and the extra <span> element would defeat first:/last: margin resets.
      if (!child.trim()) return child;
      const synthetic: NostrEvent = { ...event, content: child };
      return (
        <NoteContent
          key={i}
          event={synthetic}
          as="span"
          preserveEdgeWhitespace
          disableNoteEmbeds={opts.inlineOnly}
          disableMediaEmbeds={opts.inlineOnly}
        />
      );
    }
    return child;
  });
}

/**
 * Render a markdown image (`![alt](url)`). The URL may point at a video —
 * long-form writers embed clips with image syntax since markdown has nothing
 * else — so it renders as a player when its imeta or extension says so.
 */
function MarkdownMedia({ src, alt, imeta, rest }: {
  src: string;
  alt?: string;
  imeta?: ImetaEntry;
  rest: Record<string, unknown>;
}) {
  const mime = imeta?.mime?.toLowerCase();
  const isVideo = mime ? mime.startsWith('video/') : isVideoUrl(src);

  if (isVideo) {
    if (isUnplayableVideo(src, mime)) {
      const size = imeta?.size ? Number(imeta.size) : undefined;
      return (
        <div className="not-prose my-4">
          <VideoFileCard url={src} mime={mime} size={size && Number.isFinite(size) ? size : undefined} />
        </div>
      );
    }
    return (
      <div className="not-prose my-4 overflow-hidden rounded-lg">
        <VideoPlayer
          src={src}
          poster={imeta?.thumbnail}
          dim={imeta?.dim}
          blurhash={imeta?.blurhash}
          title={alt || imeta?.alt}
        />
      </div>
    );
  }

  return <ImetaImage {...rest} src={src} alt={alt || imeta?.alt || ''} imeta={imeta} />;
}

/**
 * Build react-markdown component overrides that enrich text leaves with
 * `NoteContent` (Nostr URI embeds, mentions, hashtags, links, custom emoji)
 * and sanitize link/image URLs. Shared by article rendering and other
 * markdown-content kinds (NIP-34 issues, PRs, status comments).
 */
export function buildMarkdownComponents(event: NostrEvent): Components {
  const imetaMap = parseImetaMap(event.tags);

  // Wrap a text-bearing block/inline element so its string leaves are enriched.
  // Uses `createElement` to sidestep TS widening issues when spreading
  // unknown rehype-passed props onto a generic intrinsic tag.
  function wrap(Tag: keyof React.JSX.IntrinsicElements, opts: EnrichOptions = {}) {
    return function Wrapped(
      props: { children?: ReactNode } & Record<string, unknown>,
    ) {
      const { children, node: _node, ...rest } = props;
      return createElement(Tag, rest, enrichChildren(children, event, opts));
    };
  }

  return {
    // Paragraphs render as `<div>` so block-level embeds (quoted notes,
    // images, link-preview cards) inside them produce valid HTML.
    // Reproduce prose-sm paragraph spacing with utility classes.
    p: ({ children, node: _node, ...rest }: { children?: ReactNode } & Record<string, unknown>) =>
      createElement(
        'div',
        {
          ...rest,
          className: cn('my-[1em] first:mt-0 last:mb-0', rest.className as string | undefined),
        },
        enrichChildren(children, event),
      ),
    li: wrap('li'),
    // Headings: keep inline linkification (mentions, hashtags, URL links)
    // but suppress block embeds so a heading can't contain a giant quote card.
    h1: wrap('h1', { inlineOnly: true }),
    h2: wrap('h2', { inlineOnly: true }),
    h3: wrap('h3', { inlineOnly: true }),
    h4: wrap('h4', { inlineOnly: true }),
    h5: wrap('h5', { inlineOnly: true }),
    h6: wrap('h6', { inlineOnly: true }),
    strong: wrap('strong'),
    em: wrap('em'),
    blockquote: wrap('blockquote'),
    td: wrap('td'),
    th: wrap('th'),
    a: MarkdownLink,
    img: ({ src, alt, node: _node, ...rest }) => {
      const safe = typeof src === 'string' ? sanitizeUrl(src) : undefined;
      if (!safe) return null;
      // imeta URLs are matched as written; markdown parsing may have normalised ours.
      const imeta = imetaMap.get(src as string) ?? imetaMap.get(safe);
      return <MarkdownMedia src={safe} alt={alt} imeta={imeta} rest={rest} />;
    },
  } as Components;
}
