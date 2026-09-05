/**
 * Ditto consumes the canonical Blobbi foundation from npm, and exactly one
 * React runtime is in play.
 *
 * The three packages are published from the blobbi-kit repository:
 *
 *   @blobbi-kit/core      domain: parsing, identity, visual identity
 *   @blobbi-kit/react     headless hooks (peers: core, react, query, nostrify/react)
 *   @blobbi-kit/renderer  the body renderer (peer: react only)
 *
 * These checks read Ditto's manifest, the installed package manifests and the
 * installed artifacts, so a stale specifier, a leftover development link or a
 * package that grew a dependency it must not have fails here rather than in a
 * host build.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { useState } from 'react';
import { BlobbiRenderer } from '@blobbi-kit/renderer';

const ROOT = process.cwd();
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const lockfile = readFileSync(join(ROOT, 'package-lock.json'), 'utf8');
const installed = (name: string) => join(ROOT, 'node_modules', name);
const manifestOf = (name: string) => JSON.parse(readFileSync(join(installed(name), 'package.json'), 'utf8'));

const CANONICAL = {
  '@blobbi-kit/core': { range: '^0.5.1', version: '0.5.1' },
  '@blobbi-kit/react': { range: '^0.5.1', version: '0.5.1' },
  '@blobbi-kit/renderer': { range: '^0.1.0', version: '0.1.0' },
} as const;

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

describe('the canonical packages are registry dependencies', () => {
  it.each(Object.entries(CANONICAL))('%s is declared at its registry range and installed at the expected version', (name, expected) => {
    expect(pkg.dependencies[name]).toBe(expected.range);
    expect(manifestOf(name).version).toBe(expected.version);
    // Installed as a real package under this project, not a link elsewhere.
    expect(realpathSync(installed(name))).toBe(installed(name));
    expect(existsSync(join(installed(name), 'dist', 'index.js'))).toBe(true);
    expect(existsSync(join(installed(name), 'dist', 'index.d.ts'))).toBe(true);
  });

  it('no Blobbi dependency is a development link, and the old renderer name is gone', () => {
    const declared = { ...pkg.dependencies, ...pkg.devDependencies, ...(pkg.overrides ?? {}) };
    for (const [name, spec] of Object.entries(declared)) {
      if (name.startsWith('@blobbi')) expect(String(spec), name).not.toMatch(/^file:/);
    }
    expect(declared['@blobbi/renderer']).toBeUndefined();
    expect(lockfile).not.toContain('../blobbi-kit');
    expect(lockfile).not.toContain('@blobbi/renderer');
  });

  it('no 0.4.x Blobbi package remains anywhere in the install', () => {
    expect(lockfile).not.toMatch(/@blobbi-kit\/(?:core|react)\/-\/(?:core|react)-0\.4\./);
    for (const name of Object.keys(CANONICAL)) expect(manifestOf(name).version.startsWith('0.4.')).toBe(false);
  });

  it('the kit needs no nostrify override, and Ditto carries none', () => {
    expect(manifestOf('@blobbi-kit/core').peerDependencies).toBeUndefined();
    expect(Object.keys(manifestOf('@blobbi-kit/react').peerDependencies)).not.toContain('@nostrify/nostrify');
    expect(pkg.overrides?.['@blobbi-kit/core']).toBeUndefined();
    expect(pkg.overrides?.['@blobbi-kit/react']).toBeUndefined();
  });
});

describe('package boundaries hold in the installed artifacts', () => {
  it('@blobbi-kit/renderer imports React and nothing else: no kit, no Nostr, no Ditto', () => {
    const externals = externalsOf(join(installed('@blobbi-kit/renderer'), 'dist'));
    expect([...externals].sort()).toEqual(['react', 'react/jsx-runtime']);
    expect(Object.keys(manifestOf('@blobbi-kit/renderer').peerDependencies)).toEqual(['react']);
    expect(manifestOf('@blobbi-kit/renderer').dependencies).toBeUndefined();
  });

  it('@blobbi-kit/core imports no renderer and no React; its only dependency is @noble/hashes', () => {
    const externals = externalsOf(join(installed('@blobbi-kit/core'), 'dist'));
    for (const e of externals) {
      expect(e.startsWith('@blobbi-kit/renderer'), e).toBe(false);
      expect(e === 'react' || e.startsWith('react/'), e).toBe(false);
    }
    expect(Object.keys(manifestOf('@blobbi-kit/core').dependencies)).toEqual(['@noble/hashes']);
  });

  it('@blobbi-kit/react depends on core and the React singletons only', () => {
    const externals = externalsOf(join(installed('@blobbi-kit/react'), 'dist'));
    for (const e of externals) {
      expect(
        e.startsWith('@blobbi-kit/core') || ['react', '@nostrify/react', '@tanstack/react-query'].includes(e),
        e,
      ).toBe(true);
    }
    expect(manifestOf('@blobbi-kit/react').peerDependencies['@blobbi-kit/core']).toBe('^0.5.1');
  });
});

describe('one React runtime', () => {
  it('no installed Blobbi package carries a private React copy', () => {
    for (const name of Object.keys(CANONICAL)) {
      expect(existsSync(join(installed(name), 'node_modules', 'react'))).toBe(false);
    }
  });

  it('Vite dedupes the React and context singletons', () => {
    const vite = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
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
