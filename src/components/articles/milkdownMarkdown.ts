import { remarkStringifyOptionsCtx } from '@milkdown/core';
import type { Ctx, SliceType } from '@milkdown/ctx';
import { commonmark, remarkPreserveEmptyLinePlugin } from '@milkdown/preset-commonmark';
import { $remark } from '@milkdown/utils';
import { defaultHandlers } from 'mdast-util-to-markdown';

/**
 * Markdown plumbing that keeps the article editor's output plain, portable
 * CommonMark/GFM — the kind every other NIP-23 client renders the same way.
 */

/**
 * The commonmark preset minus `remarkPreserveEmptyLinePlugin`. That plugin
 * serializes every empty paragraph as a literal `<br />`, which no other
 * Nostr client renders (most show the raw tag). Without it, empty paragraphs
 * simply collapse, as they do in any Markdown document.
 */
export const articleCommonmark = commonmark.filter(
  (plugin) => !remarkPreserveEmptyLinePlugin.includes(plugin),
);

/** The subset of mdast this module touches. */
interface MdNode {
  type: string;
  value?: string;
  title?: string | null;
  alt?: string | null;
  children?: MdNode[];
}

const BR_RE = /^<br\s*\/?\s*>$/i;

function isBr(node: MdNode): boolean {
  return node.type === 'html' && BR_RE.test(node.value?.trim() ?? '');
}

/** Nodes whose children are blocks rather than inline content. */
const BLOCK_CONTAINERS = new Set(['root', 'blockquote', 'listItem', 'footnoteDefinition']);

/** Whether a block holds nothing but `<br>` tags and whitespace. */
function isBrOnly(node: MdNode): boolean {
  if (isBr(node)) return true;
  if (node.type !== 'paragraph' || !node.children?.length) return false;
  return node.children.every((child) => isBr(child) || (child.type === 'text' && !child.value?.trim()));
}

function normalize(node: MdNode): void {
  // remark-parse sets `title: null` on untitled images, which fails the image
  // node's `validate: 'string'` check and silently drops the image on load.
  if (node.type === 'image') {
    node.title ??= '';
    node.alt ??= '';
  }

  if (!node.children) return;

  // Drop `<br>` spacer paragraphs left behind by older versions of this
  // editor, and turn inline `<br>`s into real Markdown hard breaks.
  node.children = BLOCK_CONTAINERS.has(node.type)
    ? node.children.filter((child) => !isBrOnly(child))
    : node.children.map((child) => (isBr(child) ? { type: 'break' } : child));

  node.children.forEach(normalize);
}

/** Cleans up incoming Markdown so it loads into the editor without losing content. */
export const remarkArticleCompat = $remark('remarkArticleCompat', () => () => (ast) => {
  normalize(ast as unknown as MdNode);
});

type StringifyOptions = typeof remarkStringifyOptionsCtx extends SliceType<infer T> ? T : never;
type Handlers = NonNullable<StringifyOptions['handlers']>;
type TextHandler = NonNullable<Handlers['text']>;
type LinkHandler = NonNullable<Handlers['link']>;
type RootHandler = NonNullable<Handlers['root']>;

/** Bare URLs and `nostr:` URIs (NIP-21), which readers autolink on their own. */
const URI_RE = /((?:https?:\/\/|nostr:)[^\s<>"]*[^\s<>"'.,;:!?)\]}*_~])/i;

/**
 * Escapes text like Milkdown's default handler, but writes URLs and
 * `nostr:` URIs verbatim. Escaping them (`x\_y`) breaks autolinking in
 * readers that detect URLs before resolving escapes.
 */
const text: TextHandler = (node, _parent, state, info) => {
  const parts = node.value.split(URI_RE);
  let out = '';
  parts.forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 1) {
      out += part;
    } else if (/^[^*_\\]*\s+$/.test(part)) {
      // Milkdown's default: keep a trailing space instead of encoding it.
      out += part;
    } else {
      out += state.safe(part, {
        ...info,
        before: i === 0 ? info.before : parts[i - 1].slice(-1),
        after: i === parts.length - 1 ? info.after : parts[i + 1].charAt(0),
        encode: [],
      });
    }
  });
  return out;
};

/**
 * Writes a link whose text is its own URL as the bare URL rather than
 * `<https://…>`, so the raw event content reads naturally everywhere.
 */
const link: LinkHandler = (node, parent, state, info) => {
  const [child] = node.children;
  if (
    node.children.length === 1 &&
    child.type === 'text' &&
    child.value === node.url &&
    !node.title &&
    URI_RE.exec(node.url)?.[0] === node.url
  ) {
    return node.url;
  }
  return defaultHandlers.link(node, parent, state, info);
};

function isBlankParagraph(node: MdNode): boolean {
  return node.type === 'paragraph' &&
    (node.children ?? []).every((child) => child.type === 'text' && !child.value?.trim());
}

function stripBlankParagraphs(node: MdNode): void {
  if (!node.children || !BLOCK_CONTAINERS.has(node.type)) return;
  node.children = node.children.filter((child) => !isBlankParagraph(child));
  node.children.forEach(stripBlankParagraphs);
}

/**
 * Leaves out empty paragraphs (from pressing Enter repeatedly) instead of
 * writing runs of blank lines. Markdown has no empty paragraphs, and blank
 * lines are collapsed by every reader anyway.
 */
const root: RootHandler = (node, parent, state, info) => {
  stripBlankParagraphs(node as unknown as MdNode);
  return defaultHandlers.root(node, parent, state, info);
};

/** Points remark-stringify at the most widely supported Markdown syntax. */
export function configureArticleMarkdown(ctx: Ctx): void {
  ctx.update(remarkStringifyOptionsCtx, (prev) => ({
    ...prev,
    bullet: '-' as const,
    rule: '-' as const,
    fences: true,
    handlers: {
      ...prev.handlers,
      root,
      text,
      link,
    },
  }));
}
