import { visit } from 'unist-util-visit';
import type { Link, Root, Text } from 'mdast';
import { nip19 } from 'nostr-tools';

/**
 * Splits NIP-19 identifiers in markdown text into internal route links, so AI
 * chat markdown renders npub/nprofile mentions and note/nevent/naddr
 * references instead of raw bech32 strings.
 *
 * The prefix set and character class mirror the identifier pattern in
 * NoteContent's tokenizer (the other copy of this regex — keep both in sync).
 * `nsec1` is deliberately absent from the prefix alternatives, so a secret
 * key never matches and always stays plain text.
 *
 * Text inside `inlineCode` and `code` nodes is never touched: those node
 * types carry their content in a `value` field rather than in `text`
 * children, so `visit(tree, 'text', ...)` never reaches them. Text inside an
 * existing `link` node is skipped so a link label cannot gain a nested
 * anchor, and a link destination is already an explicit URL.
 *
 * Each match becomes a `link` node whose `url` is the root route for the
 * identifier (`/npub1…`, `/note1…`, …), which NIP19Page handles. The `a`
 * override in chatMarkdownComponents decodes that route again to pick the
 * renderer. A malformed identifier is validated with `nip19.decode` in a
 * try/catch here and falls back to plain text — it can never throw.
 */
const NIP19_IDENTIFIER_RE =
  /nostr:(npub1|note1|nprofile1|nevent1|naddr1)([023456789acdefghjklmnpqrstuvwxyz]+)|@?(npub1|note1|nprofile1|nevent1|naddr1)([023456789acdefghjklmnpqrstuvwxyz]+)/giu;

/** One segment of a plain string split on NIP-19 identifiers. */
export type NostrTextPart =
  | { type: 'text'; value: string }
  | { type: 'identifier'; identifier: string; label: string };

/**
 * Splits a plain string into an ordered list of text parts and identifier
 * parts. Identifiers are validated with `nip19.decode`; a malformed match
 * falls back to a text part and never throws. `nsec1` never matches, so a
 * secret key always stays text. Whitespace is preserved exactly.
 *
 * Both chat render paths consume this: the markdown plugin turns identifier
 * parts into link nodes, and the plain user-message path turns them into
 * mention links. The regex lives in exactly one place.
 */
export function splitNostrIdentifiers(text: string): NostrTextPart[] {
  const parts: NostrTextPart[] = [];
  let cursor = 0;

  for (const match of text.matchAll(NIP19_IDENTIFIER_RE)) {
    if (match.index > cursor) {
      parts.push({ type: 'text', value: text.slice(cursor, match.index) });
    }

    const identifier = `${match[1] || match[3]}${match[2] || match[4]}`;
    try {
      nip19.decode(identifier);
      parts.push({ type: 'identifier', identifier, label: match[0] });
    } catch {
      parts.push({ type: 'text', value: match[0] });
    }
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    parts.push({ type: 'text', value: text.slice(cursor) });
  }

  return parts;
}

/**
 * Remark plugin that linkifies NIP-19 identifiers in markdown.
 *
 * Usage: pass `remarkNostrMentions` in `remarkPlugins` after remark-parse.
 */
export function remarkNostrMentions(): (tree: Root) => void {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || typeof index !== 'number') return;
      if (parent.type === 'link') return;

      const parts = splitNostrIdentifiers(node.value);
      if (!parts.some((part) => part.type === 'identifier')) return;

      const nodes: (Text | Link)[] = parts.map((part) =>
        part.type === 'text'
          ? { type: 'text', value: part.value }
          : {
              type: 'link',
              url: `/${part.identifier}`,
              children: [{ type: 'text', value: part.label }],
            },
      );

      parent.children.splice(index, 1, ...nodes);
    });
  };
}
