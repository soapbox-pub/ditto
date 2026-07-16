import { nip19 } from 'nostr-tools';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/**
 * Armada / Concord encrypted community invite links.
 *
 * An invite is a URL in two parts (Concord CORD-05): a public locator in the
 * path — a bare NIP-19 `naddr` naming the addressable invite bundle
 * `(kind 33301, link_signer, d="")` — and a secret in the `#fragment` (an
 * unlock token + bootstrap relays, base64url). The bundle's `content` is
 * NIP-44 encrypted and its unlock key lives ONLY in the fragment, so Ditto
 * can never render it as a plain event.
 *
 * Ditto is not an encrypted-community client, so it can't join or preview
 * these. But it should recognize the link and offer to open it in Armada,
 * rather than fetching the bundle and rendering encrypted gibberish (or a
 * bare "unsupported kind" tombstone) through the generic naddr embed.
 */

/** The addressable invite bundle kind (Concord CORD-05 §1). */
export const INVITE_BUNDLE_KIND = 33301;

/** Web app that can open these invites. The path base is cosmetic per CORD-05. */
const ARMADA_INVITE_BASE = 'https://armada.buzz/invite/';

/** The `…/invite/<naddr>` path prefix used by Armada links. */
const INVITE_PATH_PREFIX = '/invite/';

export interface ArmadaInvite {
  /** The bare invite-bundle naddr (locator, no fragment). */
  naddr: string;
  /** The `#fragment` secret, without the leading `#`. Empty if the link dropped it. */
  fragment: string;
  /** A canonical https URL that opens the invite in Armada. */
  openUrl: string;
  /** True when the link is missing its `#fragment` and therefore can't be joined. */
  missingSecret: boolean;
}

/** Whether a decoded naddr names an invite-bundle coordinate (kind 33301, empty `d`). */
function isInviteBundleNaddr(naddr: string): boolean {
  try {
    const decoded = nip19.decode(naddr);
    if (decoded.type !== 'naddr') return false;
    return decoded.data.kind === INVITE_BUNDLE_KIND && decoded.data.identifier === '';
  } catch {
    return false;
  }
}

/**
 * Parse a community invite from a full URL (`…/invite/<naddr>#<fragment>`) or a
 * bare `naddr#fragment`. Returns `undefined` for anything that isn't
 * recognizably an invite-bundle link, so callers can fall through to the
 * generic naddr embed.
 */
export function parseArmadaInvite(input: string): ArmadaInvite | undefined {
  const trimmed = input.trim();

  let naddr: string | undefined;
  let fragment = '';

  if (/^naddr1[023456789acdefghjklmnpqrstuvwxyz]+/i.test(trimmed)) {
    const [head, ...rest] = trimmed.split('#');
    naddr = head;
    fragment = rest.join('#');
  } else {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return undefined;
    }
    if (!url.pathname.startsWith(INVITE_PATH_PREFIX)) return undefined;
    naddr = decodeURIComponent(url.pathname.slice(INVITE_PATH_PREFIX.length)).replace(/\/$/, '');
    fragment = url.hash.replace(/^#/, '');
  }

  if (!naddr || !isInviteBundleNaddr(naddr)) return undefined;

  const openUrl = sanitizeUrl(`${ARMADA_INVITE_BASE}${naddr}${fragment ? `#${fragment}` : ''}`);
  if (!openUrl) return undefined;

  return { naddr, fragment, openUrl, missingSecret: fragment.length === 0 };
}

/** Whether `input` is a community invite link (with or without its `#fragment`). */
export function isArmadaInvite(input: string): boolean {
  return parseArmadaInvite(input) !== undefined;
}
