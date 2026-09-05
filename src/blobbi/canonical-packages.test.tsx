/**
 * Ditto consumes the canonical Blobbi foundation from the sibling blobbi-kit
 * checkout, and exactly one React runtime is in play.
 *
 * Milestone 3 (development): the three packages are npm `file:` links, not
 * published versions, so these checks read the manifest, the lockfile-visible
 * install and the built artifacts to make sure nothing stale wins.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { render } from '@testing-library/react';
import { useState } from 'react';
import { BlobbiRenderer } from '@blobbi/renderer';

const ROOT = process.cwd();
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const installed = (name: string) => join(ROOT, 'node_modules', name);
const manifestOf = (name: string) => JSON.parse(readFileSync(join(installed(name), 'package.json'), 'utf8'));

/** Every bare module specifier a built artifact imports. */
function externalsOf(dir: string): Set<string> {
  const out = new Set<string>();
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) {
        for (const m of readFileSync(full, 'utf8').matchAll(/from\s*["']([^."'][^"']*)["']/g)) out.add(m[1]);
      }
    }
  };
  walk(dir);
  return out;
}

describe('the canonical packages are the local blobbi-kit builds', () => {
  it.each(['@blobbi-kit/core', '@blobbi-kit/react', '@blobbi/renderer'])('%s is a file: link into ../blobbi-kit', (name) => {
    expect(pkg.dependencies[name]).toMatch(/^file:\.\.\/blobbi-kit\/packages\//);
    const real = realpathSync(installed(name));
    expect(real).toContain(`${resolve(ROOT, '..', 'blobbi-kit')}/packages/`);
    expect(existsSync(join(real, 'dist', 'index.js')), `${name}: run \`npm run build\` in blobbi-kit`).toBe(true);
    expect(existsSync(join(real, 'dist', 'index.d.ts'))).toBe(true);
  });

  it('resolves the expected versions, not a stale published copy', () => {
    expect(manifestOf('@blobbi-kit/core').version).toBe('0.5.1');
    expect(manifestOf('@blobbi-kit/react').version).toBe('0.5.1');
    expect(manifestOf('@blobbi/renderer').version).toBe('0.1.0');
  });

  it('the kit no longer needs the nostrify override, and Ditto no longer carries it', () => {
    expect(manifestOf('@blobbi-kit/core').peerDependencies).toBeUndefined();
    expect(Object.keys(manifestOf('@blobbi-kit/react').peerDependencies)).not.toContain('@nostrify/nostrify');
    expect(pkg.overrides['@blobbi-kit/core']).toBeUndefined();
    expect(pkg.overrides['@blobbi-kit/react']).toBeUndefined();
  });
});

describe('package boundaries hold in the built artifacts', () => {
  it('@blobbi/renderer imports React and nothing else: no kit, no Nostr, no Ditto', () => {
    const externals = externalsOf(join(realpathSync(installed('@blobbi/renderer')), 'dist'));
    expect([...externals].sort()).toEqual(['react', 'react/jsx-runtime']);
    expect(Object.keys(manifestOf('@blobbi/renderer').peerDependencies)).toEqual(['react']);
    expect(manifestOf('@blobbi/renderer').dependencies).toBeUndefined();
  });

  it('@blobbi-kit/core imports no renderer and no React', () => {
    const externals = externalsOf(join(realpathSync(installed('@blobbi-kit/core')), 'dist'));
    for (const e of externals) {
      expect(e.startsWith('@blobbi/renderer'), e).toBe(false);
      expect(e === 'react' || e.startsWith('react/'), e).toBe(false);
    }
  });

  it('@blobbi-kit/react depends on core and the React singletons only', () => {
    const externals = externalsOf(join(realpathSync(installed('@blobbi-kit/react')), 'dist'));
    for (const e of externals) {
      expect(
        e.startsWith('@blobbi-kit/core') || ['react', '@nostrify/react', '@tanstack/react-query'].includes(e),
        e,
      ).toBe(true);
    }
  });
});

describe('one React runtime', () => {
  it('the linked packages carry no private React copy', () => {
    for (const name of ['@blobbi-kit/core', '@blobbi-kit/react', '@blobbi/renderer']) {
      expect(existsSync(join(realpathSync(installed(name)), 'node_modules', 'react'))).toBe(false);
    }
  });

  it('Vite pins react/react-dom to this project and dedupes the context singletons', () => {
    const vite = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
    expect(vite).toMatch(/find:\s*"react",\s*replacement:\s*path\.resolve\([^)]*"node_modules\/react"\)/);
    expect(vite).toMatch(/find:\s*"react-dom",\s*replacement:/);
    for (const dep of ['react', 'react-dom', 'react/jsx-runtime', '@nostrify/react', '@tanstack/react-query']) {
      expect(vite).toContain(`'${dep}'`);
    }
  });

  it("a renderer component using hooks mounts inside Ditto's React tree (a second copy would throw)", () => {
    function Host() {
      const [n] = useState(1);
      return (
        <BlobbiRenderer
          visual={{ stage: 'adult', adultType: 'catti', baseColor: '#F2A0C0', eyeColor: '#222222', name: `n${n}` }}
          instanceId="one-react"
          size="md"
        />
      );
    }
    const { container } = render(<Host />);
    expect(container.querySelector('[data-blobbi-renderer]')).not.toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
