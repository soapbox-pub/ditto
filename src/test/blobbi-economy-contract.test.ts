import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';

/**
 * Blobbi economy source contracts (Ditto 1, economy reset).
 *
 * The active Blobbi Coin balance lives exclusively in Blobbi Island
 * (kind:31633, d=blobbi:island). Ditto must not grant, spend, or read
 * Blobbi Coins, and must not implement an Island wallet. Legacy
 * ["coins", ...] tags on kind:11125 profiles are opaque historical data:
 * compatible republish helpers may carry them through verbatim, but no
 * Ditto writer may author or interpret one.
 *
 * These are repository-level guards over PRODUCTION sources only. Test
 * files, fixtures, and this contract file itself are excluded so that
 * legacy-tag-preservation tests (which legitimately contain coins
 * fixtures) don't trip the scan.
 */

const ROOT = process.cwd();
const SRC = resolve(ROOT, 'src');
const SELF = resolve(ROOT, 'src/test/blobbi-economy-contract.test.ts');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

const allSourceFiles = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));

/** Production sources: no tests, no test harness/fixtures. */
const productionFiles = allSourceFiles.filter(
  (f) =>
    !/\.(test|spec)\.(ts|tsx)$/.test(f) &&
    !f.startsWith(SRC + sep + 'test' + sep),
);

const read = (f: string) => readFileSync(f, 'utf8');

function productionFilesMatching(pattern: RegExp): string[] {
  return productionFiles.filter((f) => pattern.test(read(f)));
}

const rel = (files: string[]) => files.map((f) => f.slice(ROOT.length + 1));

// ─── Coin authoring / reading ────────────────────────────────────────────────

describe('no production Ditto source touches Blobbi Coins', () => {
  it('never authors a ["coins", ...] tag', () => {
    expect(rel(productionFilesMatching(/\[\s*['"]coins['"]\s*,/))).toEqual([]);
  });

  it('never reads a .coins field', () => {
    expect(rel(productionFilesMatching(/\.coins\b/))).toEqual([]);
  });

  it('never references the legacy Coin-cost constants', () => {
    const pattern =
      /INITIAL_BLOBBONAUT_COINS|BLOBBI_ADOPTION_COST|BLOBBI_PREVIEW_REROLL_COST/;
    expect(rel(productionFilesMatching(pattern))).toEqual([]);
  });

  it('does not implement the Island economy wallet (kind:31633 / d=blobbi:island)', () => {
    expect(rel(productionFilesMatching(/31633|blobbi:island/))).toEqual([]);
  });
});

// ─── Deleted legacy onboarding economy ───────────────────────────────────────

const DELETED_MODULES = [
  'src/blobbi/onboarding/hooks/useBlobbiOnboarding.ts',
  'src/blobbi/onboarding/components/BlobbiAdoptionStep.tsx',
  'src/blobbi/onboarding/components/BlobbiEggPreviewCard.tsx',
  'src/blobbi/onboarding/components/BlobbiAdoptionConfirmDialog.tsx',
];

const DELETED_IDENTIFIERS = [
  'useBlobbiOnboarding',
  'BlobbiAdoptionStep',
  'BlobbiEggPreviewCard',
  'BlobbiAdoptionConfirmDialog',
];

describe('the Coin-funded adoption/reroll onboarding is fully deleted', () => {
  it('the dead modules no longer exist on disk', () => {
    for (const mod of DELETED_MODULES) {
      expect(existsSync(resolve(ROOT, mod)), `${mod} should be deleted`).toBe(false);
    }
  });

  it('no source (production or test) still imports or exports them', () => {
    const pattern = new RegExp(DELETED_IDENTIFIERS.join('|'));
    const offenders = allSourceFiles.filter(
      (f) => f !== SELF && pattern.test(read(f)),
    );
    expect(rel(offenders)).toEqual([]);
  });
});

// ─── Live onboarding stays reachable and safe ────────────────────────────────

describe('the live hatching ceremony', () => {
  const ceremonyPath = resolve(
    ROOT,
    'src/blobbi/onboarding/components/BlobbiHatchingCeremony.tsx',
  );
  const barrelPath = resolve(ROOT, 'src/blobbi/onboarding/index.ts');
  const pagePath = resolve(ROOT, 'src/pages/BlobbiPage.tsx');

  it('remains reachable from BlobbiPage via the onboarding barrel', () => {
    const barrel = read(barrelPath);
    expect(barrel).toContain("export { BlobbiOnboardingFlow }");
    expect(barrel).toContain("export { BlobbiHatchingCeremony }");
    const page = read(pagePath);
    expect(page).toMatch(/import \{ BlobbiOnboardingFlow \} from '@\/blobbi\/onboarding'/);
    expect(page).toContain('<BlobbiOnboardingFlow');
  });

  it('establishes profile absence with a fresh relay read, not a cache miss', () => {
    const ceremony = read(ceremonyPath);
    // The setup path must consult fetchFreshBlobbonautProfile before it may
    // create a base profile (plus the merge and completion paths).
    const calls = ceremony.match(/fetchFreshBlobbonautProfile\(nostr, user\.pubkey\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });
});
