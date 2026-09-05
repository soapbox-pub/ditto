/**
 * The companion draws the canonical body; its behaviour layer is untouched.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { createRef } from 'react';
import { BlobbiCompanionVisual } from './BlobbiCompanionVisual';
import type { CompanionData, EyeOffset } from '../types/companion.types';

vi.mock('@/blobbi/dev/useEmotionDev', () => ({ useEffectiveEmotion: () => 'neutral' }));

const COMPANION: CompanionData = {
  d: 'blobbi-cccccccccccc-0123456789',
  name: 'Roamer',
  stage: 'adult',
  visualTraits: { baseColor: '#F2A0C0', secondaryColor: '#FAD4E4', eyeColor: '#222222', pattern: 'solid', specialMark: 'none', size: 'medium' },
  energy: 70,
  stats: { hunger: 70, happiness: 70, health: 70, hygiene: 70, energy: 70 },
  state: 'active',
  adultType: 'froggi',
  seed: 'cd'.repeat(32),
};

describe('BlobbiCompanionVisual', () => {
  it('renders the canonical froggi body inside the companion shell, with Ditto eye groups only', () => {
    const eyeOffsetRef = createRef<EyeOffset>() as React.RefObject<EyeOffset>;
    const { container } = render(
      <BlobbiCompanionVisual companion={COMPANION} size={96} eyeOffsetRef={eyeOffsetRef} direction="right" isDragging={false} isWalking={false} />,
    );
    const svg = container.querySelector('svg')!;
    expect(svg).not.toBeNull();
    expect(svg.innerHTML).toContain('froggiBody3D');
    expect(svg.innerHTML.toLowerCase()).toContain('#f2a0c0');
    expect(container.querySelectorAll('.blobbi-blink')).toHaveLength(2);
    expect(container.querySelectorAll('.blobbi-eye-gaze')).toHaveLength(2);
    expect(container.querySelectorAll('.blobbi-pupil')).toHaveLength(0);
    // The shell's float/shadow wrappers are still there around the body.
    expect(container.firstElementChild!.getAttribute('style')).toContain('width: 96px');
  });

  it('a companion carrying visualGeneration v2 draws the V2 body without changing the shell', () => {
    const eyeOffsetRef = createRef<EyeOffset>() as React.RefObject<EyeOffset>;
    const { container } = render(
      <BlobbiCompanionVisual companion={{ ...COMPANION, visualGeneration: 'v2' }} size={96} eyeOffsetRef={eyeOffsetRef} direction="left" isDragging={false} isWalking />,
    );
    expect(container.querySelector('svg')!.getAttribute('data-blobbi-generation')).toBe('v2');
    expect(container.firstElementChild!.getAttribute('style')).toContain('width: 96px');
  });
});
