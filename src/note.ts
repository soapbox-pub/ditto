import { LOCAL_DOMAIN } from '@/config.ts';
import { linkify, linkifyStr, mime, nip19, nip21 } from '@/deps.ts';

linkify.registerCustomProtocol('nostr', true);
linkify.registerCustomProtocol('wss');

const url = (path: string) => new URL(path, LOCAL_DOMAIN).toString();

const linkifyOpts: linkify.Opts = {
  render: {
    hashtag: ({ content }) => {
      const tag = content.replace(/^#/, '');
      const href = url(`/tags/${tag}`);
      return `<a class=\"mention hashtag\" href=\"${href}\" rel=\"tag\"><span>#</span>${tag}</a>`;
    },
    url: ({ content }) => {
      if (nip21.test(content)) {
        const { decoded } = nip21.parse(content);
        const pubkey = getDecodedPubkey(decoded);
        if (pubkey) {
          const name = pubkey.substring(0, 8);
          const href = url(`/users/${pubkey}`);
          return `<span class="h-card"><a class="u-url mention" href="${href}" rel="ugc">@<span>${name}</span></a></span>`;
        } else {
          return '';
        }
      } else {
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
  const links = linkify.find(content).filter(isValidLink);
  const firstUrl = links.find(isNonMediaLink)?.href;

  return {
    html,
    links,
    firstUrl,
  };
}

interface MediaLink {
  url: string;
  mimeType: string;
}

function getMediaLinks(links: Link[]): MediaLink[] {
  return links.reduce<MediaLink[]>((acc, link) => {
    const mimeType = getUrlMimeType(link.href);
    if (!mimeType) return acc;

    const [baseType, _subType] = mimeType.split('/');

    if (['audio', 'image', 'video'].includes(baseType)) {
      acc.push({
        url: link.href,
        mimeType,
      });
    }

    return acc;
  }, []);
}

function isNonMediaLink({ href }: Link): boolean {
  return /^https?:\/\//.test(href) && !getUrlMimeType(href);
}

/** Ensures the URL can be parsed. Why linkifyjs doesn't already guarantee this, idk... */
function isValidLink(link: Link): boolean {
  try {
    new URL(link.href);
    return true;
  } catch (_e) {
    console.error(`Invalid link: ${link.href}`);
    return false;
  }
}

/** `npm:mime` treats `.com` as a file extension, so parse the full URL to get its path first. */
function getUrlMimeType(url: string): string | undefined {
  try {
    const { pathname } = new URL(url);
    return mime.getType(pathname) || undefined;
  } catch (_e) {
    return undefined;
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

export { getMediaLinks, type MediaLink, parseNoteContent };
