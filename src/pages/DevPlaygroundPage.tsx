import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical, RotateCcw } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { isLocalhostDev } from '@/dev/isLocalhostDev';
import type { MissionDevState } from '@/dev/missionHarness';
import { usePostOnboardingGuide } from '@/hooks/usePostOnboardingGuide';

/**
 * The one place to reach every manual test for the first-session experience.
 *
 * The harnesses this links into are older than the page and stay where they
 * are: `?missionDev=` drives the mission and arrival scenarios, and
 * `/dev/signup-arrival` runs the real signup UI against fake services. What was
 * missing was a door. The scenarios were discoverable only by reading
 * `missionHarness.ts` and typing query parameters by hand, which is why a
 * scenario switcher had drifted into `/missions` itself — a development control
 * sitting inside the feature it was meant to help review.
 *
 * So this is a **navigator**, not a second source of truth. Every entry below
 * resolves to a URL the harness already understands; nothing here can express a
 * state the URL cannot, and nothing here owns any mission policy. Removing this
 * page would cost discoverability and no capability at all.
 *
 * ### Why the links are `<a>` rather than `<Link>`
 *
 * The harness reads `window.location.search` at call time and then caches its
 * synthetic state in module scope (`readMissionDevState`), while the arrival and
 * ceremony entry points are consumed once, on mount. A client-side navigation
 * would change the URL while leaving the already-initialised harness in place,
 * so the page would show the previous scenario under the new query string. A
 * full document load is therefore genuinely required, and a plain anchor is the
 * honest way to ask for one — it also keeps middle-click and browser Back
 * behaving normally. Links that carry no scenario (`/dev/signup-arrival`, the
 * Blobbi page) are ordinary router navigations.
 *
 * ### Gating
 *
 * Two layers, the same pair the rest of the harness uses. The route is not
 * registered unless {@link isLocalhostDev} is true, so in production `/dev` is
 * an ordinary unknown path and falls through to the 404; and this component
 * returns `null` under the same condition, so it cannot be rendered into a
 * production tree by any other means.
 *
 * ### Side effects
 *
 * Opening this page publishes nothing, signs nothing, reads no encrypted
 * settings and starts no mission. It renders links. The one control that can
 * touch a real account — the journey reset — is not mounted until it is
 * explicitly asked for, which is what keeps that promise literally true rather
 * than approximately.
 */

/** A destination in the playground. */
interface DevLink {
  label: string;
  hint?: string;
  href: string;
  /**
   * Whether following this needs a full document load. True for every scenario
   * link, because the harness initialises on mount from the URL.
   */
  reload: boolean;
}

interface DevSection {
  title: string;
  description: string;
  groups: Array<{ title?: string; note?: string; links: DevLink[] }>;
}

/** A harness scenario, inspected on `route`. */
function scenario(
  route: string,
  id: MissionDevState,
  label: string,
  hint?: string,
): DevLink {
  return { label, hint, href: `${route}?missionDev=${id}`, reload: true };
}

const MISSIONS = '/missions';
const ARRIVAL = '/';
const FEED = '/feed';
const SEARCH = '/search';

const SECTIONS: DevSection[] = [
  {
    title: 'First session',
    description:
      'Everything between finishing signup and the missions page existing. The signup tool runs the real production screens; the arrival scenarios enter the sequence part-way, because the frames worth looking at are a few hundred milliseconds long.',
    groups: [
      {
        title: 'Full flow',
        links: [
          {
            label: 'Signup → arrival tool',
            hint: 'The real signup UI with no-network services, handing over to the real arrival. No keys, no publishes, no account.',
            href: '/dev/signup-arrival',
            reload: false,
          },
        ],
      },
      {
        title: 'Arrival',
        note: 'Each starts directly on the named act and continues from there. The held ones stay put until you leave.',
        links: [
          scenario(ARRIVAL, 'arrival', 'Full sequence', 'From the first beat.'),
          scenario(ARRIVAL, 'arrival-welcome', 'Welcome, entering'),
          scenario(ARRIVAL, 'arrival-welcome-reading', 'Welcome, held'),
          scenario(ARRIVAL, 'arrival-presentation', 'Explorer card entering'),
          scenario(
            ARRIVAL,
            'arrival-reading',
            'Settled composition, held',
            'Eyebrow, title, card and reassurance, with no timer taking it away.',
          ),
          scenario(ARRIVAL, 'arrival-copy-out', 'Copy leaving, held'),
          scenario(ARRIVAL, 'arrival-content-transform', 'Card mid-wipe, held'),
          scenario(
            ARRIVAL,
            'arrival-compact-ready',
            'Card in its destination shape, held',
            'For checking it against the real sidebar widget.',
          ),
          scenario(ARRIVAL, 'arrival-reveal', 'Backdrop dissolving'),
          scenario(
            ARRIVAL,
            'arrival-handoff',
            'Travel to the widget',
            'The part hardest to catch by hand.',
          ),
        ],
      },
    ],
  },
  {
    title: 'Missions',
    description: 'The journey as /missions presents it, at each point it can be found in.',
    groups: [
      {
        links: [
          scenario(MISSIONS, 'intro', 'Introduction', 'Before any mission rows are offered.'),
          scenario(MISSIONS, 'intro-postponed', 'Introduction postponed'),
          scenario(MISSIONS, 'active0', 'Not started', 'Acknowledged, nothing done.'),
          scenario(MISSIONS, 'active1', '1/4'),
          scenario(MISSIONS, 'active2', '2/4'),
          scenario(MISSIONS, 'active3', '3/4'),
          scenario(
            MISSIONS,
            'guided',
            'Mission in progress',
            'Actually launched, so the row says Continue rather than Next up.',
          ),
          scenario(
            MISSIONS,
            'ready',
            '4/4 ready',
            'All four missions complete. The reward is sealed but claimable.',
          ),
          scenario(MISSIONS, 'claiming', 'Claim in flight'),
          scenario(MISSIONS, 'failed', 'Claim failed'),
          scenario(MISSIONS, 'claimed', 'Claim submitted', 'Sealed still: publishing is not revealing.'),
          scenario(MISSIONS, 'revealed', 'Reward revealed'),
          scenario(MISSIONS, 'hidden', 'Hidden journey', 'Dismissed, with the resume path.'),
        ],
      },
    ],
  },
  {
    title: 'The first mission',
    description:
      'The first mission is the one that completes from Search. Its guidance card is the same component the interaction mission uses on the feed — open both to compare them.',
    groups: [
      {
        links: [
          scenario(
            SEARCH,
            'find-people',
            'Task active',
            'The Search guidance, expanded. Press the title to fold it away and again to bring it back.',
          ),
          scenario(
            SEARCH,
            'find-people-done',
            'Task complete',
            'The follow landed. The card says what happened rather than what to do.',
          ),
        ],
      },
    ],
  },
  {
    title: 'The interaction mission',
    description:
      'The fourth mission is the one that completes from the feed. These start with the first three already done, then inject a real interaction signal a beat after load — the engine, persistence and celebration all run for real.',
    groups: [
      {
        links: [
          scenario(FEED, 'interact', 'Task active', 'With its feed guidance showing.'),
          scenario(FEED, 'interact-empty-feed', 'Quiet-feed fallback'),
          scenario(FEED, 'interact-reaction', 'A reaction lands'),
          scenario(FEED, 'interact-reply', 'A reply lands'),
          scenario(FEED, 'interact-repost', 'A repost lands'),
          scenario(FEED, 'interact-bookmark', 'A bookmark lands'),
          scenario(
            FEED,
            'interact-own-post',
            'Own post — completes nothing',
            'The ownership rule, exercised.',
          ),
          scenario(
            FEED,
            'interact-write-fails',
            'Persistence failure',
            'The write is attempted once and rejected. Nothing may retry it.',
          ),
          scenario(FEED, 'interact-done', 'Task already done'),
          scenario(
            MISSIONS,
            'interact-reaction',
            '4/4 as it happens',
            'The same injection on /missions, so the count animates 3/4 → 4/4 on the page. Add &missionDevDelay=<ms> if the window is easy to miss.',
          ),
        ],
      },
    ],
  },
  {
    title: 'Reward ceremony',
    description:
      'The stage that opens from “Reveal your reward”. Use the full flow to exercise the state machine; use a direct state to look at one frame.',
    groups: [
      {
        title: 'Full fake success flow',
        note: 'The real claim path end to end — the same guards, idempotency, outcome mapping, persistence and choreography. Only the publish is faked, and nothing is signed or saved.',
        links: [
          scenario(
            MISSIONS,
            'ready',
            'Run the full fake success flow',
            'Lands on 4/4 ready. Press “Reveal your reward”, then claim, and the ceremony runs through to the badge reveal.',
          ),
        ],
      },
      {
        title: 'Direct states',
        note: 'Each opens the stage on load and renders that phase directly. No claim is attempted, so these are for visual, responsive and dark/light review rather than for testing the flow.',
        links: [
          scenario(MISSIONS, 'ceremony-opening', 'Opening, with the travel'),
          scenario(MISSIONS, 'ceremony-sealed', 'Sealed', 'The settled stage, without replaying the entrance.'),
          scenario(MISSIONS, 'ceremony-acting', 'Claim in progress'),
          scenario(MISSIONS, 'ceremony-slow', 'Slow signer'),
          scenario(MISSIONS, 'ceremony-failed', 'Claim failed'),
          scenario(MISSIONS, 'ceremony-revealing', 'Reveal in progress'),
          scenario(MISSIONS, 'ceremony-revealed', 'Reward revealed'),
        ],
      },
    ],
  },
  {
    title: 'Other dev tools',
    description: 'Localhost-only tools that live elsewhere in the app, listed here so this page is the one place to start looking.',
    groups: [
      {
        links: [
          {
            label: 'Blobbi state editor & emotion tester',
            hint: 'Opened from the Blobbi page’s own dev controls. Unrelated to the first session.',
            href: '/blobbi',
            reload: false,
          },
        ],
      },
    ],
  },
];

function LinkTile({ link }: { link: DevLink }) {
  const body = (
    <>
      <span className="text-sm font-semibold text-foreground">{link.label}</span>
      {link.hint && (
        <span className="text-xs leading-relaxed text-muted-foreground">{link.hint}</span>
      )}
    </>
  );

  const className =
    'flex flex-col gap-1 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/60 hover:bg-accent';

  // A scenario link must reload; see the note on this module.
  return link.reload ? (
    <a href={link.href} className={className} data-dev-scenario={link.href}>
      {body}
    </a>
  ) : (
    <Link to={link.href} className={className} data-dev-tool={link.href}>
      {body}
    </Link>
  );
}

/**
 * Reset the signed-in account's journey, so the whole flow can be re-run
 * without creating an account.
 *
 * Deliberately its own component: it is the only thing on this page that reads
 * encrypted settings, and mounting it unconditionally would mean opening `/dev`
 * issued a settings read (and, with an extension signer, a decrypt prompt). It
 * is mounted only once a developer asks for it.
 */
function ResetJourneyControl() {
  const { resetGuideDev } = usePostOnboardingGuide();
  const [done, setDone] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => {
          void resetGuideDev().then(() => setDone(true));
        }}
      >
        <RotateCcw className="size-3.5" aria-hidden />
        Reset this account’s journey
      </Button>
      {done && <span className="text-xs text-muted-foreground">Reset.</span>}
    </div>
  );
}

export function DevPlaygroundPage() {
  const [resetArmed, setResetArmed] = useState(false);

  if (!isLocalhostDev()) return null;

  return (
    <main data-dev-playground="">
      <PageHeader title="Developer Playground" icon={<FlaskConical className="size-5" />} />

      <div className="mx-auto w-full max-w-5xl space-y-8 px-4 pb-16 pt-2">
        <header className="max-w-2xl space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">
            Localhost only
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Manual tests for the first-session experience. Nothing here publishes, signs, or
            writes settings — every entry sets a harness scenario and loads the real screen.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            <b className="text-foreground">Direct states</b> render one phase on load, for
            visual, responsive and dark/light review.{' '}
            <b className="text-foreground">Full flows</b> run the real state machine — the claim
            path, persistence and the reveal choreography — against stand-in services.
          </p>
        </header>

        {SECTIONS.map((section) => (
          <section key={section.title} className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-lg font-bold">{section.title}</h2>
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {section.description}
              </p>
            </div>

            {section.groups.map((group, index) => (
              <div key={group.title ?? index} className="space-y-2">
                {group.title && (
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.title}
                  </h3>
                )}
                {group.note && (
                  <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
                    {group.note}
                  </p>
                )}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {group.links.map((link) => (
                    <LinkTile key={`${link.href}-${link.label}`} link={link} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}

        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-lg font-bold">Real account</h2>
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Unlike everything above, this touches the signed-in account’s encrypted settings.
              It is loaded on request so that merely opening this page reads nothing.
            </p>
          </div>
          {resetArmed ? (
            <ResetJourneyControl />
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setResetArmed(true)}>
              Load account tools
            </Button>
          )}
        </section>
      </div>
    </main>
  );
}

export default DevPlaygroundPage;
