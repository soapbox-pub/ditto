import * as nip19 from 'nostr-tools/nip19';
import { describe, expect, it } from 'vitest';

import { escape, markdownText, renderMarkdown, renderText, safeUrl } from './html';

const PUBKEY = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d';

describe('article markup', () => {
  it('escapes', () => {
    expect(escape(`<a href="x" onclick='y'>&`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;');
  });

  it('keeps only web URLs', () => {
    expect(safeUrl('https://example.com/a b')).toBe('https://example.com/a%20b');
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeUrl('data:text/html,<script>')).toBeUndefined();
    expect(safeUrl('/relative')).toBeUndefined();
    expect(safeUrl('https://')).toBeUndefined();
  });

  it('renders notes', () => {
    const npub = nip19.npubEncode(PUBKEY);
    const html = renderText(`Hello <b>world</b> & friends.\nSee https://example.com/page. (https://example.com/x_(y))\n\nhttps://cdn.example.com/cat.JPG nostr:${npub}`);
    expect(html.startsWith('<p>Hello &lt;b&gt;world&lt;/b&gt; &amp; friends.<br>\nSee ')).toBe(true);
    expect(html).toContain('<a href="https://example.com/page" rel="nofollow ugc">https://example.com/page</a>.');
    expect(html).toContain('<a href="https://example.com/x_(y)" rel="nofollow ugc">https://example.com/x_(y)</a>)');
    expect(html).toContain('<p><img src="https://cdn.example.com/cat.JPG" alt="" loading="lazy">');
    expect(html).toContain(`<a href="/${npub}">@${npub.slice(0, 12)}…${npub.slice(-4)}</a>`);
  });

  it('refuses markup in notes', () => {
    for (const hostile of ['</script><script>alert(1)</script>', 'https://example.com/"onmouseover="alert(1)', 'javascript:alert(1)', '<img src=x onerror=alert(1)>']) {
      const html = renderText(hostile);
      expect(html).not.toContain('<script');
      expect(html).not.toContain('onmouseover="');
      expect(html).not.toContain('<img src=x');
      expect(html).not.toContain('href="javascript');
    }
    // A secret is never linked, and so never put in a URL.
    expect(renderText(`nostr:${nip19.nsecEncode(new Uint8Array(32).fill(1))}`)).not.toContain('href');
  });

  it('renders articles', () => {
    const npub = nip19.npubEncode(PUBKEY);
    const html = renderMarkdown(`# Title\n\nSome *text* by nostr:${npub}, [a link](https://example.com) and [mention](nostr:${npub}).\n\n![cover](https://cdn.example.com/c.png)\n`);
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<em>text</em>');
    expect(html).toContain('<a href="https://example.com">a link</a>');
    expect(html).toContain(`<a href="/${npub}">mention</a>`);
    expect(html).toContain(`<a href="/${npub}">@${npub.slice(0, 12)}`);
    expect(html).toContain('<img src="https://cdn.example.com/c.png" alt="cover" />');
  });

  it('refuses markup in articles', () => {
    const html = renderMarkdown(
      '<script>alert(1)</script>\n\nHi <img src=x onerror=alert(1)> there\n\n[x](javascript:alert(1)) ![y](data:image/png;base64,AA) [z](/relative)\n\n```\nnostr:npub1\n```\n\n<div onclick="x">kept text</div>\n',
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('onerror="');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('src="data:');
    expect(html).not.toContain('href="/relative"');
    expect(html).not.toContain('<div onclick');
    expect(html).toContain('kept text');
  });

  it('reads articles as text', () => {
    expect(markdownText('# Head\n\nSome *em* `code`, [a link](https://x.example).').split(/\s+/).filter(Boolean).join(' ')).toBe('Head Some em code, a link.');
  });
});
