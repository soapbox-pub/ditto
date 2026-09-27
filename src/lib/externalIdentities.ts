import type { NostrEvent } from '@nostrify/nostrify';

import { sanitizeUrl } from '@/lib/sanitizeUrl';

/** NIP-39 external identities list. */
export const EXTERNAL_IDENTITIES_KIND = 10011;

/** Claim types defined by NIP-39 that Ditto knows how to link to. */
export type ExternalIdentityPlatform = 'github' | 'twitter' | 'mastodon' | 'telegram' | 'bluesky' | 'discord';

export interface ExternalIdentity {
  platform: ExternalIdentityPlatform;
  /** Identity on the platform, as it appears in the `i` tag. */
  identity: string;
  /** Proof value, as it appears in the `i` tag. */
  proof: string;
  /** Human-readable handle, e.g. `@alice@mastodon.social`. */
  label: string;
  /** Link to the remote profile, or to the proof when the platform has no profile URL for the identity. */
  url: string;
  /** Link to the proof post/gist/message. */
  proofUrl: string;
}

/** Display names for each platform. Brand names, so not translated. */
export const EXTERNAL_IDENTITY_PLATFORM_NAMES: Record<ExternalIdentityPlatform, string> = {
  github: 'GitHub',
  twitter: 'Twitter',
  mastodon: 'Mastodon',
  telegram: 'Telegram',
  bluesky: 'Bluesky',
  discord: 'Discord',
};

const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

type Resolver = (identity: string, proof: string) => Omit<ExternalIdentity, 'platform' | 'identity' | 'proof'> | undefined;

/**
 * Build URLs for each claim type. Tag values are untrusted, so every identity
 * and proof is checked against the platform's allowed alphabet before it is
 * interpolated into a URL — that keeps path segments from smuggling in `/`,
 * `?`, `#`, or a different host.
 */
const RESOLVERS: Record<ExternalIdentityPlatform, Resolver> = {
  github: (identity, proof) => {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,38})$/i.test(identity) || !/^[a-f0-9]+$/i.test(proof)) return;
    return {
      label: identity,
      url: `https://github.com/${identity}`,
      proofUrl: `https://gist.github.com/${identity}/${proof}`,
    };
  },
  twitter: (identity, proof) => {
    if (!/^[a-z0-9_]{1,15}$/i.test(identity) || !/^\d+$/.test(proof)) return;
    return {
      label: `@${identity}`,
      url: `https://x.com/${identity}`,
      proofUrl: `https://x.com/${identity}/status/${proof}`,
    };
  },
  mastodon: (identity, proof) => {
    const match = /^([^/]+)\/@([a-z0-9_]+)$/i.exec(identity);
    if (!match || !HOSTNAME.test(match[1]) || !/^[a-z0-9]+$/i.test(proof)) return;
    const [, instance, username] = match;
    return {
      label: `@${username}@${instance}`,
      url: `https://${instance}/@${username}`,
      proofUrl: `https://${instance}/@${username}/${proof}`,
    };
  },
  telegram: (identity, proof) => {
    // The identity is a numeric user ID, which has no public profile URL,
    // so both links point at the proof message.
    if (!/^\d+$/.test(identity) || !/^[a-z0-9_]+\/\d+$/i.test(proof)) return;
    const proofUrl = `https://t.me/${proof}`;
    return { label: EXTERNAL_IDENTITY_PLATFORM_NAMES.telegram, url: proofUrl, proofUrl };
  },
  bluesky: (identity, proof) => {
    if (!HOSTNAME.test(identity) || !/^[a-z0-9._:~-]+$/i.test(proof)) return;
    return {
      label: `@${identity}`,
      url: `https://bsky.app/profile/${identity}`,
      proofUrl: `https://bsky.app/profile/${identity}/post/${proof}`,
    };
  },
  discord: (identity, proof) => {
    // Discord has no public profile URL for a username, so link the proof message.
    if (!/^[a-z0-9_.]{2,32}$/i.test(identity) || !/^\d+\/\d+\/\d+$/.test(proof)) return;
    const proofUrl = `https://discord.com/channels/${proof}`;
    return { label: identity, url: proofUrl, proofUrl };
  },
};

function isPlatform(value: string): value is ExternalIdentityPlatform {
  return Object.prototype.hasOwnProperty.call(RESOLVERS, value);
}

/**
 * Parse the `i` tags of a NIP-39 kind 10011 event into linkable identities.
 * Unknown platforms and malformed claims are dropped. Duplicate claims are
 * collapsed, and the result is capped so a hostile event can't flood the UI.
 */
export function parseExternalIdentities(event: NostrEvent | undefined): ExternalIdentity[] {
  if (!event) return [];

  const results: ExternalIdentity[] = [];
  const seen = new Set<string>();

  for (const [name, claim, proof] of event.tags) {
    if (name !== 'i' || typeof claim !== 'string' || typeof proof !== 'string') continue;

    const sep = claim.indexOf(':');
    if (sep === -1) continue;
    const platform = claim.slice(0, sep);
    const identity = claim.slice(sep + 1);
    if (!isPlatform(platform)) continue;

    const resolved = RESOLVERS[platform](identity, proof);
    if (!resolved) continue;

    const url = sanitizeUrl(resolved.url);
    const proofUrl = sanitizeUrl(resolved.proofUrl);
    if (!url || !proofUrl) continue;

    const key = `${platform}:${identity.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({ platform, identity, proof, label: resolved.label, url, proofUrl });
    if (results.length >= 20) break;
  }

  return results;
}
