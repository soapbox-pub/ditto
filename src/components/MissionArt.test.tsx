import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { ExplorerRewardArt } from './MissionArt';
import { DITTO_EXPLORER_BADGE_IMAGE } from '@/lib/badgeClaim';

vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => ({ config: { appId: 'ditto', appName: 'Ditto' } }),
}));
vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: undefined }) }));
let reducedMotion = false;
vi.mock('@/lib/reducedMotion', () => ({ prefersReducedMotion: () => reducedMotion }));

beforeEach(() => {
  reducedMotion = false;
});

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
  function sealed(props: Parameters<typeof ExplorerRewardArt>[0] = {}) {
    const { container } = render(<ExplorerRewardArt {...props} />);
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

describe('ExplorerRewardArt — revealed', () => {
  function revealed(props: Parameters<typeof ExplorerRewardArt>[0] = {}) {
    const { container } = render(<ExplorerRewardArt revealed {...props} />);
    return {
      container,
      root: container.querySelector('[data-revealed-reward-art]')!,
      image: container.querySelector<HTMLImageElement>('[data-explorer-badge-image]'),
    };
  }

  it('shows the badge itself, untreated', () => {
    const { image } = revealed();
    expect(image).not.toBeNull();
    expect(image!.getAttribute('src')).toBe(DITTO_EXPLORER_BADGE_IMAGE);
    // No crop, no blur, no desaturation: the reward, at its own scale and its
    // own colours.
    expect(image!.style.transform).toBe('scale(1)');
    expect(image!.style.filter).toContain('blur(0px)');
    expect(image!.style.filter).toContain('saturate(1)');
  });

  it('is the same element the seal was on, not a second one', () => {
    // The whole idea of the reveal: the object the user was watching becomes
    // visible. Two components crossfading would be a swap.
    const { container, rerender } = render(<ExplorerRewardArt size={200} />);
    const before = container.querySelector('img');
    expect(before).toHaveAttribute('data-sealed-reward-image');

    rerender(<ExplorerRewardArt size={200} revealed />);
    const after = container.querySelector('img');
    expect(after).toBe(before);
    expect(after).toHaveAttribute('data-explorer-badge-image');
  });

  it('drops the seal: no lock, no mark in front, no sealed hook', () => {
    const { container, root } = revealed();
    expect(container.querySelector('[data-sealed-reward-art]')).toBeNull();
    expect(container.querySelector('[data-sealed-reward-image]')).toBeNull();
    // The seal's own layers are still in the tree so they can transition out,
    // but they are transparent and cannot be seen or hit.
    expect(root.querySelector('.lucide-lock')?.closest('span')?.className)
      .toContain('opacity-0');
  });

  it('stops the ambient drift, which would fight the crop pulling back', () => {
    const { image } = revealed();
    expect(image!.className).not.toContain('sealed-reward-image');
  });

  it('lands without easing when the reveal was skipped', () => {
    const { image } = revealed({ instant: true });
    expect(image!.style.transition).toBe('');
  });

  it('crossfades instead of animating blur and scale under reduced motion', () => {
    // A 3x crop collapsing to 1 is exactly the movement the setting removes, and
    // an animating blur radius is uncomfortable on its own. So the badge is
    // simply revealed, and a copy of the seal dissolves off the top of it.
    reducedMotion = true;
    const { container, image } = revealed();

    expect(image!.style.transition).toBe('');
    const ghost = container.querySelector<HTMLImageElement>('[data-sealed-reward-ghost]');
    expect(ghost).not.toBeNull();
    expect(ghost!.className).toContain('reward-seal-dissolve');
    // Same picture, still wearing the seal, on its way out.
    expect(ghost!.getAttribute('src')).toBe(DITTO_EXPLORER_BADGE_IMAGE);
    expect(ghost!.style.filter).toMatch(/blur\((?!0px)/);
  });

  it('adds no second layer when motion is welcome', () => {
    const { container } = revealed();
    expect(container.querySelector('[data-sealed-reward-ghost]')).toBeNull();
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('eases when the reveal is being watched', () => {
    const { image } = revealed({ instant: false });
    expect(image!.style.transition).toContain('filter');
    expect(image!.style.transition).toContain('transform');
  });
});
