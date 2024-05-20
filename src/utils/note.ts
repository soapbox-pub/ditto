import 'linkify-plugin-hashtag';
import linkifyStr from 'linkify-string';
import linkify from 'linkifyjs';
import { nip19, nip21 } from 'nostr-tools';

import { Conf } from '@/config.ts';
import { getUrlMediaType, isPermittedMediaType } from '@/utils/media.ts';

linkify.registerCustomProtocol('nostr', true);
linkify.registerCustomProtocol('wss');

const linkifyOpts: linkify.Opts = {
  render: {
    hashtag: ({ content }) => {
      const tag = content.replace(/^#/, '');
      const href = Conf.local(`/tags/${tag}`);
      return `<a class=\"mention hashtag\" href=\"${href}\" rel=\"tag\"><span>#</span>${tag}</a>`;
    },
    url: ({ content }) => {
      try {
        const { decoded } = nip21.parse(content);
        const pubkey = getDecodedPubkey(decoded);
        if (pubkey) {
          const name = pubkey.substring(0, 8);
          const href = Conf.local(`/users/${pubkey}`);
          return `<span class="h-card"><a class="u-url mention" href="${href}" rel="ugc">@<span>${name}</span></a></span>`;
        } else {
          return '';
        }
      } catch {
        return `<a href="${content}">${content}</a>`;
      }
    },
  },
};

type Link = ReturnType<typeof linkify.find>[0];

interface ParsedNoteContent {
  html: string;
  links: Link[];
  /** First non-media URL - eligible for a preview card. */
  firstUrl: string | undefined;
}

/** Convert Nostr content to Mastodon API HTML. Also return parsed data. */
function parseNoteContent(content: string): ParsedNoteContent {
  // Parsing twice is ineffecient, but I don't know how to do only once.
  const html = linkifyStr(content, linkifyOpts);
  const links = linkify.find(content).filter(isLinkURL);
  const firstUrl = links.find(isNonMediaLink)?.href;

  return {
    html,
    links,
    firstUrl,
  };
}

/** Remove imeta links. */
function stripimeta(content: string, tags: string[][]): string {
  const imeta = tags.filter(([name]) => name === 'imeta');

  if (!imeta.length) {
    return content;
  }

  const urls = new Set(
    imeta.map(([, ...values]) => values.map((v) => v.split(' ')).find(([name]) => name === 'url')?.[1]),
  );

  const lines = content.split('\n').reverse();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === '' || urls.has(line)) {
      lines.splice(i, 1);
    } else {
      break;
    }
  }

  return lines.reverse().join('\n');
}

/** Returns a matrix of tags. Each item is a list of NIP-94 tags representing a file. */
function getMediaLinks(links: Pick<Link, 'href'>[]): string[][][] {
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

function isNonMediaLink({ href }: Link): boolean {
  return /^https?:\/\//.test(href) && !getUrlMediaType(href);
}

/** Ensures the Link is a URL so it can be parsed. */
function isLinkURL(link: Link): boolean {
  return link.type === 'url';
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

export { getMediaLinks, parseNoteContent, stripimeta };