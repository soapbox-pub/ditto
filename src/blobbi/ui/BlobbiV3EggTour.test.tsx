/**
 * The hatching tour around a V3 egg: the same glow, wiggle, shake, opening
 * and vanishing the V1 egg does, applied AROUND the kit's egg, whose drawing
 * (crack overlay included) stays exactly the kit's.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { KIND_BLOBBI_STATE, buildEggTags, getBlobbiVisualIdentity, parseBlobbiEvent, type BlobbiCompanion } from '@blobbi-kit/core';
import { BlobbiRenderer, type BlobbiEggCrack } from '@blobbi-kit/renderer';

import type { EggTourVisualState } from '@/blobbi/egg';

import { BlobbiStageVisual } from './BlobbiStageVisual';

const PUBKEY = 'a'.repeat(64);

function egg(generation: 'v1' | 'v3'): BlobbiCompanion {
  const tags = buildEggTags(PUBKEY, '00000000a7', 1_757_000_000, 'Umber', { visualGeneration: generation });
  const event: NostrEvent = { id: '0'.repeat(64), pubkey: PUBKEY, created_at: 1_757_000_000, kind: KIND_BLOBBI_STATE, tags, content: '', sig: '0'.repeat(128) };
  return parseBlobbiEvent(event)!;
}

function kitEgg(companion: BlobbiCompanion, instanceId: string, eggCrack: BlobbiEggCrack): string {
  const { container } = render(<BlobbiRenderer visual={getBlobbiVisualIdentity(companion)} instanceId={instanceId} size="100%" motion="idle" eggCrack={eggCrack} />);
  return container.querySelector('[data-blobbi-renderer]')!.innerHTML;
}

function tourEgg(tourVisualState: EggTourVisualState, props: { onTourEggClick?: () => void; animated?: boolean } = {}) {
  const companion = egg('v3');
  const { container } = render(<BlobbiStageVisual companion={companion} animated={props.animated ?? true} tourVisualState={tourVisualState} onTourEggClick={props.onTourEggClick} />);
  return {
    companion,
    container,
    frame: container.querySelector('[data-blobbi-v3-egg-tour]')!,
    glow: container.querySelector('[data-blobbi-v3-egg-glow]')!,
    shell: container.querySelector('[data-blobbi-v3-egg-shell]')!,
    renderer: container.querySelector('[data-blobbi-renderer]')!,
  };
}

const EXPECTED: Record<EggTourVisualState, { crack: BlobbiEggCrack; shell: string[]; notShell: string[]; glow: boolean }> = {
  idle: { crack: 'none', shell: [], notShell: ['animate-egg-crack', 'animate-egg-tour-open', 'opacity-0'], glow: false },
  show_hatch_card: { crack: 'none', shell: ['animate-egg-tap-wiggle'], notShell: ['animate-egg-crack'], glow: false },
  glowing_waiting_click: { crack: 'none', shell: ['animate-egg-tap-wiggle'], notShell: ['animate-egg-crack'], glow: true },
  crack_stage_1: { crack: 'light', shell: ['animate-egg-crack'], notShell: ['animate-egg-tour-open', 'opacity-0'], glow: true },
  crack_stage_2: { crack: 'medium', shell: ['animate-egg-crack'], notShell: ['animate-egg-tour-open', 'opacity-0'], glow: true },
  crack_stage_3: { crack: 'heavy', shell: ['animate-egg-crack'], notShell: ['animate-egg-tour-open', 'opacity-0'], glow: true },
  opening: { crack: 'heavy', shell: ['animate-egg-tour-open'], notShell: ['animate-egg-crack', 'opacity-0'], glow: true },
  hatching: { crack: 'heavy', shell: ['opacity-0'], notShell: ['animate-egg-crack', 'animate-egg-tour-open'], glow: true },
};

describe('the hatching tour around a V3 egg', () => {
  afterEach(() => vi.useRealTimers());

  for (const [state, want] of Object.entries(EXPECTED) as [EggTourVisualState, (typeof EXPECTED)[EggTourVisualState]][]) {
    it(`${state}: the kit's egg with its own crack, inside the tour's shell and glow`, () => {
      const { companion, frame, glow, shell, renderer } = tourEgg(state);
      expect(frame.getAttribute('data-blobbi-v3-egg-tour')).toBe(state);
      // The drawing is the kit's, crack overlay included: no second egg renderer.
      expect(renderer.getAttribute('data-blobbi-egg-crack')).toBe(want.crack);
      const instanceId = renderer.closest('[data-blobbi-instance]')!.getAttribute('data-blobbi-instance')!;
      expect(renderer.innerHTML).toBe(kitEgg(companion, instanceId, want.crack));
      // The V1 egg's effects, around it.
      for (const cls of want.shell) expect(shell.classList.contains(cls), cls).toBe(true);
      for (const cls of want.notShell) expect(shell.classList.contains(cls), cls).toBe(false);
      expect(glow.classList.contains('animate-egg-tour-glow')).toBe(want.glow);
    });
  }

  it('a tap during an interactive step is forwarded to the tour; outside a tour it is a wiggle, as on the V1 egg; while the shell opens it is nothing', () => {
    const onTourEggClick = vi.fn();
    const during = tourEgg('crack_stage_2', { onTourEggClick });
    expect(during.shell.classList.contains('cursor-pointer')).toBe(true);
    fireEvent.click(during.shell);
    expect(onTourEggClick).toHaveBeenCalledTimes(1);

    const idle = tourEgg('idle', { onTourEggClick });
    expect(idle.shell.classList.contains('animate-egg-tap-wiggle')).toBe(false);
    fireEvent.click(idle.shell);
    expect(onTourEggClick).toHaveBeenCalledTimes(1);
    expect(idle.shell.classList.contains('animate-egg-tap-wiggle')).toBe(true);

    const opening = tourEgg('opening', { onTourEggClick });
    fireEvent.click(opening.shell);
    expect(onTourEggClick).toHaveBeenCalledTimes(1);
    expect(opening.shell.classList.contains('animate-egg-tap-wiggle')).toBe(false);
  });

  it('waiting for a tap, the egg wiggles now and again every 2.5 seconds', () => {
    vi.useFakeTimers();
    const { shell } = tourEgg('glowing_waiting_click');
    expect(shell.classList.contains('animate-egg-tap-wiggle')).toBe(true);
    // The wiggle ends with its animation (jsdom has no AnimationEvent, so the name is put on a plain event).
    const ended = new Event('animationend', { bubbles: true });
    Object.defineProperty(ended, 'animationName', { value: 'egg-tap-wiggle' });
    act(() => { shell.dispatchEvent(ended); });
    expect(shell.classList.contains('animate-egg-tap-wiggle')).toBe(false);
    // And comes back on the timer.
    act(() => { vi.advanceTimersByTime(2500); });
    expect(shell.classList.contains('animate-egg-tap-wiggle')).toBe(true);
  });

  it('a wiggle does not outlive the state that started it: not into the crack stages, not into the opening', () => {
    const companion = egg('v3');
    const onTourEggClick = vi.fn();
    const view = render(<BlobbiStageVisual companion={companion} animated tourVisualState="glowing_waiting_click" onTourEggClick={onTourEggClick} />);
    const shell = () => view.container.querySelector('[data-blobbi-v3-egg-shell]')!;
    expect(shell().classList.contains('animate-egg-tap-wiggle')).toBe(true);
    // The crack shake takes over, and the waiting wiggle is gone, not merely hidden.
    view.rerender(<BlobbiStageVisual companion={companion} animated tourVisualState="crack_stage_1" onTourEggClick={onTourEggClick} />);
    expect(shell().classList.contains('animate-egg-tap-wiggle')).toBe(false);
    expect(shell().classList.contains('animate-egg-crack')).toBe(true);
    // A tap during the crack stages wiggles nothing visible (the shake wins) and must not surface once the shell opens.
    fireEvent.click(shell());
    expect(onTourEggClick).toHaveBeenCalledTimes(1);
    view.rerender(<BlobbiStageVisual companion={companion} animated tourVisualState="opening" onTourEggClick={onTourEggClick} />);
    expect([...shell().classList].filter((c) => c.startsWith('animate-'))).toEqual(['animate-egg-tour-open']);
    view.rerender(<BlobbiStageVisual companion={companion} animated tourVisualState="hatching" onTourEggClick={onTourEggClick} />);
    expect([...shell().classList].filter((c) => c.startsWith('animate-'))).toEqual([]);
    expect(shell().classList.contains('opacity-0')).toBe(true);
  });

  it('the glow is the Blobbi\'s own colour and idles with a pulse only when animated', () => {
    const animated = tourEgg('idle', { animated: true });
    expect(animated.glow.classList.contains('animate-pulse')).toBe(true);
    expect((animated.glow as HTMLElement).style.background).not.toBe('');
    const still = tourEgg('idle', { animated: false });
    expect(still.glow.classList.contains('animate-pulse')).toBe(false);
  });

  it('a V1 egg keeps its own tour (EggGraphic), untouched', () => {
    const { container } = render(<BlobbiStageVisual companion={egg('v1')} animated tourVisualState="opening" />);
    expect(container.querySelector('[data-blobbi-v3-egg-tour]')).toBeNull();
    expect(container.querySelector('[data-blobbi-renderer]')).toBeNull();
    expect(container.querySelector('.animate-egg-tour-open')).not.toBeNull();
  });

  it('every animation the frame uses is switched off under prefers-reduced-motion, by the egg stylesheet it shares with V1', () => {
    const css = readFileSync(join(__dirname, '../egg/styles/egg-animations.css'), 'utf8');
    const reduced = css.slice(css.indexOf('prefers-reduced-motion: reduce'));
    const rule = reduced.slice(0, reduced.indexOf('animation: none !important'));
    for (const cls of ['animate-egg-tap-wiggle', 'animate-egg-crack', 'animate-egg-tour-open', 'animate-egg-tour-glow']) {
      expect(rule, cls).toContain(`.${cls}`);
    }
  });
});
