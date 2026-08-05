import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { IntlProvider } from 'react-intl';

import { ExplorerArrivalCard } from './ExplorerArrivalCard';

function renderCard(props: Parameters<typeof ExplorerArrivalCard>[0] = {}) {
  const { container } = render(
    <IntlProvider locale="en">
      <ExplorerArrivalCard {...props} />
    </IntlProvider>,
  );
  return {
    card: () => container.querySelector('[data-explorer-arrival-card]')!,
    full: () => container.querySelector('[data-arrival-card-full]')!,
    compact: () => container.querySelector('[data-arrival-card-compact]')!,
  };
}

describe('ExplorerArrivalCard — content groups', () => {
  it('presents the full content as a centred column with the large badge', () => {
    const { full } = renderCard({ showFullContent: true });
    const visual = full().querySelector('img')!.parentElement!;

    expect(visual.className).toContain('flex-col');
    expect(full().querySelector('img')!.className).toContain('size-24');
    // The presentation-only pieces: the eyebrow and the locked-reward row.
    expect(full().textContent).toContain('New');
    expect(full().textContent).toContain('A reward is waiting');
  });

  it('shapes the compact content like the destination, not like the presentation', () => {
    // This is what makes the travel land cleanly: by the time the card moves it
    // is already arranged the way the sidebar widget and the mobile teaser
    // arrange their own contents, so nothing has to reflow on arrival.
    const { compact } = renderCard({ showCompactContent: true });
    const visual = compact().querySelector('img')!.parentElement!;

    expect(visual.className).not.toContain('flex-col');
    expect(visual.className).toContain('items-center');
    expect(compact().querySelector('img')!.className).toContain('size-12');
    // None of the presentation framing travels with it.
    expect(compact().textContent).not.toContain('New');
    expect(compact().textContent).not.toContain('A reward is waiting');
  });

  it('keeps both groups in one grid cell so the shell cannot resize mid-swap', () => {
    // A container that changed height while its contents swapped is exactly
    // what made the transformation read as a responsive-layout bug.
    const { full, compact } = renderCard({ showFullContent: true });
    expect(full().className).toContain('col-start-1');
    expect(full().className).toContain('row-start-1');
    expect(compact().className).toContain('col-start-1');
    expect(compact().className).toContain('row-start-1');
    expect(full().parentElement).toBe(compact().parentElement);
  });

  it('wipes the full content out and reveals the compact content in', () => {
    const { full, compact } = renderCard({ showFullContent: false, showCompactContent: true });
    expect(full().className).toContain('arrival-content-out');
    expect(compact().className).toContain('arrival-content-in');
  });

  it('crossfades through the bare shell under reduced motion, never clipping', () => {
    // Reduced motion keeps the change of mode legible but refuses the moving
    // mask: opacity only, and the geometry never participates.
    const { full, compact } = renderCard({
      showFullContent: false,
      showCompactContent: true,
      reducedMotion: true,
    });
    expect(full().className).not.toContain('arrival-content-out');
    expect(full().className).toContain('opacity-0');
    expect(compact().className).not.toContain('arrival-content-in');
    expect(compact().className).toContain('transition-opacity');
  });

  it('stages the full content as blocks, so it leaves as units rather than crushing', () => {
    const { full } = renderCard({ showFullContent: true });
    const blocks = full().querySelectorAll('.arrival-block');
    expect(blocks.length).toBe(3);
    // Bottom to top: the reward row first, the eyebrow last.
    const delays = [...blocks].map((b) => (b as HTMLElement).style.getPropertyValue('--block-delay'));
    expect(delays).toEqual(['150ms', '75ms', '0ms']);
  });

  it('hides the compact group from assistive tech until it is the live content', () => {
    const { compact } = renderCard({ showFullContent: true });
    expect(compact()).toHaveAttribute('aria-hidden', 'true');
    expect(compact().className).toContain('opacity-0');
  });
});
