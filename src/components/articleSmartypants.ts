import { visit } from 'unist-util-visit';
import type { Root, Text } from 'mdast';

/**
 * A focused SmartyPants-style remark plugin for Ditto article rendering.
 *
 * It "educates" plain ASCII punctuation in markdown text nodes into typographic
 * equivalents (curly quotes, real apostrophes, en/em dashes, ellipses) so blog
 * posts read like properly typeset prose.
 *
 * Unlike a generic SmartyPants pass, this is deliberately conservative so it
 * never corrupts data that Ditto re-parses downstream:
 *
 *  - `inlineCode` and `code` nodes are different mdast node types than `text`,
 *    so `visit(tree, 'text', ...)` never touches them. Code stays verbatim.
 *  - Text nodes inside a `link` (markdown `[label](url)` syntax) are left alone,
 *    so link labels that happen to contain quotes don't get altered in ways the
 *    author didn't intend, and link destinations (stored on the `link` node, not
 *    a `text` node) are never seen here.
 *  - Text nodes that contain a bare URL (`http://` / `https://`) are skipped
 *    entirely. Ditto's `NoteContent` linkifies bare URLs after markdown parsing,
 *    matching `https?://\S+` up to whitespace — replacing a `--`, `...`, or quote
 *    inside such a URL would silently break the link. Skipping the whole node is
 *    the safe choice; prose paragraphs rarely mix a bare URL with quotable text.
 */

/** Matches a text node we must not touch because it carries a bare URL. */
const BARE_URL_RE = /https?:\/\//i;

/** Characters SmartyPants treats as "opening" context for a following quote. */
const OPEN_CONTEXT = /[\s([{\u2018\u201c\u2013\u2014]/;

function educateDashes(value: string): string {
  // `---` -> em dash, `--` -> en dash. Order matters: replace the longer run first.
  return value
    .replace(/---/g, '\u2014')
    .replace(/--/g, '\u2013');
}

function educateEllipses(value: string): string {
  // `...` or `. . .` -> single ellipsis character.
  return value.replace(/\.\.\./g, '\u2026').replace(/\. \. \./g, '\u2026');
}

function educateDoubleQuotes(value: string): string {
  let result = '';
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char !== '"') {
      result += char;
      continue;
    }
    const prev = i > 0 ? value[i - 1] : '';
    // Opening if at the start, or preceded by whitespace/opening punctuation.
    const opening = prev === '' || OPEN_CONTEXT.test(prev);
    result += opening ? '\u201c' : '\u201d';
  }
  return result;
}

function educateSingleQuotes(value: string): string {
  let result = '';
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char !== "'") {
      result += char;
      continue;
    }
    const prev = i > 0 ? value[i - 1] : '';
    const next = i < value.length - 1 ? value[i + 1] : '';
    // Apostrophe inside or attached to a word (contractions, possessives,
    // decade abbreviations like '90s) -> closing/apostrophe glyph.
    if (/[A-Za-z0-9]/.test(prev)) {
      result += '\u2019';
      continue;
    }
    // Leading apostrophe on a word (e.g. 'tis, '90s) -> apostrophe glyph.
    if ((prev === '' || OPEN_CONTEXT.test(prev)) && /[A-Za-z0-9]/.test(next)) {
      // Could be an opening single quote or a contraction like 'tis.
      // SmartyPants treats a quote that opens a word as an opening quote,
      // but a few common cases (decades, 'tis/'twas) are apostrophes.
      if (/[0-9]/.test(next) || /^(tis|twas|cause|em|n|round|bout)\b/i.test(value.slice(i + 1))) {
        result += '\u2019';
      } else {
        result += '\u2018';
      }
      continue;
    }
    // Closing single quote.
    result += '\u2019';
  }
  return result;
}

export function retextSmartypants() {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, _index, parent) => {
      // Skip link labels — destinations live on the link node, labels stay as authored.
      if (parent && (parent as { type?: string }).type === 'link') return;
      // Skip any text that carries a bare URL we'd risk corrupting.
      if (BARE_URL_RE.test(node.value)) return;

      let value = node.value;
      value = educateEllipses(value);
      value = educateDashes(value);
      value = educateDoubleQuotes(value);
      value = educateSingleQuotes(value);
      node.value = value;
    });
  };
}
