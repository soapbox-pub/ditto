import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Highlighter, ExternalLink, Quote } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { EmbeddedNote } from '@/components/EmbeddedNote';
import { EmbeddedNaddr } from '@/components/EmbeddedNaddr';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

interface HighlightContentProps {
  event: NostrEvent;
  /** When true, render a larger variant for the detail page. */
  expanded?: boolean;
  className?: string;
  /** When true, skip the embedded source event preview (used inside embeds to avoid nesting). */
  disableSourceEmbed?: boolean;
}

/** Parse an `a` tag value in the `kind:pubkey:identifier` form. */
function parseAddr(value: string): { kind: number; pubkey: string; identifier: string } | undefined {
  const [kindStr, pubkey, ...rest] = value.split(':');
  const kind = Number(kindStr);
  if (!Number.isFinite(kind) || !pubkey || pubkey.length !== 64) return undefined;
  return { kind, pubkey, identifier: rest.join(':') };
}

/** Extract the hostname (without leading `www.`) from a URL, or `undefined` on failure. */
function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

/**
 * Renders a NIP-84 Highlight event (kind 9802).
 *
 * - `content` is the highlighted excerpt — displayed as a blockquote-style pull
 *   quote with an accent border and the Highlighter icon.
 * - A `context` tag (if present and longer than `content`) wraps the highlight
 *   in its surrounding paragraph with the highlighted portion emphasized.
 * - The source is shown as either an embedded Nostr event card (`a` tag for
 *   addressable events like wiki/articles, `e` tag for regular events) or, for
 *   non-Nostr sources, a clickable URL chip (`r` tag).
 */
export function HighlightContent({ event, expanded = false, className, disableSourceEmbed = false }: HighlightContentProps) {
  const { highlight, context, source } = useMemo(() => {
    const rawHighlight = event.content.trim();

    // NIP-84 `context` tag: surrounding prose that contains the highlight.
    const contextTag = event.tags.find(([n]) => n === 'context')?.[1]?.trim();
    const contextText = contextTag && contextTag.length > rawHighlight.length ? contextTag : undefined;

    // Source precedence: `a` (addressable event) > `e` (regular event) > `r` (URL).
    // Skip tags marked `mention` (NIP-84 quote-highlight attribution).
    //
    // For `r` tags the spec uses a `source`/`mention` marker to distinguish the
    // cited source from URLs that appear in a companion `comment`. If no marker
    // is present, fall back to the first `r`.
    const aTag = event.tags.find(([n, , , marker]) => n === 'a' && marker !== 'mention')?.[1];
    const eTag = event.tags.find(([n, , , marker]) => n === 'e' && marker !== 'mention');
    const rSourceTag = event.tags.find(([n, , , marker]) => n === 'r' && marker === 'source')?.[1]
      ?? event.tags.find(([n, , , marker]) => n === 'r' && marker !== 'mention')?.[1];

    let src:
      | { kind: 'addr'; addr: { kind: number; pubkey: string; identifier: string }; relays?: string[] }
      | { kind: 'event'; id: string; relays?: string[]; authorHint?: string }
      | { kind: 'url'; url: string }
      | undefined;

    if (aTag) {
      const addr = parseAddr(aTag);
      if (addr) {
        const relayHint = event.tags.find(([n, v]) => n === 'a' && v === aTag)?.[2];
        src = { kind: 'addr', addr, relays: relayHint ? [relayHint] : undefined };
      }
    }
    if (!src && eTag?.[1]) {
      const [, id, relayHint, , authorHint] = eTag;
      src = {
        kind: 'event',
        id,
        relays: relayHint ? [relayHint] : undefined,
        authorHint: authorHint && authorHint.length === 64 ? authorHint : undefined,
      };
    }
    if (!src && rSourceTag) {
      const sanitized = sanitizeUrl(rSourceTag);
      if (sanitized) src = { kind: 'url', url: sanitized };
    }

    return { highlight: rawHighlight, context: contextText, source: src };
  }, [event.tags, event.content]);

  // The blockquote: highlight text with a prominent left accent border.
  // When `context` is present, render the context with the highlighted portion
  // wrapped in a `<mark>` so the reader sees the selection in situ.
  const quoteBlock = context
    ? <ContextualHighlight context={context} highlight={highlight} expanded={expanded} />
    : <Blockquote text={highlight} expanded={expanded} />;

  return (
    <div className={cn(expanded ? 'mt-3 space-y-3' : 'mt-2 space-y-2.5', className)}>
      {quoteBlock}

      {/* Source attribution */}
      {source && !disableSourceEmbed && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Quote className="size-3" />
            Highlighted from
          </div>
          {source.kind === 'addr' ? (
            <EmbeddedNaddr addr={source.addr} className="my-0" />
          ) : source.kind === 'event' ? (
            <EmbeddedNote
              eventId={source.id}
              relays={source.relays}
              authorHint={source.authorHint}
              className="my-0"
            />
          ) : (
            <SourceUrlChip url={source.url} />
          )}
        </div>
      )}

      {/* Compact source link when embeds are disabled (e.g. inside another embed) */}
      {source && disableSourceEmbed && (
        <SourceChipCompact source={source} />
      )}
    </div>
  );
}

/** Pull-quote style highlighted text. */
function Blockquote({ text, expanded }: { text: string; expanded: boolean }) {
  if (!text) {
    // Per NIP-84, content may be empty for highlights of non-text media.
    return (
      <div
        className={cn(
          'rounded-xl border border-dashed border-border px-4 py-3 text-center text-sm text-muted-foreground',
        )}
      >
        Highlighted media
      </div>
    );
  }
  return (
    <blockquote
      className={cn(
        'relative rounded-r-xl border-l-4 border-primary/70 bg-primary/5 pl-4 pr-4 py-3',
      )}
    >
      <Highlighter
        className={cn(
          'absolute right-3 top-3 text-primary/60',
          expanded ? 'size-4' : 'size-3.5',
        )}
        aria-hidden
      />
      <p
        className={cn(
          'whitespace-pre-wrap break-words font-serif text-foreground',
          expanded ? 'text-[17px] leading-relaxed' : 'text-[15px] leading-relaxed',
          'pr-6',
        )}
      >
        {text}
      </p>
    </blockquote>
  );
}

/**
 * Render the `context` paragraph with the highlighted portion emphasized.
 *
 * If the highlight can be located verbatim inside the context, the matching
 * span is wrapped in `<mark>`. Otherwise the context is shown as-is followed
 * by the highlight as a pull-quote (fallback, shouldn't happen per spec).
 */
function ContextualHighlight({
  context,
  highlight,
  expanded,
}: {
  context: string;
  highlight: string;
  expanded: boolean;
}) {
  const matchIndex = highlight ? context.indexOf(highlight) : -1;

  if (matchIndex < 0 || !highlight) {
    // Fallback: show context above, then the highlight as a quote.
    return (
      <div className="space-y-2">
        <p
          className={cn(
            'whitespace-pre-wrap break-words text-muted-foreground',
            expanded ? 'text-[15px] leading-relaxed' : 'text-sm leading-relaxed',
          )}
        >
          {context}
        </p>
        <Blockquote text={highlight} expanded={expanded} />
      </div>
    );
  }

  const before = context.slice(0, matchIndex);
  const after = context.slice(matchIndex + highlight.length);

  return (
    <blockquote
      className={cn(
        'relative rounded-r-xl border-l-4 border-primary/70 bg-primary/5 pl-4 pr-4 py-3',
      )}
    >
      <Highlighter
        className={cn(
          'absolute right-3 top-3 text-primary/60',
          expanded ? 'size-4' : 'size-3.5',
        )}
        aria-hidden
      />
      <p
        className={cn(
          'whitespace-pre-wrap break-words font-serif pr-6',
          expanded ? 'text-[17px] leading-relaxed' : 'text-[15px] leading-relaxed',
        )}
      >
        <span className="text-muted-foreground">{before}</span>
        <mark className="rounded bg-primary/25 px-0.5 text-foreground">{highlight}</mark>
        <span className="text-muted-foreground">{after}</span>
      </p>
    </blockquote>
  );
}

/** External-URL source chip (rendered when the highlight came from a plain web page). */
function SourceUrlChip({ url }: { url: string }) {
  const host = hostnameOf(url);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      className="flex items-center gap-2 rounded-xl border border-border bg-secondary/30 px-3 py-2 text-sm transition-colors hover:bg-secondary/60"
      onClick={(e) => e.stopPropagation()}
    >
      <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        {host && <div className="truncate text-xs font-medium text-muted-foreground">{host}</div>}
        <div className="truncate text-[13px] text-foreground">{url}</div>
      </div>
    </a>
  );
}

/** Compact source indicator used when embeds are suppressed. */
function SourceChipCompact({
  source,
}: {
  source:
    | { kind: 'addr'; addr: { kind: number; pubkey: string; identifier: string } }
    | { kind: 'event'; id: string }
    | { kind: 'url'; url: string };
}) {
  if (source.kind === 'url') {
    const host = hostnameOf(source.url) ?? source.url;
    return (
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink className="size-3" />
        {host}
      </a>
    );
  }

  const to = source.kind === 'addr'
    ? `/${nip19.naddrEncode(source.addr)}`
    : `/${nip19.neventEncode({ id: source.id })}`;

  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      <Quote className="size-3" />
      Highlighted from Nostr
    </Link>
  );
}
