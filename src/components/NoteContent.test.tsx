import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { TestApp } from '@/test/TestApp';
import { NoteContent } from './NoteContent';
import type { NostrEvent } from '@nostrify/nostrify';

describe('NoteContent', () => {
  it('linkifies URLs in kind 1 events', async () => {
    const event: NostrEvent = {
      id: 'test-id',
      pubkey: 'test-pubkey',
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [],
      content: 'Check out this link: https://example.com for more info',
      sig: 'test-sig',
    };

    render(
      <TestApp>
        <NoteContent event={event} />
      </TestApp>
    );

    const link = await screen.findByRole('link', { name: 'https://example.com' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('linkifies URLs in kind 1111 events (comments)', async () => {
    const event: NostrEvent = {
      id: 'test-comment-id',
      pubkey: 'test-pubkey',
      created_at: Math.floor(Date.now() / 1000),
      kind: 1111,
      tags: [
        ['a', '30040:pubkey:identifier'],
        ['k', '30040'],
        ['p', 'pubkey'],
      ],
      content: 'I think the log events should be different kind numbers instead of having a `log-type` tag. That way you can use normal Nostr filters to filter the log types. Also, the `note` type should just be a kind 1111: https://nostrbook.dev/kinds/1111 as specified in the spec.',
      sig: 'test-sig',
    };

    render(
      <TestApp>
        <NoteContent event={event} />
      </TestApp>
    );

    const link = await screen.findByRole('link', { name: 'https://nostrbook.dev/kinds/1111' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://nostrbook.dev/kinds/1111');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('handles text without URLs correctly', async () => {
    const event: NostrEvent = {
      id: 'test-id',
      pubkey: 'test-pubkey',
      created_at: Math.floor(Date.now() / 1000),
      kind: 1111,
      tags: [],
      content: 'This is just plain text without any links.',
      sig: 'test-sig',
    };

    render(
      <TestApp>
        <NoteContent event={event} />
      </TestApp>
    );

    expect(await screen.findByText('This is just plain text without any links.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders hashtags as links', async () => {
    const event: NostrEvent = {
      id: 'test-id',
      pubkey: 'test-pubkey',
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [],
      content: 'This is a post about #nostr and #bitcoin development.',
      sig: 'test-sig',
    };

    render(
      <TestApp>
        <NoteContent event={event} />
      </TestApp>
    );

    const nostrHashtag = await screen.findByRole('link', { name: '#nostr' });
    const bitcoinHashtag = screen.getByRole('link', { name: '#bitcoin' });
    
    expect(nostrHashtag).toBeInTheDocument();
    expect(bitcoinHashtag).toBeInTheDocument();
    expect(nostrHashtag).toHaveAttribute('href', '/t/nostr');
    expect(bitcoinHashtag).toHaveAttribute('href', '/t/bitcoin');
  });

  it('renders hashtags containing internal hyphens as a single link', async () => {
    const event: NostrEvent = {
      id: 'test-id',
      pubkey: 'test-pubkey',
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [],
      // `#70-706` is a full hashtag; `#nostr-` has a trailing hyphen that should be excluded.
      content: 'Reporte #70-706 from #nostr- community.',
      sig: 'test-sig',
    };

    render(
      <TestApp>
        <NoteContent event={event} />
      </TestApp>
    );

    const codeHashtag = await screen.findByRole('link', { name: '#70-706' });
    expect(codeHashtag).toHaveAttribute('href', '/t/70-706');

    // Trailing hyphen must not be captured into the hashtag.
    const nostrHashtag = screen.getByRole('link', { name: '#nostr' });
    expect(nostrHashtag).toHaveAttribute('href', '/t/nostr');
  });

  it('renders a BUD-10 blossom: image URI as an image resolved to an https server', async () => {
    const hash = 'b1674191a88ec5cdd733e4240a81803105dc412d6c6708d53ab94fc248f4f553';
    const event: NostrEvent = {
      id: 'test-id',
      pubkey: 'test-pubkey',
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [],
      content: `Nice pic blossom:${hash}.png?xs=cdn.example.com`,
      sig: 'test-sig',
    };

    render(
      <TestApp>
        <NoteContent event={event} />
      </TestApp>
    );

    const img = await screen.findByRole('presentation');
    expect(img).toHaveAttribute('src', `https://cdn.example.com/${hash}.png`);
  });

  it('groups multiple consecutive blossom: image URIs into a gallery', async () => {
    const hash1 = 'b1674191a88ec5cdd733e4240a81803105dc412d6c6708d53ab94fc248f4f553';
    const hash2 = 'a7b3c2d1e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1';
    const event: NostrEvent = {
      id: 'test-id',
      pubkey: 'test-pubkey',
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [],
      content: `blossom:${hash1}.png?xs=cdn.example.com\nblossom:${hash2}.jpg?xs=cdn.example.com`,
      sig: 'test-sig',
    };

    const { container } = render(
      <TestApp>
        <NoteContent event={event} />
      </TestApp>
    );

    // Two consecutive blossom image URIs group into one gallery grid, producing
    // exactly two <img> elements resolved to their https servers.
    await waitFor(() => {
      expect(container.querySelectorAll('img').length).toBe(2);
    });
    const imgs = container.querySelectorAll('img');
    expect(imgs[0]).toHaveAttribute('src', `https://cdn.example.com/${hash1}.png`);
    expect(imgs[1]).toHaveAttribute('src', `https://cdn.example.com/${hash2}.jpg`);
  });

  it('renders a non-media blossom: URI as a download link', async () => {
    const hash = 'b1674191a88ec5cdd733e4240a81803105dc412d6c6708d53ab94fc248f4f553';
    const event: NostrEvent = {
      id: 'test-id',
      pubkey: 'test-pubkey',
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [],
      content: `blossom:${hash}.pdf?xs=cdn.example.com&sz=184292`,
      sig: 'test-sig',
    };

    render(
      <TestApp>
        <NoteContent event={event} />
      </TestApp>
    );

    const link = await screen.findByRole('link', { name: /Blossom file/ });
    expect(link).toHaveAttribute('href', `https://cdn.example.com/${hash}.pdf`);
  });

  it('falls back to "Anonymous" for users without metadata and styles them differently', async () => {
    // Use a valid npub for testing
    const event: NostrEvent = {
      id: 'test-id',
      pubkey: 'test-pubkey',
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [],
      content: `Mentioning nostr:npub1zg69v7ys40x77y352eufp27daufrg4ncjz4ummcjx3t83y9tehhsqepuh0`,
      sig: 'test-sig',
    };

    render(
      <TestApp>
        <NoteContent event={event} />
      </TestApp>
    );

    // The mention should be rendered with the Anonymous fallback name
    const mention = await screen.findByRole('link');
    expect(mention).toBeInTheDocument();
    
    // Should have muted styling for fallback names (muted-foreground instead of primary)
    expect(mention).toHaveClass('text-muted-foreground');
    expect(mention).not.toHaveClass('text-primary');
    
    // The text should start with @ and use the Anonymous fallback (not a truncated npub)
    const linkText = mention.textContent;
    expect(linkText).not.toMatch(/^@npub1/); // Should not be a truncated npub
    expect(linkText).toEqual("@Anonymous");
  });
});