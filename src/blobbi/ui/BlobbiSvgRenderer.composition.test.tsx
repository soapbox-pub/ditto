/**
 * Ditto's expression, blink and gaze layers compose on the canonical body.
 *
 * End to end: a kind 31124 event → `parseBlobbiEvent` → the canonical visual
 * identity → `@blobbi/renderer` body → Ditto eye animation → Ditto recipe →
 * Ditto sanitizer → DOM. What must hold: exactly one set of Ditto eye groups,
 * no renderer gaze markup competing with them, recipes landing on the face,
 * and a synthetic Adult V2 rendering without crashing.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  KIND_BLOBBI_STATE,
  BLOBBI_ECOSYSTEM_NAMESPACE,
  getCanonicalBlobbiD,
  deriveBlobbiSeedV1,
  parseBlobbiEvent,
  type NostrEvent,
} from '@blobbi-kit/core';
import { deriveAdultFormFromSeed } from '@blobbi-kit/core/types/adult';
import { BlobbiStageVisual } from './BlobbiStageVisual';
import { BlobbiAdultVisual } from './BlobbiAdultVisual';
import { BlobbiBabyVisual } from './BlobbiBabyVisual';
import { BlobbiAdultSvgRenderer } from './BlobbiAdultSvgRenderer';
import { blobbiCompanionToBlobbi } from './lib/adapters';
import { resolveStatusRecipe } from './lib/status-reactions';
import { EYE_CLASSES } from './lib/eyes/types';
import type { RenderableBlobbi } from './lib/canonical-base';

const PUBKEY = 'b'.repeat(64);
function event(stage: 'baby' | 'adult', extra: string[][] = [], state = 'active'): NostrEvent {
  const createdAt = 1_700_000_000;
  const d = getCanonicalBlobbiD(PUBKEY, '0123456789');
  return {
    id: 'e'.repeat(64), pubkey: PUBKEY, created_at: createdAt, kind: KIND_BLOBBI_STATE, content: '', sig: 'f'.repeat(128),
    tags: [
      ['d', d], ['b', BLOBBI_ECOSYSTEM_NAMESPACE], ['stage', stage], ['state', state], ['last_interaction', String(createdAt)],
      ['name', 'Probe'], ['seed', deriveBlobbiSeedV1(PUBKEY, d, createdAt)],
      ['base_color', '#33aa66'], ['secondary_color', '#ffcc00'], ['eye_color', '#12abef'],
      ['client', 'blobbi'],
      ...extra,
    ],
  };
}
const svgOf = (c: HTMLElement) => c.querySelector('svg') as SVGSVGElement;
const count = (c: HTMLElement, sel: string) => c.querySelectorAll(sel).length;

describe('event → identity → canonical body → Ditto layers', () => {
  it('an adult event renders the canonical V1 body with one set of Ditto eye groups and no renderer gaze', () => {
    const companion = parseBlobbiEvent(event('adult'))!;
    expect(companion.isLegacy).toBe(false);
    const { container } = render(<BlobbiStageVisual companion={companion} size="md" />);
    const svg = svgOf(container);
    expect(svg).not.toBeNull();
    // Body: the seed-derived form's gradients, namespaced per instance, in the
    // colours the domain resolved for this event (the parser applies its own
    // colour guardrails to the tags, so read the resolved traits, not the tag).
    const form = deriveAdultFormFromSeed(companion.seed);
    expect(svg.innerHTML).toContain(form);
    expect(svg.innerHTML.toLowerCase()).toContain(companion.visualTraits.baseColor.toLowerCase());
    // Canonical ids are namespaced `b_<instance>_…`; Ditto's own additions
    // (blink clip-paths, effect gradients) keep their `blobbi-…` naming.
    const ids = [...svg.querySelectorAll('[id]')].map((el) => el.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id.startsWith('b_') || id.startsWith('blobbi-'))).toBe(true);
    expect(ids.some((id) => id.startsWith('b_'))).toBe(true);
    // Ditto's eye contract, exactly once per eye.
    expect(count(container, `.${EYE_CLASSES.blinkLeft}`)).toBe(1);
    expect(count(container, `.${EYE_CLASSES.blinkRight}`)).toBe(1);
    expect(count(container, `.${EYE_CLASSES.gazeLeft}`)).toBe(1);
    expect(count(container, `.${EYE_CLASSES.gazeRight}`)).toBe(1);
    expect(count(container, 'clipPath')).toBe(2);
    // The renderer's optional gaze system is not in play: no double transform.
    expect(count(container, '.blobbi-pupil')).toBe(0);
    expect(count(container, 'style[data-blobbi-gaze-style]')).toBe(0);
    // Sanitized output: the canonical artwork's comments and XML declaration are gone.
    expect(container.innerHTML).not.toContain('<!--');
    expect(container.innerHTML).not.toContain('<?xml');
  });

  it('a baby event renders the canonical baby body through the same layers', () => {
    const companion = parseBlobbiEvent(event('baby'))!;
    const { container } = render(<BlobbiStageVisual companion={companion} size="sm" />);
    expect(svgOf(container).getAttribute('viewBox')).toBe('0 0 100 100');
    expect(container.querySelector('[id$="_blobbiBodyGradient"]')).not.toBeNull();
    expect(count(container, `.${EYE_CLASSES.blink}`)).toBe(2);
    expect(count(container, '.blobbi-pupil')).toBe(0);
  });

  it('the adapter sources the visual identity from the canonical projection', () => {
    const companion = parseBlobbiEvent(event('adult', [['visual_generation', 'v2']]))!;
    const visual = blobbiCompanionToBlobbi(companion);
    expect(visual.baseColor).toBe(companion.visualTraits.baseColor);
    expect(visual.eyeColor).toBe(companion.visualTraits.eyeColor);
    expect(visual.adult?.evolutionForm).toBe(companion.adultType);
    expect(visual.visualGeneration).toBe('v2');
    expect(blobbiCompanionToBlobbi(parseBlobbiEvent(event('adult'))!).visualGeneration).toBe('v1');
  });
});

const ADULT: RenderableBlobbi = {
  id: 'blobbi-bbbbbbbbbbbb-0123456789', name: 'Probe', lifeStage: 'adult', state: 'active',
  stats: { hunger: 80, happiness: 80, health: 80, hygiene: 80, energy: 80 },
  baseColor: '#33AA66', secondaryColor: '#FFCC00', eyeColor: '#12ABEF', pattern: 'solid', specialMark: 'none', size: 'medium',
  seed: 'ab'.repeat(32), tags: [], adult: { evolutionForm: 'catti' },
};

describe('expression recipes land on the canonical body', () => {
  it('happy keeps the face; sad adds watery eyes and a sad mouth; sleepy adds closed-eye lines', () => {
    const happy = render(<BlobbiAdultVisual blobbi={ADULT} emotion="happy" />);
    expect(count(happy.container, `.${EYE_CLASSES.blink}`)).toBe(2);

    const sad = render(<BlobbiAdultVisual blobbi={ADULT} emotion="sad" />);
    expect(count(sad.container, `.${EYE_CLASSES.sadWater}`)).toBeGreaterThan(0);
    expect(sad.container.querySelector('.blobbi-mouth-sad')).not.toBeNull();
    // Catti's mouth is two Q-curves; the recipe mouth is centred on the whole mouth.
    expect(sad.container.querySelector('.blobbi-mouth-sad')!.getAttribute('d')).toMatch(/^M 82 /);

    const sleepy = render(<BlobbiAdultVisual blobbi={ADULT} emotion="sleepy" />);
    expect(count(sleepy.container, `.${EYE_CLASSES.closedEye}`)).toBe(2);
    expect(sleepy.container.querySelector('.blobbi-mouth-sleepy')).not.toBeNull();
  });

  it('a sleeping Blobbi still draws the AWAKE canonical body: sleep is Ditto\'s overlay', () => {
    const asleep = render(<BlobbiAdultVisual blobbi={{ ...ADULT, state: 'sleeping', isSleeping: true }} emotion="sleepy" />);
    // Both pupils exist (the awake artwork), wrapped for Ditto's blink to close them.
    expect(count(asleep.container, `.${EYE_CLASSES.gaze}`)).toBe(2);
    expect(count(asleep.container, `.${EYE_CLASSES.closedEye}`)).toBe(2);
  });

  it('a status-driven recipe (low stats) composes like a named emotion', () => {
    const { recipe, label } = resolveStatusRecipe({ hunger: 5, happiness: 90, health: 90, hygiene: 90, energy: 90 });
    expect(Object.keys(recipe).length).toBeGreaterThan(0);
    const { container } = render(<BlobbiAdultVisual blobbi={ADULT} recipe={recipe} recipeLabel={label} />);
    expect(count(container, `.${EYE_CLASSES.blink}`)).toBe(2);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('the baby wrapper composes the same way', () => {
    const { container } = render(<BlobbiBabyVisual blobbi={{ ...ADULT, lifeStage: 'baby', adult: undefined }} emotion="sad" />);
    expect(count(container, `.${EYE_CLASSES.blink}`)).toBe(2);
    expect(container.querySelector('.blobbi-mouth-sad')).not.toBeNull();
  });
});

describe('synthetic Adult V2 through the Ditto boundary (compatibility only)', () => {
  it.each(['front', 'right', 'left', 'back'] as const)('renders facing %s with an emotion applied, without crashing', (facing) => {
    const { container } = render(
      <BlobbiAdultSvgRenderer blobbi={{ ...ADULT, visualGeneration: 'v2' }} isSleeping={false} emotion="sad" facing={facing} />,
    );
    const svg = svgOf(container);
    expect(svg.getAttribute('data-blobbi-generation')).toBe('v2');
    expect(svg.getAttribute('data-blobbi-view')).toBe(facing === 'back' ? 'back' : facing === 'front' ? 'front' : 'side');
    expect(svg.querySelector('[data-part="body-base"]')).not.toBeNull();
    expect(svg.querySelector('[data-blobbi-mirrored]') !== null).toBe(facing === 'left');
    // The sanitizer keeps what V2 needs: gradient inheritance and blurred shadows.
    expect(svg.querySelector('linearGradient[*|href], linearGradient[href]') ?? svg.innerHTML.includes('href="#')).toBeTruthy();
    expect(svg.querySelector('feGaussianBlur')).not.toBeNull();
  });
});
