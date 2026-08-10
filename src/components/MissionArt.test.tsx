import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { RevealedRewardArt, SealedRewardArt } from './MissionArt';
import { DITTO_EXPLORER_BADGE_IMAGE } from '@/lib/badgeClaim';

vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => ({ config: { appId: 'ditto', appName: 'Ditto' } }),
}));
vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: undefined }) }));

/**
 * The sealed reward is the badge artwork, obscured — so the interesting
 * assertions are about *what it refuses to be*: legible, load-bearing, or
 * missing when the network is.
 *
 * Nothing here pins a blur radius or a crop factor to a number. Those are design
 * decisions tuned against the actual artwork, and a test that froze them would
 * only ever be an obstacle to tuning them. What is pinned is that a crop and a
 * blur exist, that the blur tracks the rendered size, and that the treatment
 * cannot be bypassed.
 */
describe('SealedRewardArt', () => {
  function sealed(props: Parameters<typeof SealedRewardArt>[0] = {}) {
    const { container } = render(<SealedRewardArt {...props} />);
    return {
      container,
      root: container.querySelector('[data-sealed-reward-art]')!,
      image: container.querySelector<HTMLImageElement>('[data-sealed-reward-image]'),
    };
  }

  it('renders the real badge artwork, and only through the seal', () => {
    const { root, image } = sealed();
    expect(image).not.toBeNull();
    expect(image!.getAttribute('src')).toBe(DITTO_EXPLORER_BADGE_IMAGE);
    expect(image!.closest('[data-sealed-reward-art]')).toBe(root);
  });

  it('crops past the recognisable subject and blurs what is left', () => {
    const { image } = sealed();
    // A crop of at least 2×: the astronaut's visor survives a sane blur as a
    // dark mass, so the frame has to land somewhere it isn't.
    const scale = Number(image!.style.transform.match(/scale\(([\d.]+)\)/)![1]);
    expect(scale).toBeGreaterThanOrEqual(2);
    expect(image!.style.filter).toMatch(/blur\(/);
    expect(image!.style.filter).toMatch(/saturate\(/);
  });

  it('scales the blur with the rendered size, so growing cannot weaken it', () => {
    // The failure this prevents: a radius tuned on the 112px card leaving the
    // artwork legible at the size the reveal will use.
    const small = Number(sealed({ size: 112 }).image!.style.filter.match(/blur\(([\d.]+)px\)/)![1]);
    const large = Number(sealed({ size: 320 }).image!.style.filter.match(/blur\(([\d.]+)px\)/)![1]);

    expect(large).toBeGreaterThan(small);
    // Proportional, not merely bigger: the same apparent softness at both sizes.
    expect(large / small).toBeCloseTo(320 / 112, 1);
  });

  it('renders at whatever size it is asked for', () => {
    for (const size of [112, 260, 320]) {
      const { root } = sealed({ size });
      expect(root).toHaveStyle({ width: `${size}px`, height: `${size}px` });
    }
  });

  it('is decorative, and hidden from assistive technology', () => {
    const { root, image } = sealed();
    expect(root).toHaveAttribute('aria-hidden');
    expect(image!.getAttribute('alt')).toBe('');
  });

  it('survives the artwork failing to load, with the seal still complete', () => {
    // The image is remote. If it is blocked, slow, or gone, what remains must
    // read as a finished sealed object rather than as a hole with a broken-image
    // glyph in it.
    const { container, root, image } = sealed();
    fireEvent.error(image!);

    expect(container.querySelector('[data-sealed-reward-image]')).toBeNull();
    expect(root).toBeInTheDocument();
    // Ground, seal and lock all still there. The logo is queried structurally
    // rather than by role: the whole art is `aria-hidden`, so its `role="img"`
    // is correctly not exposed — which is the point of the decorative test above.
    expect(root.querySelector('svg polygon')).not.toBeNull();
    expect(root.querySelector('[aria-label="Ditto"]')).not.toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(root.querySelector('.lucide-lock')).not.toBeNull();
  });

  it('stays locked when the reward is ready — nothing has been opened yet', () => {
    // 4/4 makes the reward claimable, not open. The padlock survives the warmer
    // treatment, and it is a glyph rather than a colour, so the state does not
    // depend on hue.
    const ready = sealed({ ready: true });
    expect(ready.root.querySelector('.lucide-lock')).not.toBeNull();
    expect(ready.root.className).toContain('ring-primary/30');

    const locked = sealed({ ready: false });
    expect(locked.root.querySelector('.lucide-lock')).not.toBeNull();
    expect(locked.root.className).toContain('ring-border');
  });

  it('carries the ambient drift on the artwork alone', () => {
    // Transform only, on the layer inside the overflow-hidden frame — it can
    // never move the panel. Disabled under prefers-reduced-motion by the shared
    // rule in index.css.
    const { root, image } = sealed();
    expect(image!.className).toContain('sealed-reward-image');
    expect(root.className).not.toContain('sealed-reward-image');
  });
});

describe('RevealedRewardArt', () => {
  it('shows no badge artwork and no seal', () => {
    // The placeholder for a reward that has been revealed. It must not reveal
    // the reward by falling back to the picture the seal was hiding.
    const { container } = render(<RevealedRewardArt />);

    expect(container.querySelector('[data-revealed-reward-art]')).not.toBeNull();
    expect(container.querySelector('[data-sealed-reward-art]')).toBeNull();
    expect(container.querySelector('[data-sealed-reward-image]')).toBeNull();
    expect(container.querySelector('img[src]')).toBeNull();
    expect(container.querySelector('.lucide-lock')).toBeNull();
  });
});
