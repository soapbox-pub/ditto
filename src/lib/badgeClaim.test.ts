import { describe, expect, it } from 'vitest';
import { nip19 } from 'nostr-tools';

import {
  BADGE_CLAIM_KIND,
  DITTO_BADGES_ISSUER_PUBKEY,
  DITTO_EXPLORER_BADGE_ATAG,
  DITTO_EXPLORER_BADGE_DTAG,
  DITTO_EXPLORER_CLAIM_ALT,
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
    const template = buildExplorerClaimTemplate(['explore', 'customize']);
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
