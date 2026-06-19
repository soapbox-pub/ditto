/**
 * DEV-ONLY onboarding playground — never shipped to production.
 *
 * This file is imported exclusively from a route that is registered behind
 * `import.meta.env.DEV` in `AppRouter.tsx`. In a production build that branch is
 * statically false, so Vite tree-shakes the lazy import and this entire module
 * (and its `SetupQuestionnaire` preview wiring) is excluded from the bundle.
 *
 * Purpose: preview and test the unified signup onboarding quickly — jump to any
 * real signup step and walk the screens. The flow is a single path now (no
 * intent selection, no topics step, no Search handoff); deeper product
 * education lives in the separate post-onboarding tour, which will ship its own
 * playground/handoff architecture when it's built.
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
import { useState } from "react";

import { SetupQuestionnaire } from "@/components/InitialSyncGate";
import { type Step } from "@/components/onboardingChoices";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** The signup steps a dev can jump straight into, in flow order. */
const PREVIEWABLE_STEPS: Step[] = [
  "welcome",
  "theme",
  "keygen",
  "download",
  "profile",
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
  const [startStep, setStartStep] = useState<Step>("welcome");
  const [lastAction, setLastAction] = useState<string | null>(null);

  // A fresh key each time we (re)launch a preview so SetupQuestionnaire fully
  // remounts with the chosen initial step.
  const [previewKey, setPreviewKey] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  // Which mode the active/most-recent preview was launched in.
  const [previewMode, setPreviewMode] = useState<"ui-only" | "real">("ui-only");

  if (notDev()) return null;

  const startPreview = (mode: "ui-only" | "real") => {
    setPreviewMode(mode);
    setPreviewKey((k) => k + 1);
    setPreviewing(true);
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
            Preview the unified signup onboarding. The default UI-only mode
            simulates all side effects — no real accounts, no Nostr writes. A
            separate, clearly-warned real flow preview runs the actual behavior.
          </p>
        </div>

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
          <p className="text-xs text-muted-foreground">
            The signup flow is a single path:{" "}
            <code>welcome → theme → keygen → download → profile → follows → outro</code>.
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
              login, no profile/follow publishing, no Nostr writes.
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

        {/*
          Legacy / future tour handoff:

          The old signup "topics" step seeded a sessionStorage Search handoff
          (onboardingHandoff.ts + OnboardingTopicsHandoff) that routed the
          just-onboarded user to /t/:tag or /search?q=. That experiment has been
          removed — signup is now a single, unified setup path with no topic
          selection and no Search redirect. The post-onboarding product tour
          will reintroduce its own routing/handoff architecture (with names and
          behavior that match the tour) when it's built, so there is
          intentionally nothing to test here for now.
        */}

        {lastAction && (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            {lastAction}
          </p>
        )}
      </div>
    </div>
  );
}

export default DevOnboardingPlayground;
