import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { DevPlaygroundPage } from './DevPlaygroundPage';

/**
 * `/dev` — the one entrance to the first-session harnesses.
 *
 * Two things matter here and nothing else does. The first is **reach**: every
 * scenario the harness supports has a way in, pointing at the route that
 * scenario is actually inspected on, so nobody has to read `missionHarness.ts`
 * and type query parameters again. The second is **inertness**: this page is a
 * list of links, and opening it must not publish, sign, read encrypted settings
 * or start a mission. The reset control is the sole exception, and it is not
 * mounted until asked for — which is asserted, not assumed.
 *
 * Card styling is deliberately unasserted. The labels are a developer-facing
 * vocabulary that will be reworded; the hrefs are the contract.
 */

const publish = vi.fn();
const resetGuideDev = vi.fn(() => Promise.resolve());
/** Mounting this is what would read settings and, with an extension, prompt a signer. */
const useEncryptedSettings = vi.fn(() => ({
  settings: undefined,
  isLoading: false,
  updateSettings: { mutateAsync: publish },
  pubkey: undefined,
}));

vi.mock('@/hooks/useEncryptedSettings', () => ({
  useEncryptedSettings: () => useEncryptedSettings(),
}));
vi.mock('@/hooks/useNostrPublish', () => ({
  useNostrPublish: () => ({ mutate: publish, mutateAsync: publish }),
}));
vi.mock('@/hooks/usePostOnboardingGuide', () => ({
  usePostOnboardingGuide: () => {
    // Stand in for the real hook's settings dependency, so "was the hook
    // mounted?" is observable through the same spy the real one would trip.
    useEncryptedSettings();
    return { resetGuideDev };
  },
}));

let localhost = true;
vi.mock('@/dev/isLocalhostDev', () => ({ isLocalhostDev: () => localhost }));

function renderPage() {
  return render(
    <MemoryRouter>
      <DevPlaygroundPage />
    </MemoryRouter>,
  );
}

/** Every href the page offers. */
function hrefs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');
}

beforeEach(() => {
  localhost = true;
  publish.mockClear();
  resetGuideDev.mockClear();
  useEncryptedSettings.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('/dev — availability', () => {
  it('is available under local dev conditions', () => {
    renderPage();
    expect(screen.getByText('Developer Playground')).toBeInTheDocument();
  });

  it('renders nothing outside local dev, route registration aside', () => {
    // The route is also not registered in production (see `AppRouter`), so this
    // is the second of two layers rather than the only one. It matters because
    // a component that merely *hid* its controls would still be mountable.
    localhost = false;
    const { container } = renderPage();
    expect(container).toBeEmptyDOMElement();
  });
});

describe('/dev — no side effects', () => {
  it('publishes nothing and writes no settings when opened', () => {
    renderPage();
    expect(publish).not.toHaveBeenCalled();
  });

  it('reads no encrypted settings — so it cannot prompt a signer either', () => {
    // The strong form of "no side effects": the settings hook is never mounted,
    // so there is no query to read, decrypt, or write.
    renderPage();
    expect(useEncryptedSettings).not.toHaveBeenCalled();
  });

  it('starts no mission: every entry is a link, and the only buttons are inert', () => {
    const { container } = renderPage();
    // One button on the page, and it only reveals the account tools.
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toMatch(/load account tools/i);
    expect(container.querySelectorAll('a').length).toBeGreaterThan(20);
  });
});

describe('/dev — mission scenarios', () => {
  it('reaches every mission state on /missions', () => {
    const { container } = renderPage();
    const found = hrefs(container);

    for (const state of [
      'intro',
      'intro-postponed',
      'active0',
      'active1',
      'active2',
      'active3',
      'guided',
      'ready',
      'claiming',
      'failed',
      'claimed',
      'revealed',
      'hidden',
    ]) {
      expect(found).toContain(`/missions?missionDev=${state}`);
    }
  });

  it('inspects the interaction mission on the feed, where it completes', () => {
    const { container } = renderPage();
    const found = hrefs(container);

    for (const state of [
      'interact',
      'interact-empty-feed',
      'interact-reaction',
      'interact-reply',
      'interact-repost',
      'interact-bookmark',
      'interact-own-post',
      'interact-write-fails',
      'interact-done',
    ]) {
      expect(found).toContain(`/feed?missionDev=${state}`);
    }
  });

  it('offers the 4/4 moment on the page the count animates on', () => {
    const { container } = renderPage();
    expect(hrefs(container)).toContain('/missions?missionDev=interact-reaction');
  });
});

describe('/dev — reward ceremony', () => {
  it('reaches every direct ceremony phase', () => {
    const { container } = renderPage();
    const found = hrefs(container);

    for (const phase of [
      'opening',
      'sealed',
      'acting',
      'slow',
      'failed',
      'revealing',
      'revealed',
    ]) {
      expect(found).toContain(`/missions?missionDev=ceremony-${phase}`);
    }
  });

  it('enters the full fake flow at 4/4 ready, not at a revealed terminal state', () => {
    // The whole point of the full flow is that the claim, the persistence and
    // the reveal choreography all actually run. Landing on `ceremony-revealed`
    // would skip every one of them and still look finished.
    renderPage();
    const full = screen.getByRole('link', { name: /run the full fake success flow/i });
    expect(full).toHaveAttribute('href', '/missions?missionDev=ready');
  });
});

describe('/dev — first session', () => {
  it('links the signup → arrival tool rather than reimplementing it', () => {
    const { container } = renderPage();
    expect(hrefs(container)).toContain('/dev/signup-arrival');
  });

  it('reaches every arrival act, on the route the arrival plays on', () => {
    const { container } = renderPage();
    const found = hrefs(container);

    for (const act of [
      'arrival',
      'arrival-welcome',
      'arrival-welcome-reading',
      'arrival-presentation',
      'arrival-reading',
      'arrival-copy-out',
      'arrival-content-transform',
      'arrival-compact-ready',
      'arrival-reveal',
      'arrival-handoff',
    ]) {
      expect(found).toContain(`/?missionDev=${act}`);
    }
  });
});

describe('/dev — navigation', () => {
  it('loads scenario links as documents, because the harness reads the URL on mount', () => {
    // `readMissionDevState` caches in module scope and the ceremony/arrival
    // entry points are consumed once, on mount. A client-side navigation would
    // change the URL and leave the previous scenario running underneath it.
    const { container } = renderPage();
    const scenarioLinks = container.querySelectorAll('a[data-dev-scenario]');
    expect(scenarioLinks.length).toBeGreaterThan(20);
    for (const link of scenarioLinks) {
      expect(link.getAttribute('href')).toMatch(/\?missionDev=/);
    }
  });

  it('navigates ordinarily to tools that carry no scenario', () => {
    const { container } = renderPage();
    const tools = Array.from(container.querySelectorAll('a[data-dev-tool]'));
    expect(tools.map((a) => a.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/dev/signup-arrival', '/blobbi']),
    );
    for (const tool of tools) {
      expect(tool.getAttribute('href')).not.toMatch(/missionDev/);
    }
  });
});

describe('/dev — real account tools', () => {
  it('does not mount the reset control until it is asked for', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /reset this account/i })).toBeNull();
    expect(useEncryptedSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /load account tools/i }));

    expect(screen.getByRole('button', { name: /reset this account/i })).toBeEnabled();
    // Only now does anything on this page touch encrypted settings.
    expect(useEncryptedSettings).toHaveBeenCalled();
    expect(resetGuideDev).not.toHaveBeenCalled();
  });

  it('resets only on the explicit action', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /load account tools/i }));
    fireEvent.click(screen.getByRole('button', { name: /reset this account/i }));
    expect(resetGuideDev).toHaveBeenCalledTimes(1);
  });
});

describe('/dev — the sections a tester scans', () => {
  it('organises by domain, in the order the experience happens', () => {
    renderPage();
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      'First session',
      'Missions',
      'The interaction mission',
      'Reward ceremony',
      'Other dev tools',
      'Real account',
    ]);
  });

  it('says which kind of testing each mode is for', () => {
    const { container } = renderPage();
    // A sentence, not documentation: direct states are for looking, full flows
    // are for the state machine.
    expect(container.textContent).toMatch(/direct states/i);
    expect(container.textContent).toMatch(/full flows/i);
    expect(container.textContent).toMatch(/nothing here publishes, signs, or writes settings/i);
  });

  it('names states in a tester’s words, not the harness’s', () => {
    renderPage();
    const ready = screen.getByRole('link', { name: /^4\/4 ready/i });
    expect(within(ready).getByText(/reward is sealed but claimable/i)).toBeInTheDocument();
    // The internal id stays in the URL, where it belongs.
    expect(ready).toHaveAttribute('href', '/missions?missionDev=ready');
    expect(screen.queryByText('ceremony-revealing')).toBeNull();
    expect(screen.queryByText('active3')).toBeNull();
  });
});
