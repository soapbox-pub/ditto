/**
 * DEV-ONLY onboarding playground — never shipped to production.
 *
 * This file is imported exclusively from a route that is registered behind
 * `import.meta.env.DEV` in `AppRouter.tsx`. In a production build that branch is
 * statically false, so Vite tree-shakes the lazy import and this entire module
 * (and its `SetupQuestionnaire` preview wiring) is excluded from the bundle.
 *
 * Purpose: preview and test onboarding states quickly — every welcome intent,
 * every step (including the conversations-only `topics` step), simulated topic
 * selections, and the sessionStorage Search handoff that `OnboardingTopicsHandoff`
 * consumes.
 *
 * Two preview modes:
 *  - UI-only (default): walks the real screens with every side effect simulated
 *    (no key generation, saveNsec, login, profile/follow publishing, or Nostr
 *    writes). Driven by `SetupQuestionnaire`'s `devUiOnly` prop, itself
 *    hard-gated by `import.meta.env.DEV`.
 *  - Real flow (clearly warned): runs the actual onboarding behavior.
 *
 * To remove later: delete this file, delete `src/dev/`, and remove the
 * `import.meta.env.DEV && (...)` dev route block in `AppRouter.tsx`.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { SetupQuestionnaire } from "@/components/InitialSyncGate";
import {
  TOPIC_CHOICES,
  WELCOME_CHOICES,
  type SelectedTopic,
  type Step,
  type WelcomeIntent,
} from "@/components/onboardingChoices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppContext } from "@/hooks/useAppContext";
import { ONBOARDING_SEARCH_KEY } from "@/lib/onboardingHandoff";
import { getStorageKey } from "@/lib/storageKey";
import { cn } from "@/lib/utils";

/** The signup steps a dev can jump straight into, in flow order. */
const PREVIEWABLE_STEPS: Step[] = [
  "welcome",
  "theme",
  "keygen",
  "download",
  "profile",
  "topics",
  "follows",
  "outro",
];

/**
 * Hard belt-and-braces guard. The route is already gated by
 * `import.meta.env.DEV` in AppRouter (so this never registers in prod), but we
 * re-check here so the component is inert even if it were ever imported
 * directly by mistake.
 */
function notDev(): boolean {
  return !import.meta.env.DEV;
}

export function DevOnboardingPlayground() {
  const navigate = useNavigate();
  const { config } = useAppContext();

  const [intent, setIntent] = useState<WelcomeIntent | "none">("conversations");
  const [startStep, setStartStep] = useState<Step>("welcome");
  const [topicIds, setTopicIds] = useState<Set<string>>(new Set());
  const [seedQuery, setSeedQuery] = useState("Music Games #nostr");
  const [lastAction, setLastAction] = useState<string | null>(null);

  // A fresh key each time we (re)launch a preview so SetupQuestionnaire fully
  // remounts with the chosen initial intent/step/topics.
  const [previewKey, setPreviewKey] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  // Which mode the active/most-recent preview was launched in.
  const [previewMode, setPreviewMode] = useState<"ui-only" | "real">("ui-only");

  const searchKey = getStorageKey(config.appId, ONBOARDING_SEARCH_KEY);

  const selectedTopics = useMemo<SelectedTopic[]>(
    () =>
      TOPIC_CHOICES.filter((t) => topicIds.has(t.id)).map((t) => ({
        id: t.id,
        label: t.label,
      })),
    [topicIds],
  );

  const devInitialIntents = useMemo(
    () => (intent === "none" ? [] : [intent]),
    [intent],
  );

  if (notDev()) return null;

  const toggleTopic = (id: string) => {
    setTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startPreview = (mode: "ui-only" | "real") => {
    setPreviewMode(mode);
    setPreviewKey((k) => k + 1);
    setPreviewing(true);
  };

  const seedHandoff = () => {
    const trimmed = seedQuery.trim();
    try {
      if (trimmed) {
        sessionStorage.setItem(searchKey, trimmed);
        setLastAction(`Seeded handoff key "${searchKey}" = "${trimmed}".`);
      } else {
        sessionStorage.removeItem(searchKey);
        setLastAction(`Cleared handoff key "${searchKey}" (empty input).`);
      }
    } catch {
      setLastAction("sessionStorage unavailable — could not seed handoff.");
    }
  };

  const clearHandoff = () => {
    try {
      sessionStorage.removeItem(searchKey);
      setLastAction(`Cleared handoff key "${searchKey}".`);
    } catch {
      setLastAction("sessionStorage unavailable — nothing to clear.");
    }
  };

  // Live onboarding preview, rendered full-screen (SetupQuestionnaire owns its
  // own fixed overlay). A small floating "Close preview" button sits on top.
  if (previewing) {
    const uiOnly = previewMode === "ui-only";
    return (
      <>
        <SetupQuestionnaire
          key={previewKey}
          isSignup
          devInitialStep={startStep}
          devInitialIntents={devInitialIntents}
          devInitialTopics={selectedTopics}
          devUiOnly={uiOnly}
          onPreload={() => {}}
          onComplete={() => {
            setPreviewing(false);
            setLastAction(
              uiOnly
                ? "UI-only preview completed."
                : "Real flow preview reached onComplete (Start exploring).",
            );
          }}
        />
        <div className="fixed top-3 right-3 z-[60] flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium shadow-lg",
              uiOnly
                ? "bg-emerald-600 text-white"
                : "bg-red-600 text-white",
            )}
          >
            {uiOnly ? "UI-only preview" : "REAL flow"}
          </span>
          <button
            type="button"
            onClick={() => setPreviewing(false)}
            className="rounded-full bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow-lg"
          >
            Close preview
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          Dev-only onboarding playground. Not included in production builds.
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Onboarding Playground
          </h1>
          <p className="text-sm text-muted-foreground">
            Preview onboarding as a new signup. The default UI-only mode
            simulates all side effects — no real accounts, no Nostr writes. A
            separate, clearly-warned real flow preview runs the actual behavior.
          </p>
        </div>

        {/* Intent */}
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <Label className="text-sm font-semibold">Welcome intent</Label>
          <div className="flex flex-wrap gap-2">
            {WELCOME_CHOICES.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => setIntent(choice.id as WelcomeIntent)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
                  intent === choice.id
                    ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                    : "border-border bg-background hover:bg-accent",
                )}
              >
                <span aria-hidden>{choice.emoji}</span>
                {choice.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setIntent("none")}
              className={cn(
                "inline-flex items-center rounded-full border px-3 py-1.5 text-sm",
                intent === "none"
                  ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                  : "border-border bg-background hover:bg-accent",
              )}
            >
              No intent (skip)
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            The <code>topics</code> step only appears when the resolved primary
            intent is <strong>Show better conversations</strong>.
          </p>
        </section>

        {/* Start step */}
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <Label className="text-sm font-semibold">Start at step</Label>
          <div className="flex flex-wrap gap-2">
            {PREVIEWABLE_STEPS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStartStep(s)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-mono",
                  startStep === s
                    ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                    : "border-border bg-background hover:bg-accent",
                )}
              >
                {s}
              </button>
            ))}
          </div>
          {startStep === "topics" && intent !== "conversations" && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Heads up: the <code>topics</code> step previews in isolation, but
              in the real flow it only appears for the conversations intent.
            </p>
          )}
        </section>

        {/* Simulated topics */}
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <Label className="text-sm font-semibold">
            Simulated topics (conversations intent)
          </Label>
          <div className="flex flex-wrap gap-2">
            {TOPIC_CHOICES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTopic(t.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm",
                  topicIds.has(t.id)
                    ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                    : "border-border bg-background hover:bg-accent",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {selectedTopics.length > 0
              ? `${selectedTopics.length} topic(s) pre-selected. They shape the outro copy and the Search handoff written on completion.`
              : "No topics selected — the topics step opens empty."}
          </p>
        </section>

        {/* Launch — UI-only is the default, visually-preferred action. */}
        <section className="space-y-4 rounded-xl border bg-card p-4">
          <Label className="text-sm font-semibold">Launch preview</Label>

          <div className="space-y-2">
            <Button
              size="lg"
              onClick={() => startPreview("ui-only")}
              className="w-full"
            >
              Launch UI-only preview
            </Button>
            <p className="text-xs text-muted-foreground">
              Default. Walks the real onboarding screens but simulates every
              side effect: no key generation, no <code>saveNsec</code>, no
              login, no profile/follow publishing, no Nostr or sessionStorage
              writes.
            </p>
          </div>

          <div className="space-y-2 rounded-lg border border-red-500/40 bg-red-500/5 p-3">
            <p className="text-xs font-medium text-red-600 dark:text-red-400">
              Real flow: may create keys, login, save profile, and publish to
              Nostr.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => startPreview("real")}
              className="border-red-500/50 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
            >
              Launch real flow preview
            </Button>
          </div>
        </section>

        {/* Reset / handoff tools */}
        <section className="space-y-4 rounded-xl border bg-card p-4">
          <Label className="text-sm font-semibold">
            Search handoff &amp; reset tools
          </Label>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Manually seed the onboarding Search handoff
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={seedQuery}
                onChange={(e) => setSeedQuery(e.target.value)}
                placeholder="Music Games #nostr"
                className="max-w-xs"
              />
              <Button variant="secondary" onClick={seedHandoff}>
                Seed Search handoff
              </Button>
              <Button variant="outline" onClick={() => navigate("/")}>
                Go to app root
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Seeds <code>{searchKey}</code> in sessionStorage, then "Go to app
              root" lets <code>OnboardingTopicsHandoff</code> consume it and
              route to Search. (Search behavior itself is unchanged in this pass.)
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={clearHandoff}>
              Clear Search handoff key
            </Button>
          </div>

          {lastAction && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {lastAction}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

export default DevOnboardingPlayground;
