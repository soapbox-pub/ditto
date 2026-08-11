/**
 * Ditto Badge Claim (kind 30637).
 *
 * A public, addressable event a user publishes to *request* a NIP-58 badge
 * award. Ditto's badge progress for the post-onboarding "Ditto Explorer" badge
 * lives in the user's private, encrypted NIP-78 settings — which a badge-award
 * server can never read. So when the user finishes the guide and explicitly
 * asks for the reward (the reveal gesture in the reward ceremony, which says it
 * publishes publicly before it does), the client publishes this public claim
 * event. A future server listens for it and, after validation, issues the
 * NIP-58 kind 8 award from the Ditto Badges issuer key.
 *
 * The kind is **addressable** (30000–39999) keyed by `(pubkey, kind, d)` where
 * `d` is the badge's d-tag. This makes a claim naturally idempotent: re-clicking
 * (or claiming from another device) replaces the prior claim for the same badge
 * rather than spawning duplicates.
 *
 * This module is intentionally award-free: it only builds and describes the
 * claim. Award/accept logic (NIP-58 kind 8 / 10008) is out of scope here and
 * will be performed by the server.
 */

import { BADGE_DEFINITION_KIND } from '@/lib/badgeUtils';
import type { PostOnboardingPathId } from '@/lib/postOnboardingGuide';

/** Addressable kind for a Ditto badge claim. See NIP.md. */
export const BADGE_CLAIM_KIND = 30637;

/**
 * The Ditto Badges issuer pubkey — the key that created (and will award) the
 * Ditto Explorer badge definition. Hex, lowercase.
 */
export const DITTO_BADGES_ISSUER_PUBKEY =
  '7793d3bf8a1d40d5d0c2097d5b3b8179674fce080f9a9ab2f04fd331e2b95afe';

/** The Ditto Explorer badge's d-tag identifier (matches the kind 30009 `d`). */
export const DITTO_EXPLORER_BADGE_DTAG = 'ditto-explorer';

/** Display name of the Ditto Explorer badge. */
export const DITTO_EXPLORER_BADGE_NAME = 'Ditto Explorer';

/**
 * The Ditto Explorer badge image, from the published kind 30009 definition.
 *
 * **Never render this directly.** It is a picture of the reward itself, so
 * showing it before the journey is finished gives away the thing the journey is
 * building towards — and desaturating it does not help, because the shape is
 * the spoiler. Every use goes through `ExplorerRewardArt` in `MissionArt`,
 * which crops and blurs it past recognition while the reward is sealed and
 * shows it plainly only once `revealedAt` is down. `/badges` renders the real
 * image from the badge event, separately, once it has actually been issued.
 */
export const DITTO_EXPLORER_BADGE_IMAGE =
  'https://blossom.ditto.pub/cfcae6ec5919460d562edab918af9d71f6197557689542f42a3b6659acd0880f.png';

/**
 * Canonical `a`-tag coordinate of the Ditto Explorer badge definition
 * (`30009:<issuer>:ditto-explorer`). This is the value the future server will
 * filter on (`"#a"`).
 */
export const DITTO_EXPLORER_BADGE_ATAG =
  `${BADGE_DEFINITION_KIND}:${DITTO_BADGES_ISSUER_PUBKEY}:${DITTO_EXPLORER_BADGE_DTAG}`;

/** NIP-31 human-readable fallback for a Ditto Explorer claim event. */
export const DITTO_EXPLORER_CLAIM_ALT = 'Claim for the Ditto Explorer badge';

/** Template returned by {@link buildExplorerClaimTemplate}, ready for publishing. */
export interface BadgeClaimTemplate {
  kind: number;
  content: string;
  tags: string[][];
}

/**
 * Build the (unsigned) Ditto Explorer claim event template.
 *
 * Shape (per the badge-claim NIP entry):
 *   - `d`    → the badge d-tag (`ditto-explorer`) — makes the claim addressable.
 *   - `a`    → the badge definition coordinate (`30009:<issuer>:ditto-explorer`).
 *   - `p`    → the issuer pubkey, so the server can also filter by `#p`.
 *   - `path` → one tag per completed guide path (public, non-sensitive).
 *   - `alt`  → NIP-31 fallback.
 *
 * `content` is empty by convention (this is a tag-only event).
 *
 * @param completedPaths Completed guide path ids, in their canonical order.
 */
export function buildExplorerClaimTemplate(
  completedPaths: readonly PostOnboardingPathId[],
): BadgeClaimTemplate {
  return {
    kind: BADGE_CLAIM_KIND,
    content: '',
    tags: [
      ['d', DITTO_EXPLORER_BADGE_DTAG],
      ['a', DITTO_EXPLORER_BADGE_ATAG],
      ['p', DITTO_BADGES_ISSUER_PUBKEY],
      ...completedPaths.map((path) => ['path', path]),
      ['alt', DITTO_EXPLORER_CLAIM_ALT],
    ],
  };
}
