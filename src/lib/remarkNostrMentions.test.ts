import { describe, it, expect } from 'vitest';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { visit } from 'unist-util-visit';
import type { InlineCode, Link, Root, Text } from 'mdast';
import { nip19 } from 'nostr-tools';

import { remarkNostrMentions, splitNostrIdentifiers } from '@/lib/remarkNostrMentions';

/** Valid pubkey whose npub/note encodings pass nip19.decode in the plugin. */
const PUBKEY = 'f'.repeat(64);
const NPUB = nip19.npubEncode(PUBKEY);
const NOTE_ID = 'a'.repeat(64);
const NOTE = nip19.noteEncode(NOTE_ID);
const NSEC = nip19.nsecEncode(new Uint8Array(32).fill(7));

/** Parses markdown and runs the plugin, returning the transformed mdast tree. */
function transform(content: string): Root {
  const tree = fromMarkdown(content);
  remarkNostrMentions()(tree);
  return tree;
}

/** Collects every link node in a tree, in document order. */
function findLinks(tree: Root): Link[] {
  const links: Link[] = [];
  visit(tree, 'link', (node) => links.push(node));
  return links;
}

/** Returns the single paragraph's children for a one-paragraph input. */
function paragraphChildren(tree: Root) {
  const paragraph = tree.children[0] as { type: 'paragraph'; children: (Text | Link | InlineCode)[] };
  return paragraph.children;
}

describe('remarkNostrMentions', () => {
  it('turns a bare npub into a link node with the internal route url', () => {
    const tree = transform(`hello ${NPUB} world`);
    const children = paragraphChildren(tree);

    expect(children).toHaveLength(3);
    expect(children[0]).toMatchObject({ type: 'text', value: 'hello ' });
    expect(children[1]).toMatchObject({ type: 'link', url: `/${NPUB}` });
    expect((children[1] as Link).children[0]).toMatchObject({ type: 'text', value: NPUB });
    expect(children[2]).toMatchObject({ type: 'text', value: ' world' });
  });

  it('turns a nostr:-prefixed npub into a link node', () => {
    const tree = transform(`read ${`nostr:${NPUB}`}`);
    const [link] = findLinks(tree);

    expect(link).toBeDefined();
    expect(link.url).toBe(`/${NPUB}`);
    // The link label keeps the full matched text, including the prefix.
    expect((link.children[0] as Text).value).toBe(`nostr:${NPUB}`);
  });

  it('leaves identifiers inside inline code and code blocks alone', () => {
    const inline = transform(`use \`${NPUB}\` here`);
    expect(findLinks(inline)).toHaveLength(0);
    const inlineCode = paragraphChildren(inline).find((c) => c.type === 'inlineCode');
    expect(inlineCode).toMatchObject({ type: 'inlineCode', value: NPUB });

    const fenced = transform(`\`\`\`\n${NPUB}\n\`\`\``);
    expect(findLinks(fenced)).toHaveLength(0);
    expect(fenced.children[0]).toMatchObject({ type: 'code', value: NPUB });
  });

  it('leaves a malformed identifier as plain text', () => {
    const malformed = `npub1${'a'.repeat(60)}`;
    const tree = transform(`value ${malformed}`);

    expect(findLinks(tree)).toHaveLength(0);
    const children = paragraphChildren(tree);
    expect(children.every((c) => c.type === 'text')).toBe(true);
    expect(children.map((c) => (c as Text).value).join('')).toBe(`value ${malformed}`);
  });

  it('leaves an nsec1 string as plain text', () => {
    const tree = transform(`secret ${NSEC}`);

    expect(findLinks(tree)).toHaveLength(0);
    expect(paragraphChildren(tree)).toHaveLength(1);
    expect(paragraphChildren(tree)[0]).toMatchObject({ type: 'text', value: `secret ${NSEC}` });
  });

  it('links a note identifier to its root route', () => {
    const tree = transform(`see ${NOTE}`);
    const [link] = findLinks(tree);

    expect(link).toBeDefined();
    expect(link.url).toBe(`/${NOTE}`);
  });
});

describe('splitNostrIdentifiers', () => {
  it('splits a bare npub out as an identifier part', () => {
    const parts = splitNostrIdentifiers(`hello ${NPUB} world`);

    expect(parts).toEqual([
      { type: 'text', value: 'hello ' },
      { type: 'identifier', identifier: NPUB, label: NPUB },
      { type: 'text', value: ' world' },
    ]);
  });

  it('treats a nostr:-prefixed npub as an identifier part', () => {
    const parts = splitNostrIdentifiers(`read nostr:${NPUB}`);

    expect(parts).toEqual([
      { type: 'text', value: 'read ' },
      { type: 'identifier', identifier: NPUB, label: `nostr:${NPUB}` },
    ]);
  });

  it('leaves an nsec1 string as a text part', () => {
    const parts = splitNostrIdentifiers(`secret ${NSEC}`);

    expect(parts).toEqual([{ type: 'text', value: `secret ${NSEC}` }]);
  });

  it('leaves a malformed identifier as a text part', () => {
    const malformed = `npub1${'a'.repeat(60)}`;
    const parts = splitNostrIdentifiers(`value ${malformed}`);

    expect(parts).toEqual([
      { type: 'text', value: 'value ' },
      { type: 'text', value: malformed },
    ]);
  });

  it('preserves surrounding whitespace and newlines', () => {
    const parts = splitNostrIdentifiers(`line1\n${NPUB}  \nline3`);

    expect(parts).toEqual([
      { type: 'text', value: 'line1\n' },
      { type: 'identifier', identifier: NPUB, label: NPUB },
      { type: 'text', value: '  \nline3' },
    ]);
  });
});
