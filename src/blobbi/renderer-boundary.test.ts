/**
 * Import boundaries after the canonical renderer migration.
 *
 *  - Ditto keeps no copy of the base body engine (artwork, customizers,
 *    loaders, id namespacing); the only body source is `canonical-base.ts`.
 *  - Ditto reaches the packages through their public entry points only.
 *  - Ditto's expression, eye and companion layers stay Ditto-local and do not
 *    leak into the packages (the packages import nothing from Ditto by
 *    construction; `canonical-packages.test.tsx` checks their artifacts).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

function files(dir: string, ext = /\.tsx?$/): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : files(full, ext);
    return ext.test(e.name) ? [full] : [];
  });
}
const rel = (f: string) => f.replace(`${ROOT}/`, '');
const SOURCES = files(SRC).filter((f) => !/\.test\.tsx?$/.test(f));
const specifiersOf = (file: string) =>
  [...readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);

describe('the duplicated base engine is gone', () => {
  it('the old module directories no longer exist', () => {
    for (const dir of ['src/blobbi/adult-blobbi', 'src/blobbi/baby-blobbi']) {
      expect(existsSync(join(ROOT, dir)), dir).toBe(false);
    }
    for (const f of ['src/blobbi/ui/lib/svg/ids.ts', 'src/blobbi/ui/lib/svg/container.ts']) {
      expect(existsSync(join(ROOT, f)), f).toBe(false);
    }
  });

  it('no source defines or imports a base-engine symbol', () => {
    const forbidden = /\b(ADULT_SVG_MAP|BABY_BASE_SVG|BABY_SLEEPING_SVG|customizeAdultSvg|customizeBabySvg|resolveAdultSvg|resolveBabySvg|getAdultBaseSvg|getBabyBaseSvg|uniquifySvgIds|ensureSvgFillsContainer)\b/;
    const offenders = SOURCES.filter((f) => forbidden.test(readFileSync(f, 'utf8'))).map(rel);
    expect(offenders).toEqual([]);
    const importers = SOURCES.filter((f) => specifiersOf(f).some((s) => /blobbi\/(adult-blobbi|baby-blobbi)|ui\/lib\/svg\/(ids|container)/.test(s))).map(rel);
    expect(importers).toEqual([]);
  });

  it('exactly one production module asks the renderer for a body', () => {
    const bodyCallers = SOURCES.filter((f) => /\brenderBlobbiSvg\s*\(|\bloadBlobbiSvg\s*\(/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(bodyCallers).toEqual(['src/blobbi/ui/lib/canonical-base.ts']);
  });
});

describe('packages are consumed through their public entry points', () => {
  it('no deep import into @blobbi/renderer internals', () => {
    const deep = SOURCES.filter((f) => specifiersOf(f).some((s) => s.startsWith('@blobbi/renderer/'))).map(rel);
    expect(deep).toEqual([]);
  });

  it('the renderer is used by the visual layer and by nothing in the domain or companion behaviour', () => {
    const users = SOURCES.filter((f) => specifiersOf(f).includes('@blobbi/renderer')).map(rel);
    expect(users.length).toBeGreaterThan(0);
    for (const u of users) {
      expect(u.startsWith('src/blobbi/ui/'), `${u} should not import the renderer`).toBe(true);
    }
  });

  it('Ditto-owned layers stay Ditto-owned: eye hooks, recipes, egg and companion behaviour live in src/', () => {
    for (const f of [
      'src/blobbi/ui/lib/useBlobbiEyes.ts',
      'src/blobbi/ui/lib/useExternalEyeOffset.ts',
      'src/blobbi/ui/lib/eye-animation.ts',
      'src/blobbi/ui/lib/recipe.ts',
      'src/blobbi/ui/lib/status-reactions.ts',
      'src/blobbi/egg/components/EggGraphic.tsx',
      'src/blobbi/companion/hooks/useBlobbiCompanionMotion.ts',
    ]) {
      expect(existsSync(join(ROOT, f)), f).toBe(true);
    }
  });
});
