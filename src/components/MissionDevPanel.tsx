import { Button } from '@/components/ui/button';
import {
  type MissionDevState,
  missionDevActive,
  missionDevState,
} from '@/dev/missionHarness';
import { cn } from '@/lib/utils';

/**
 * Localhost-only controls for driving the mission surfaces by hand.
 *
 * The scenarios have always been reachable with `?missionDev=`, which is fine
 * once and tedious for the twentieth time — and the reward ceremony is a thing
 * you open, close, and open again. This puts the useful ones on screen.
 *
 * It is a **navigator**, not a second source of truth: every button sets the
 * same query parameter the harness already reads, so there is exactly one way a
 * scenario is chosen and nothing here can express a state the URL cannot. That
 * also means each button is a real page load, which is what you want when the
 * thing under test runs on mount.
 *
 * Gated exactly like the rest of the harness: `missionDevActive()` is false in
 * every production build and on every non-localhost host, so this renders
 * nothing there. It reads and writes no mission state, publishes nothing, and
 * touches no settings — it changes a query parameter.
 */

const MISSION_SCENARIOS: ReadonlyArray<{ id: MissionDevState; label: string }> = [
  { id: 'intro', label: 'Intro' },
  { id: 'active1', label: '1/4' },
  { id: 'active3', label: '3/4' },
  { id: 'ready', label: '4/4 ready' },
  { id: 'claiming', label: 'Claiming' },
  { id: 'failed', label: 'Failed' },
  { id: 'claimed', label: 'Claimed' },
  { id: 'revealed', label: 'Revealed' },
  { id: 'hidden', label: 'Hidden' },
];

const CEREMONY_SCENARIOS: ReadonlyArray<{ id: MissionDevState; label: string }> = [
  { id: 'ceremony-opening', label: 'Open with travel' },
  { id: 'ceremony-sealed', label: 'Open sealed (no travel)' },
];

export function MissionDevPanel() {
  if (!missionDevActive()) return null;

  const current = missionDevState();

  const go = (scenario: MissionDevState) => {
    const url = new URL(window.location.href);
    url.searchParams.set('missionDev', scenario);
    window.location.assign(url.toString());
  };

  const row = (
    title: string,
    items: ReadonlyArray<{ id: MissionDevState; label: string }>,
  ) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </span>
      {items.map(({ id, label }) => (
        <Button
          key={id}
          type="button"
          size="sm"
          variant={current === id ? 'default' : 'outline'}
          className={cn('h-7 rounded-full px-3 text-xs', current === id && 'font-semibold')}
          onClick={() => go(id)}
        >
          {label}
        </Button>
      ))}
    </div>
  );

  return (
    <aside
      data-mission-dev-panel=""
      className="mt-6 space-y-2 rounded-xl border border-dashed border-border bg-muted/20 p-3"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Mission harness · localhost only · nothing is published or saved
      </p>
      {row('Mission', MISSION_SCENARIOS)}
      {row('Ceremony', CEREMONY_SCENARIOS)}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Ceremony scenarios open the stage on load. From any 4/4 state you can also
        open it with the panel's own “View your reward”, then close it with the
        Close button, Escape, the backdrop, or browser Back.
      </p>
    </aside>
  );
}
