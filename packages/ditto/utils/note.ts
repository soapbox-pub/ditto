import 'linkify-plugin-hashtag';
import linkifyStr from 'linkify-string';
import linkify from 'linkifyjs';
import { nip19, nip27 } from 'nostr-tools';

import { html } from '@/utils/html.ts';
import { getUrlMediaType, isPermittedMediaType } from '@/utils/media.ts';

import type { DittoConf } from '@ditto/conf';
import type { MastodonMention } from '@ditto/mastoapi/types';
import type { NostrEvent } from '@nostrify/nostrify';

linkify.registerCustomProtocol('nostr', true);
linkify.registerCustomProtocol('wss');

type Link = ReturnType<typeof linkify.find>[0];

interface ParseNoteContentOpts {
  conf: DittoConf;
}

/** Convert Nostr content to Mastodon API HTML. */
export function contentToHtml(content: string, mentions: MastodonMention[], opts: ParseNoteContentOpts): string {
  const { conf } = opts;

  return linkifyStr(content, {
    render: {
      hashtag: ({ content }) => {
        const tag = content.replace(/^#/, '');
        const href = conf.local(`/tags/${tag}`);
        return html`<a class="mention hashtag" href="${href}" rel="tag"><span>#</span>${tag}</a>`;
      },
      url: ({ attributes, content }) => {
        try {
          const { protocol, pathname } = new URL(content);

          if (protocol === 'nostr:') {
            const match = pathname.match(new RegExp(`^${nip19.BECH32_REGEX.source}`));
            if (match) {
              const bech32 = match[0];
              const extra = pathname.slice(bech32.length);
              const decoded = nip19.decode(bech32);
              const pubkey = getDecodedPubkey(decoded);
              if (pubkey) {
                const mention = mentions.find((m) => m.id === pubkey);
                const npub = nip19.npubEncode(pubkey);
                const acct = mention?.acct ?? npub;
                const name = mention?.acct ?? npub.substring(0, 8);
                const href = mention?.url ?? conf.local(`/@${acct}`);
                return html`<span class="h-card"><a class="u-url mention" href="${href}" rel="ugc">@<span>${name}</span></a></span>${extra}`;
              } else {
                return '';
              }
            } else {
              return content;
            }
          }
        } catch {
          // fallthrough
        }

        const attr = Object.entries(attributes)
          .map(([name, value]) => `${name}="${value}"`)
          .join(' ');

        return `<a ${attr}>${content}</a>`;
      },
    },
  }).replace(/\n+$/, '');
}

/** Remove the tokens from the _end_ of the content. */
export function removeTrailingTokens(text: string, tokens: Set<string>): string {
  let trimmedText = text;

  while (true) {
    const match = trimmedText.match(/([^\s]+)(?:\s+)?$/);
    if (match && tokens.has(match[1])) {
      trimmedText = trimmedText.slice(0, match.index).replace(/\s+$/, '');
    } else {
      break;
    }
  }

  return trimmedText;
}

export function getLinks(content: string) {
  return linkify.find(content).filter(({ type }) => type === 'url');
}

/** Legacy media URL finder. Should be used only as a fallback when no imeta tags are in the event. */
export function getMediaLinks(links: Pick<Link, 'href'>[]): string[][][] {
  return links.reduce<string[][][]>((acc, link) => {
    const mediaType = getUrlMediaType(link.href);
    if (!mediaType) return acc;

    if (isPermittedMediaType(mediaType, ['audio', 'image', 'video'])) {
      acc.push([
        ['url', link.href],
        ['m', mediaType],
      ]);
    }

    return acc;
  }, []);
}

/** Get the first non-media URL from an event. */
export function getCardUrl(event: NostrEvent): string | undefined {
  const links = getLinks(event.content);

  const imeta: string[][][] = event.tags
    .filter(([name]) => name === 'imeta')
    .map(([_, ...entries]) =>
      entries.map((entry) => {
        const split = entry.split(' ');
        return [split[0], split.splice(1).join(' ')];
      })
    );

  const media = imeta.length ? imeta : getMediaLinks(links);
  const mediaUrls = new Set<string>();

  for (const tags of media) {
    for (const [name, value] of tags) {
      if (name === 'url') {
        mediaUrls.add(value);
        break;
      }
    }
  }

  for (const link of links) {
    if (link.type === 'url' && !mediaUrls.has(link.href)) {
      return link.href;
    }
  }
}

/** Get pubkey from decoded bech32 entity, or undefined if not applicable. */
function getDecodedPubkey(decoded: nip19.DecodeResult): string | undefined {
  switch (decoded.type) {
    case 'npub':
      return decoded.data;
    case 'nprofile':
      return decoded.data.pubkey;
  }
}

/** Find a quote in the content. */
export function findQuoteInContent(content: string): string | undefined {
  try {
    for (const { decoded } of nip27.matchAll(content)) {
      switch (decoded.type) {
        case 'note':
          return decoded.data;
        case 'nevent':
          return decoded.data.id;
      }
    }
  } catch (_) {
    // do nothing
  }
}
