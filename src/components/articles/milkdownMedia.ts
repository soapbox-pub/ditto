import type { MilkdownPlugin } from '@milkdown/ctx';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $nodeSchema, $prose, $remark } from '@milkdown/utils';

import { isAudioUrl, isImageUrl, isVideoUrl } from '@/lib/mediaTypeDetection';

/**
 * Media URLs in the article editor.
 *
 * Markdown only has syntax for images, so a pasted (or pre-existing, alone on
 * its own line) image URL becomes a real `![](url)` image, which every NIP-23
 * client renders. Video and audio have no portable syntax: they stay a bare
 * URL on its own line in the published Markdown (Ditto plays it, other
 * clients link it), and the editor shows them as a chip so they don't read
 * like stray text.
 */

type EmbedKind = 'video' | 'audio';

type MediaKind = 'image' | EmbedKind;

function mediaKind(url: string): MediaKind | undefined {
  if (isImageUrl(url)) return 'image';
  if (isVideoUrl(url)) return 'video';
  if (isAudioUrl(url)) return 'audio';
  return undefined;
}

/** Parses `text` as exactly one http(s) URL, or returns `undefined`. */
function singleUrl(text: string): string | undefined {
  const trimmed = text.trim();
  if (!/^https?:\/\/\S+$/i.test(trimmed)) return undefined;
  try {
    new URL(trimmed);
    return trimmed;
  } catch {
    return undefined;
  }
}

/**
 * Inserts a media block on a line of its own: it replaces the current line
 * when that's empty, and otherwise goes after (or splits) it rather than
 * sitting inline next to the text. Leaves the cursor on a fresh line below.
 */
export function insertMediaBlock(view: EditorView, block: ProseNode): void {
  const { state } = view;
  const { selection } = state;
  const { $from } = selection;
  const tr = state.tr;

  let end: number;
  if (selection.empty && $from.parent.isTextblock && $from.parent.content.size === 0) {
    tr.replaceWith($from.before(), $from.after(), block);
    end = $from.before() + block.nodeSize;
  } else {
    tr.replaceSelectionWith(block);
    // Walk out of whatever the selection landed in to the block boundary.
    const $to = tr.selection.$to;
    end = $to.depth > 0 && $to.parent.isTextblock ? $to.before() : $to.pos;
    const before = tr.doc.resolve(end).nodeBefore;
    if (before !== null && !before.eq(block)) end = $to.pos;
  }

  if (!tr.doc.resolve(end).nodeAfter?.isTextblock) {
    tr.insert(end, state.schema.nodes.paragraph.create());
  }
  tr.setSelection(TextSelection.near(tr.doc.resolve(end + 1)));

  view.dispatch(tr.scrollIntoView());
}

/** An image wrapped in its own paragraph, ready for {@link insertMediaBlock}. */
export function imageBlock(view: EditorView, src: string): ProseNode {
  const { schema } = view.state;
  return schema.nodes.paragraph.create(null, schema.nodes.image.create({ src }));
}

/** The subset of mdast this module touches. */
interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
  [key: string]: unknown;
}

const BLOCK_CONTAINERS = new Set(['root', 'blockquote', 'listItem', 'footnoteDefinition']);

/** The URL a paragraph consists of, if it holds nothing but one bare URL. */
function soloUrl(paragraph: MdNode): string | undefined {
  if (paragraph.type !== 'paragraph') return undefined;
  const children = (paragraph.children ?? []).filter((c) => !(c.type === 'text' && !c.value?.trim()));
  if (children.length !== 1) return undefined;
  const [child] = children;
  if (child.type === 'text') return singleUrl(child.value ?? '');
  if (child.type === 'link' && child.children?.length === 1) {
    const [label] = child.children;
    if (label.type === 'text' && label.value === child.url) return singleUrl(child.url ?? '');
  }
  return undefined;
}

function upgradeMediaParagraphs(node: MdNode): void {
  if (!node.children) return;
  if (BLOCK_CONTAINERS.has(node.type)) {
    node.children = node.children.map((child) => {
      const url = soloUrl(child);
      const kind = url ? mediaKind(url) : undefined;
      if (!url || !kind) return child;
      if (kind === 'image') {
        return { type: 'paragraph', children: [{ type: 'image', url, alt: '', title: '' }] };
      }
      return { type: 'mediaEmbed', url, kind };
    });
  }
  node.children.forEach(upgradeMediaParagraphs);
}

/** Turns paragraphs holding only a media URL into images or media embeds. */
const remarkMediaUrls = $remark('remarkMediaUrls', () => () => (ast) => {
  upgradeMediaParagraphs(ast as unknown as MdNode);
});

export interface MediaEmbedLabels {
  video: string;
  audio: string;
}

/** Builds the media plugins. Labels are passed in because they're localized. */
export function articleMedia(labels: MediaEmbedLabels): MilkdownPlugin[] {
  const mediaEmbedSchema = $nodeSchema('media_embed', () => ({
    group: 'block',
    atom: true,
    selectable: true,
    draggable: true,
    attrs: {
      src: { default: '', validate: 'string' },
      kind: { default: 'video', validate: 'string' },
    },
    parseDOM: [{
      tag: 'div[data-type="media-embed"]',
      getAttrs: (dom) => ({
        src: dom.getAttribute('data-src') ?? '',
        kind: dom.getAttribute('data-kind') === 'audio' ? 'audio' : 'video',
      }),
    }],
    toDOM: (node) => {
      const kind = node.attrs.kind as EmbedKind;
      return [
        'div',
        { 'data-type': 'media-embed', 'data-src': node.attrs.src, 'data-kind': kind, class: 'milkdown-media-embed not-prose', contenteditable: 'false' },
        ['span', { class: 'milkdown-media-embed-kind' }, labels[kind] ?? labels.video],
        ['span', { class: 'milkdown-media-embed-url', dir: 'ltr' }, node.attrs.src],
      ];
    },
    parseMarkdown: {
      match: ({ type }) => type === 'mediaEmbed',
      runner: (state, node, type) => {
        state.addNode(type, { src: node.url as string, kind: node.kind as string });
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === 'media_embed',
      runner: (state, node) => {
        // A bare URL on its own line: no portable markup exists for video/audio.
        state.openNode('paragraph');
        state.addNode('text', undefined, node.attrs.src as string);
        state.closeNode();
      },
    },
  }));

  /**
   * Pasting a lone media URL inserts the media itself. Runs ahead of the
   * clipboard plugin, which would otherwise paste it as a plain link.
   */
  const mediaPaste = $prose(() => new Plugin({
    key: new PluginKey('ARTICLE_MEDIA_PASTE'),
    props: {
      handlePaste: (view, event) => {
        const url = singleUrl(event.clipboardData?.getData('text/plain') ?? '');
        const kind = url ? mediaKind(url) : undefined;
        if (!url || !kind || view.state.selection.$from.parent.type.spec.code) return false;

        insertMediaBlock(view, kind === 'image'
          ? imageBlock(view, url)
          : view.state.schema.nodes.media_embed.create({ src: url, kind }));
        return true;
      },
    },
  }));

  return [mediaEmbedSchema, remarkMediaUrls, mediaPaste].flat();
}
