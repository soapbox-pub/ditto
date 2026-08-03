import { describe, it, expect, afterEach, vi } from 'vitest';

import { publicAssetUrl } from './publicAssetUrl';

describe('publicAssetUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('joins a trailing-slash base with a root-relative path', () => {
    vi.stubEnv('BASE_URL', '/ditto/');
    expect(publicAssetUrl('/logo.svg')).toBe('/ditto/logo.svg');
  });

  it('joins a base with no trailing slash without losing the separator', () => {
    // Some deploy pipelines override `base` via a CLI flag whose computed
    // value omits the trailing slash, unlike Vite's own default.
    vi.stubEnv('BASE_URL', '/ditto');
    expect(publicAssetUrl('/logo.svg')).toBe('/ditto/logo.svg');
  });

  it('resolves to a root-relative path when BASE_URL is just "/"', () => {
    vi.stubEnv('BASE_URL', '/');
    expect(publicAssetUrl('/logo.svg')).toBe('/logo.svg');
  });
});
