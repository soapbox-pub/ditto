import { describe, expect, it } from 'vitest';
import { nip19 } from 'nostr-tools';

import {
  BADGE_CLAIM_KIND,
  CLAIM_PATH_TAG,
  DITTO_BADGES_ISSUER_PUBKEY,
  DITTO_EXPLORER_BADGE_ATAG,
  DITTO_EXPLORER_BADGE_DTAG,
  DITTO_EXPLORER_CLAIM_ALT,
  DITTO_EXPLORER_CLAIM_PATHS,
  buildExplorerClaimTemplate,
} from './badgeClaim';
import { POST_ONBOARDING_PATH_IDS } from './postOnboardingGuide';
import { parseAddr } from './parseAddr';

describe('badgeClaim constants', () => {
  it('uses an addressable kind (30000–39999)', () => {
    expect(BADGE_CLAIM_KIND).toBeGreaterThanOrEqual(30000);
    expect(BADGE_CLAIM_KIND).toBeLessThan(40000);
  });

  it('builds the a-tag from the issuer pubkey and badge d-tag', () => {
    expect(DITTO_EXPLORER_BADGE_ATAG).toBe(
      `30009:${DITTO_BADGES_ISSUER_PUBKEY}:${DITTO_EXPLORER_BADGE_DTAG}`,
    );
  });

  it('the a-tag is a well-formed addressable coordinate', () => {
    expect(parseAddr(DITTO_EXPLORER_BADGE_ATAG)).toEqual({
      kind: 30009,
      pubkey: DITTO_BADGES_ISSUER_PUBKEY,
      identifier: DITTO_EXPLORER_BADGE_DTAG,
    });
  });

  it('the issuer pubkey is valid 32-byte hex (decodable to npub)', () => {
    expect(() => nip19.npubEncode(DITTO_BADGES_ISSUER_PUBKEY)).not.toThrow();
  });
});

describe('buildExplorerClaimTemplate', () => {
  it('produces the exact expected claim shape with all four paths', () => {
    const template = buildExplorerClaimTemplate(POST_ONBOARDING_PATH_IDS);

    expect(template).toEqual({
      kind: BADGE_CLAIM_KIND,
      content: '',
      tags: [
        ['d', 'ditto-explorer'],
        ['a', '30009:7793d3bf8a1d40d5d0c2097d5b3b8179674fce080f9a9ab2f04fd331e2b95afe:ditto-explorer'],
        ['p', '7793d3bf8a1d40d5d0c2097d5b3b8179674fce080f9a9ab2f04fd331e2b95afe'],
        ['path', 'find-people'],
        ['path', 'post-small'],
        ['path', 'customize'],
        // `explore`, not `interact`. The task was renamed; the wire value was
        // not, because it is the published spec the award server validates.
        ['path', 'explore'],
        ['alt', DITTO_EXPLORER_CLAIM_ALT],
      ],
    });
  });

  it('has empty content (tag-only event)', () => {
    expect(buildExplorerClaimTemplate([]).content).toBe('');
  });

  it('d-tag equals the badge d-tag for addressable idempotency', () => {
    const template = buildExplorerClaimTemplate(POST_ONBOARDING_PATH_IDS);
    const dTag = template.tags.find(([n]) => n === 'd')?.[1];
    expect(dTag).toBe(DITTO_EXPLORER_BADGE_DTAG);
  });

  it('emits one path tag per completed path, in the given order', () => {
    const template = buildExplorerClaimTemplate(['interact', 'customize']);
    const paths = template.tags.filter(([n]) => n === 'path').map(([, v]) => v);
    expect(paths).toEqual(['explore', 'customize']);
  });

  it('omits path tags when none are completed', () => {
    const template = buildExplorerClaimTemplate([]);
    expect(template.tags.some(([n]) => n === 'path')).toBe(false);
  });

  it('always includes the NIP-31 alt tag', () => {
    const template = buildExplorerClaimTemplate([]);
    expect(template.tags).toContainEqual(['alt', DITTO_EXPLORER_CLAIM_ALT]);
  });

  it('points the p tag at the issuer (so the server can filter by #p)', () => {
    const template = buildExplorerClaimTemplate([]);
    const p = template.tags.find(([n]) => n === 'p')?.[1];
    expect(p).toBe(DITTO_BADGES_ISSUER_PUBKEY);
  });
});

/**
 * The regression this file exists for.
 *
 * The fourth task was renamed `explore` → `interact` in the product, and the
 * claim serialized internal task ids straight onto the wire. Real claims went
 * out with no `explore` path and the award server rejected every one of them:
 * `validation failed ... reason=missing path: explore`.
 */
describe('published claim vocabulary (kind 30637 `path`)', () => {
  it('a fully completed journey carries every path the spec requires', () => {
    const paths = buildExplorerClaimTemplate(POST_ONBOARDING_PATH_IDS)
      .tags.filter(([n]) => n === 'path')
      .map(([, v]) => v);

    for (const required of DITTO_EXPLORER_CLAIM_PATHS) {
      expect(paths).toContain(required);
    }
    expect(paths).toEqual([...DITTO_EXPLORER_CLAIM_PATHS]);
  });

  it('includes `explore` — the exact tag the award server was missing', () => {
    const template = buildExplorerClaimTemplate(POST_ONBOARDING_PATH_IDS);
    expect(template.tags).toContainEqual(['path', 'explore']);
  });

  it('never publishes the internal task id `interact` on the wire', () => {
    const template = buildExplorerClaimTemplate(POST_ONBOARDING_PATH_IDS);
    expect(template.tags).not.toContainEqual(['path', 'interact']);
  });

  it('names a wire value for every task id, and each exactly once', () => {
    // An added or renamed task is a type error at `CLAIM_PATH_TAG`; this covers
    // the other half — two tasks quietly sharing one wire value, which would
    // make a 3/4 journey indistinguishable from a complete one.
    const values = POST_ONBOARDING_PATH_IDS.map((id) => CLAIM_PATH_TAG[id]);
    expect(values.filter(Boolean)).toHaveLength(POST_ONBOARDING_PATH_IDS.length);
    expect(new Set(values).size).toBe(values.length);
  });

  it('the required-path list is exactly what a complete journey produces', () => {
    expect([...DITTO_EXPLORER_CLAIM_PATHS]).toEqual(
      POST_ONBOARDING_PATH_IDS.map((id) => CLAIM_PATH_TAG[id]),
    );
  });

  it('collapses duplicates rather than emitting a repeated path tag', () => {
    const template = buildExplorerClaimTemplate([
      'interact',
      'interact',
      'customize',
      'customize',
    ]);
    const paths = template.tags.filter(([n]) => n === 'path').map(([, v]) => v);
    expect(paths).toEqual(['explore', 'customize']);
  });

  it('an incomplete journey is visibly incomplete on the wire', () => {
    // The award server's whole job is to tell these apart, so a partial claim
    // must never accidentally satisfy the required set.
    const paths = buildExplorerClaimTemplate(['find-people', 'post-small', 'customize'])
      .tags.filter(([n]) => n === 'path')
      .map(([, v]) => v);
    expect(paths).not.toContain('explore');
    expect(DITTO_EXPLORER_CLAIM_PATHS.every((p) => paths.includes(p))).toBe(false);
  });
});
