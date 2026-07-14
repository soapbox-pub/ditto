import { describe, expect, it, vi } from 'vitest';

const { isNativePlatform } = vi.hoisted(() => ({ isNativePlatform: vi.fn() }));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform },
}));

import { canUseCanvasTiles } from './canvasPlatform';

describe('canUseCanvasTiles', () => {
  it('allows Canvas installation and execution in browsers', () => {
    isNativePlatform.mockReturnValue(false);

    expect(canUseCanvasTiles()).toBe(true);
  });

  it('blocks Canvas installation and execution in Capacitor apps', () => {
    isNativePlatform.mockReturnValue(true);

    expect(canUseCanvasTiles()).toBe(false);
  });
});
