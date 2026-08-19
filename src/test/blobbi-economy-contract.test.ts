import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';

/**
 * Blobbi economy source contracts (Ditto 1, economy reset).
 *
 * After the Blobbi Kit 0.4.0 migration, Ditto must not author, read, or manage
 * a Blobbonaut Coin balance. Legacy `["coins", ...]` tags on kind:11125
 * profiles are opaque historical data: compatible republish helpers carry them
 * through verbatim, but no Ditto writer may author or interpret one.
 *
 * The active Coin economy is owned by Blobbi Island, outside Ditto, and Ditto
 * implements no wallet for it. This repository holds no canonical
 * specification for how Island stores that balance, so these guards assert
 * only what Ditto itself guarantees — they deliberately do not pin an Island
 * event kind or storage layout.
 *
 * These are repository-level guards over PRODUCTION sources only. Test files,
 * fixtures, and this contract file itself are excluded so that
 * legacy-tag-preservation tests (which legitimately contain coins fixtures)
 * don't trip the scan.
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

interface Source {
  path: string;
  text: string;
}

/** Every source file, walked and read exactly once for the whole suite. */
const allSources: readonly Source[] = walk(SRC)
  .filter((f) => /\.(ts|tsx)$/.test(f))
  .map((path) => ({ path, text: readFileSync(path, 'utf8') }));

/** Production sources: no tests, no test harness/fixtures. */
const productionSources = allSources.filter(
  ({ path }) =>
    !/\.(test|spec)\.(ts|tsx)$/.test(path) &&
    !path.startsWith(SRC + sep + 'test' + sep),
);

/**
 * Production sources that own Blobbi state: the Blobbi feature tree plus the
 * Blobbi/Blobbonaut-specific modules living outside it (BlobbiPage,
 * BlobbiWidget, the useBlobbonautProfile hooks).
 *
 * Coin-*field* scans are scoped here on purpose. The contract is about the
 * Blobbonaut profile economy, so unrelated future code — a Cashu wallet's
 * `wallet.coins`, say — must not be able to fail a Blobbi contract test.
 */
const blobbiProductionSources = productionSources.filter(({ path }) =>
  /blobb/i.test(path.slice(SRC.length)),
);

const rel = (sources: readonly Source[]) =>
  sources.map(({ path }) => path.slice(ROOT.length + 1));

const matching = (sources: readonly Source[], pattern: RegExp) =>
  sources.filter(({ text }) => pattern.test(text));

/** Look up one already-read source by repo-relative path. */
function sourceText(relPath: string): string {
  const full = resolve(ROOT, relPath);
  const hit = allSources.find(({ path }) => path === full);
  if (!hit) throw new Error(`${relPath} not found under src/`);
  return hit.text;
}

// ─── Coin authoring / reading ────────────────────────────────────────────────

describe('no production Ditto source touches Blobbi Coins', () => {
  it('never authors a ["coins", ...] tag', () => {
    // A `coins` Nostr tag literal is unambiguous, so this stays repo-wide.
    expect(rel(matching(productionSources, /\[\s*['"]coins['"]\s*,/))).toEqual([]);
  });

  it('never reads the legacy coins field off a Blobbonaut profile', () => {
    // Kit 0.4.0 removed `BlobbonautProfile.coins`. The contract is that no
    // Ditto code consumes it — not that the token `.coins` may never appear
    // anywhere in the repository.
    const profileCoinsAccess = /\w*[Pp]rofile\s*\??\.\s*coins\b/;
    expect(rel(matching(blobbiProductionSources, profileCoinsAccess))).toEqual([]);
  });

  it('never references the legacy Coin-cost constants', () => {
    const pattern =
      /INITIAL_BLOBBONAUT_COINS|BLOBBI_ADOPTION_COST|BLOBBI_PREVIEW_REROLL_COST/;
    expect(rel(matching(productionSources, pattern))).toEqual([]);
  });

  it('does not own or manage the Blobbi Island wallet', () => {
    // Ditto neither reads nor writes Island's economy. Asserted on the explicit
    // `blobbi:island` identifier only: no Island event kind is pinned here,
    // because this repository carries no canonical spec to pin one against.
    expect(rel(matching(productionSources, /blobbi:island/))).toEqual([]);
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
    const offenders = allSources.filter(
      ({ path, text }) => path !== SELF && pattern.test(text),
    );
    expect(rel(offenders)).toEqual([]);
  });
});

// ─── Live onboarding stays reachable ─────────────────────────────────────────

describe('the live hatching ceremony', () => {
  it('remains reachable from BlobbiPage via the onboarding barrel', () => {
    const barrel = sourceText('src/blobbi/onboarding/index.ts');
    expect(barrel).toContain('export { BlobbiOnboardingFlow }');
    expect(barrel).toContain('export { BlobbiHatchingCeremony }');
    const page = sourceText('src/pages/BlobbiPage.tsx');
    expect(page).toMatch(/import \{ BlobbiOnboardingFlow \} from '@\/blobbi\/onboarding'/);
    expect(page).toContain('<BlobbiOnboardingFlow');
  });
});
