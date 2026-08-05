import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { ReactNode } from 'react';
import type { Components } from 'react-markdown';

import { NostrMention } from '@/components/NostrMention';
import { isNostrId } from '@/lib/nostrId';

/** Shortens a NIP-19 identifier so a chat link does not dominate the line. */
function truncateIdentifier(identifier: string): string {
  if (identifier.length <= 16) return identifier;
  return `${identifier.slice(0, 12)}…${identifier.slice(-4)}`;
}

/**
 * Renders a validated NIP-19 identifier the way chat surfaces present it:
 * npub/nprofile become a NostrMention, note/nevent/naddr become a short
 * internal link. Returns null when the identifier is not renderable (an
 * nsec, a malformed string, or an unknown kind), so callers fall back to
 * plain text or a default anchor.
 */
export function renderNostrIdentifier(identifier: string): ReactNode {
  if (identifier.startsWith('nsec1')) return null;

  let decoded: ReturnType<typeof nip19.decode> | undefined;
  try {
    decoded = nip19.decode(identifier);
  } catch {
    return null;
  }

  if (decoded.type === 'npub' && isNostrId(decoded.data)) {
    return <NostrMention pubkey={decoded.data} />;
  }
  if (decoded.type === 'nprofile' && isNostrId(decoded.data.pubkey)) {
    return <NostrMention pubkey={decoded.data.pubkey} />;
  }
  if (decoded.type === 'note' || decoded.type === 'nevent' || decoded.type === 'naddr') {
    return (
      <Link to={`/${identifier}`} className="text-primary hover:underline">
        {truncateIdentifier(identifier)}
      </Link>
    );
  }
  return null;
}

/**
 * react-markdown component overrides shared by the AI chat markdown renderers
 * (assistant bubbles and tool-call results).
 *
 * Tailwind's typography plugin scrolls wide `<pre>` blocks horizontally
 * (`prose-pre:overflow-x-auto`), but it does not wrap a `<table>` in a scroll
 * container. Without this override a wide table overflows the chat bubble, so
 * wrap the table in a scrollable div here.
 *
 * The `a` override decodes internal NIP-19 routes (produced by the
 * `remarkNostrMentions` plugin as `/npub1…`-style urls) to render proper
 * mentions: npub/nprofile become a NostrMention, note/nevent/naddr become a
 * short internal link. Everything else keeps the default anchor.
 */
export const chatMarkdownComponents: Components = {
  table: ({ children, node: _node, ...rest }) => (
    <div className="overflow-x-auto">
      <table {...rest}>{children}</table>
    </div>
  ),
  a: ({ href, children, node: _node, ...rest }) => {
    const identifier =
      typeof href === 'string' && href.startsWith('/') ? href.slice(1) : undefined;

    if (identifier) {
      const rich = renderNostrIdentifier(identifier);
      if (rich !== null) return rich;
    }

    return <a href={href} {...rest}>{children}</a>;
  },
};
