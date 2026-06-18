import { NKinds, type NostrEvent } from '@nostrify/nostrify';

import { isNostrId } from '@/lib/nostrId';

/**
 * Data attributes stamped onto rendered text containers (e.g. the `NoteContent`
 * wrapper) so a text-selection highlighter can recover the source event a
 * selection belongs to.
 *
 * The DOM only hands a highlighter the selected *string* — it has no idea which
 * Nostr event the text came from. By tagging the nearest enclosing element with
 * these attributes, a `Selection`-based handler can walk up from the selection's
 * anchor node to find the source and build a NIP-84 (kind 9802) Highlight.
 */
export const HIGHLIGHT_SOURCE_ATTR = {
  /** Hex event id of the source event (always present). */
  id: 'data-highlight-id',
  /** Hex pubkey of the source event author. */
  pubkey: 'data-highlight-pubkey',
  /** Numeric kind of the source event. */
  kind: 'data-highlight-kind',
  /** Addressable coordinate `kind:pubkey:d` for replaceable/addressable sources. */
  addr: 'data-highlight-addr',
} as const;

/** A source event resolved from the DOM, ready to build a NIP-84 highlight from. */
export interface HighlightSource {
  /** Hex event id. */
  id: string;
  /** Hex pubkey of the author. */
  pubkey: string;
  /** Numeric kind. */
  kind: number;
  /** Addressable coordinate `kind:pubkey:d`, for replaceable/addressable kinds only. */
  addr?: string;
}

/**
 * Build the set of `data-highlight-*` attributes for a source event. Spread the
 * result onto the element that wraps the event's rendered text.
 *
 * Returns an empty object when the event has no valid id, so the highlighter
 * never picks up a malformed reference.
 */
export function highlightSourceAttrs(event: NostrEvent | undefined): Record<string, string> {
  if (!event || !isNostrId(event.id) || !isNostrId(event.pubkey)) return {};

  const attrs: Record<string, string> = {
    [HIGHLIGHT_SOURCE_ATTR.id]: event.id,
    [HIGHLIGHT_SOURCE_ATTR.pubkey]: event.pubkey,
    [HIGHLIGHT_SOURCE_ATTR.kind]: String(event.kind),
  };

  if (NKinds.replaceable(event.kind) || NKinds.addressable(event.kind)) {
    const d = event.tags.find(([name]) => name === 'd')?.[1] ?? '';
    attrs[HIGHLIGHT_SOURCE_ATTR.addr] = `${event.kind}:${event.pubkey}:${NKinds.addressable(event.kind) ? d : ''}`;
  }

  return attrs;
}

/**
 * Read a {@link HighlightSource} back out of an element's dataset attributes.
 * Returns `undefined` if the element doesn't carry a valid highlight source.
 */
export function readHighlightSource(el: Element | null): HighlightSource | undefined {
  if (!el) return undefined;

  const id = el.getAttribute(HIGHLIGHT_SOURCE_ATTR.id);
  const pubkey = el.getAttribute(HIGHLIGHT_SOURCE_ATTR.pubkey);
  const kindStr = el.getAttribute(HIGHLIGHT_SOURCE_ATTR.kind);

  if (!id || !pubkey || !kindStr) return undefined;
  if (!isNostrId(id) || !isNostrId(pubkey)) return undefined;

  const kind = Number(kindStr);
  if (!Number.isInteger(kind)) return undefined;

  const addr = el.getAttribute(HIGHLIGHT_SOURCE_ATTR.addr) ?? undefined;

  return { id, pubkey, kind, addr };
}

/**
 * Walk up the DOM from a node to the nearest element carrying a highlight
 * source, returning the resolved {@link HighlightSource} or `undefined`.
 */
export function findHighlightSource(node: Node | null): HighlightSource | undefined {
  let el: Element | null = node instanceof Element ? node : node?.parentElement ?? null;
  while (el) {
    const source = readHighlightSource(el);
    if (source) return source;
    el = el.parentElement;
  }
  return undefined;
}

/**
 * Build the tags for a NIP-84 (kind 9802) Highlight event.
 *
 * @param source   The resolved source event.
 * @param context  Optional surrounding prose containing the highlight verbatim.
 */
export function buildHighlightTags(source: HighlightSource, context?: string): string[][] {
  const tags: string[][] = [];

  // Source reference: `a` for addressable/replaceable, `e` for regular events.
  if (source.addr) {
    tags.push(['a', source.addr]);
  } else {
    tags.push(['e', source.id]);
  }

  // Attribute the original author (NIP-84 `author` role).
  tags.push(['p', source.pubkey, '', 'author']);

  // Surrounding context, when available and it actually contains the highlight.
  if (context) {
    tags.push(['context', context]);
  }

  // NIP-31 alt tag for clients that don't understand kind 9802.
  tags.push(['alt', 'Highlight']);

  return tags;
}
