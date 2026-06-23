import type { NostrEvent, NostrMetadata } from "@nostrify/nostrify";
import { useNostr } from "@nostrify/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Heart,
  Loader2,
  Plus,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import { saveNsec } from "@/lib/credentialManager";
import { openUrl } from "@/lib/downloadFile";
import { fetchFreshEvent } from "@/lib/fetchFreshEvent";
import { getStorageKey } from "@/lib/storageKey";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DittoLogo } from "@/components/DittoLogo";
import { ImageCropDialog } from "@/components/ImageCropDialog";
import { IntroImage } from "@/components/IntroImage";
import { ProfileCard } from "@/components/ProfileCard";
import { ThemeGrid } from "@/components/ThemeSelector";
import { ColorPicker } from "@/components/ui/color-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveProfileTheme } from "@/hooks/useActiveProfileTheme";
import { useAppContext } from "@/hooks/useAppContext";
import { type AuthorData, useAuthors } from "@/hooks/useAuthors";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useEncryptedSettings, getLocalSettingsSync } from "@/hooks/useEncryptedSettings";
import { type SyncPhase, useInitialSync } from "@/hooks/useInitialSync";
import { useLoginActions } from "@/hooks/useLoginActions";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { OnboardingContext } from "@/hooks/useOnboarding";
import { useTheme } from "@/hooks/useTheme";
import { toast } from "@/hooks/useToast";
import { useUploadFile } from "@/hooks/useUploadFile";
import { getAvatarShape, isValidAvatarShape } from "@/lib/avatarShape";
import { hexToHslString, hslStringToHex } from "@/lib/colorUtils";
import { sanitizeUrl } from "@/lib/sanitizeUrl";
import { tryNpubEncode } from "@/lib/safeNip19";
import {
  type CoreThemeColors,
  resolveTheme,
  resolveThemeConfig,
} from "@/themes";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// InitialSyncGate
// ---------------------------------------------------------------------------

interface InitialSyncGateProps {
  children: ReactNode;
}

/**
 * Gates the main app behind an initial sync / setup flow for logged-in users.
 * - Logged-out users pass straight through.
 * - Logged-in users see a sync spinner, then either proceed (settings found)
 *   or walk through a brief questionnaire (fresh account / new device with no settings).
 * - Also provides `useOnboarding().startSignup()` for triggering signup from anywhere.
 */
export function InitialSyncGate({ children }: InitialSyncGateProps) {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { phase, markComplete } = useInitialSync();
  const { isLoading: settingsLoading } = useEncryptedSettings();
  const [preloadApp, setPreloadApp] = useState(false);
  const [signupActive, setSignupActive] = useState(false);
  // Track whether we've shown the app at least once so we don't re-gate on
  // subsequent background refetches (e.g. window focus).
  const hasShownApp = useRef(false);

  const startSignup = useCallback(() => setSignupActive(true), []);

  const handleSignupComplete = useCallback(() => {
    // Land brand-new users on the Ditto feed instead of their (empty)
    // Following feed. useFeedTab reads this sessionStorage key on init, so
    // seeding it here nudges only the just-onboarded user — existing users,
    // who already have a value or default to Follows, are untouched.
    try {
      sessionStorage.setItem(
        getStorageKey(config.appId, "feed-tab:home"),
        "ditto",
      );
    } catch {
      // sessionStorage unavailable — fall back to default tab behavior.
    }
    setSignupActive(false);
    markComplete();
  }, [markComplete, config.appId]);

  const contextValue = useMemo(() => ({ startSignup }), [startSignup]);

  // Signup flow takes priority (doesn't require a logged-in user yet)
  if (signupActive) {
    return (
      <OnboardingContext.Provider value={contextValue}>
        {preloadApp && <div className="invisible">{children}</div>}
        <SetupQuestionnaire
          onComplete={handleSignupComplete}
          onPreload={() => setPreloadApp(true)}
          isSignup
        />
      </OnboardingContext.Provider>
    );
  }

  // Don't show sync/onboarding when logged out — just show the app.
  // Reset hasShownApp so that re-login shows the spinner until settings load.
  if (!user) {
    hasShownApp.current = false;
    return (
      <OnboardingContext.Provider value={contextValue}>
        {children}
      </OnboardingContext.Provider>
    );
  }

  // Normal logged-in sync flow
  if (phase === "syncing" || phase === "found") {
    return (
      <OnboardingContext.Provider value={contextValue}>
        <SyncScreen phase={phase} />
      </OnboardingContext.Provider>
    );
  }

  if (phase === "not-found") {
    return (
      <OnboardingContext.Provider value={contextValue}>
        {preloadApp && <div className="invisible">{children}</div>}
        <SetupQuestionnaire
          onComplete={markComplete}
          onPreload={() => setPreloadApp(true)}
        />
      </OnboardingContext.Provider>
    );
  }

  // For returning users (phase === "complete"), decide whether to gate:
  // - If we have a local lastSync timestamp, localStorage is trustworthy and
  //   we can render immediately. NostrSync will hot-swap any differences in
  //   the background once the remote settings arrive.
  // - If there's NO local timestamp (e.g. localStorage was cleared, or settings
  //   were never synced on this browser), show the spinner until settings load
  //   so the user sees correct state from the start.
  // Only gate on the very first load — once the app has been shown, don't
  // re-gate on background refetches (e.g. window focus).
  if (phase === "complete" && settingsLoading && !hasShownApp.current) {
    const hasLocalSync = user ? getLocalSettingsSync(user.pubkey) > 0 : false;
    if (!hasLocalSync) {
      return (
        <OnboardingContext.Provider value={contextValue}>
          <SyncScreen phase="syncing" />
        </OnboardingContext.Provider>
      );
    }
  }

  hasShownApp.current = true;

  // idle or complete -> show app
  return (
    <OnboardingContext.Provider value={contextValue}>
      {children}
    </OnboardingContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Sync Screen
// ---------------------------------------------------------------------------

function SyncScreen({ phase }: { phase: SyncPhase }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-8 px-6 text-center max-w-sm">
        {/* Logo with gentle pulse */}
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping opacity-30" />
          <DittoLogo size={72} className="relative" />
        </div>

        {/* Spinner */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 rounded-full border-[2.5px] border-primary/20" />
            <div className="absolute inset-0 rounded-full border-[2.5px] border-transparent border-t-primary animate-spin" />
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">
              {phase === "found"
                ? "Settings restored"
                : "Syncing your settings..."}
            </p>
            <p className="text-xs text-muted-foreground">
              {phase === "found"
                ? "Welcome back! Loading your experience..."
                : "Checking for your preferences across devices"}
            </p>
          </div>
        </div>

        {phase === "syncing" && (
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse"
                style={{ animationDelay: `${i * 200}ms` }}
              />
            ))}
          </div>
        )}

        {phase === "found" && (
          <div className="flex items-center gap-2 text-primary">
            <Check className="w-4 h-4" />
            <span className="text-sm font-medium">All set</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup Questionnaire
// ---------------------------------------------------------------------------

/** Suggested follow packs shown to new users with empty follow lists. */
const SUGGESTED_PACKS: {
  kind: number;
  pubkey: string;
  identifier: string;
  /** Optional friendlier description shown instead of the pack's own. */
  description?: string;
}[] =
  [
    {
      kind: 39089,
      pubkey:
        "932614571afcbad4d17a191ee281e39eebbb41b93fac8fd87829622aeb112f4d",
      identifier: "k4p5w0n22suf",
      description:
        "Builders, writers, and curious internet people shaping strange new corners of the web.",
    },
  ];

// Steps for signup (includes welcome + keygen + profile) vs. settings-only (existing login)
type SignupStep = "welcome" | "keygen" | "download" | "profile";
type SettingsStep = "theme" | "follows" | "outro";
type Step = SignupStep | SettingsStep;

const SETTINGS_STEPS: Step[] = ["theme", "follows", "outro"];

/**
 * Build the ordered signup step list. A single, unified setup path. Deeper
 * product education lives in the separate post-onboarding tour. The step order
 * is index-driven, so the progress bar and next/back navigation pick it up
 * automatically.
 */
function buildSignupSteps(): Step[] {
  return [
    "welcome",
    "theme",
    "keygen",
    "download",
    "profile",
    "follows",
    "outro",
  ];
}

function SetupQuestionnaire({
  onComplete,
  onPreload,
  isSignup = false,
}: {
  onComplete: () => void;
  onPreload: () => void;
  isSignup?: boolean;
}) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const login = useLoginActions();

  const steps = useMemo(
    () => (isSignup ? buildSignupSteps() : SETTINGS_STEPS),
    [isSignup],
  );

  const [step, setStep] = useState<Step>(
    () => (isSignup ? "welcome" : "theme"),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [hasFollows, setHasFollows] = useState<boolean | null>(null);

  // Signup-specific state
  const [nsec, setNsec] = useState("");

  // Derived pubkey for the just-generated nsec. Used as a defensive guard at
  // every signup publish site to ensure we sign with the *new* account, not a
  // previously logged-in one. Without this, a regression in useLoginActions's
  // auto-switch (or any future re-ordering of logins) could overwrite the
  // previous user's kind 0 metadata / kind 3 follow list during onboarding.
  const expectedPubkey = useMemo(() => {
    if (!nsec) return undefined;
    try {
      const decoded = nip19.decode(nsec);
      if (decoded.type !== "nsec") return undefined;
      return getPublicKey(decoded.data);
    } catch {
      return undefined;
    }
  }, [nsec]);

  const stepIndex = steps.indexOf(step);
  const progress = (stepIndex / (steps.length - 1)) * 100;

  // Single source of truth for forward/back navigation: walk the active step
  // list (`steps`) and skip any step that isn't currently renderable. This is
  // the ONLY place step order is enforced — no step hardcodes its successor.
  //
  // `hasFollowsOverride` lets callers that *just* computed the follow-list
  // state (handleSaveAndContinue) advance with the fresh value before the
  // `hasFollows` state update has flushed.
  const stepRenderable = useCallback(
    (s: Step, hasFollowsValue: boolean | null) =>
      s === "follows" ? hasFollowsValue === false : true,
    [],
  );

  const advance = useCallback(
    (from: Step, direction: 1 | -1, hasFollowsOverride?: boolean | null) => {
      const effectiveHasFollows = hasFollowsOverride ?? hasFollows;
      const i = steps.indexOf(from);
      for (let j = i + direction; j >= 0 && j < steps.length; j += direction) {
        if (stepRenderable(steps[j], effectiveHasFollows)) {
          setStep(steps[j]);
          return;
        }
      }
    },
    [steps, hasFollows, stepRenderable],
  );

  const next = useCallback(() => advance(step, 1), [advance, step]);
  const back = useCallback(() => advance(step, -1), [advance, step]);

  // Keygen handler — generates the key and advances to the save step.
  // The credential manager prompt is deferred until the user clicks "Continue".
  const handleGenerate = useCallback(() => {
    const sk = generateSecretKey();
    const encoded = nip19.nsecEncode(sk);
    setNsec(encoded);
    next();
  }, [next]);

  // Continue handler for the download step — saves the key via the best
  // available method (native credential manager on iOS/Android, file download
  // on web) and logs in. It does NOT advance: the DownloadStep shows a small
  // "saved somewhere safe?" confirmation ritual after this resolves, and only
  // advances once the user explicitly confirms (via `next` passed separately).
  //
  // If the user dismisses the iOS credential prompt, `saveNsec` resolves to
  // `'dismissed'` and we still proceed to the confirmation — dismissal is a
  // legitimate choice (e.g. the user is saving the key in their own password
  // manager).
  //
  // On Android, if no credential provider is available (e.g. GrapheneOS or
  // other de-Googled devices), `saveNsec` falls back to writing the key to
  // the app's Documents folder and returns `'saved-to-file'`. We surface a
  // toast so the user knows where to find the backup file.
  //
  // Only unexpected errors (decode failure, filesystem write failure)
  // surface as a destructive toast and re-throw so the DownloadStep keeps the
  // user on the key view instead of advancing to the confirmation.
  const handleDownloadContinue = useCallback(async () => {
    try {
      const decoded = nip19.decode(nsec);
      if (decoded.type !== "nsec") throw new Error("Invalid nsec");

      const pubkey = getPublicKey(decoded.data);
      const npub = nip19.npubEncode(pubkey);

      const result = await saveNsec(npub, nsec, config.appName);

      if (result === "saved-to-file") {
        toast({
          title: "Secret key saved",
          description:
            "Your secret key was saved to the Documents folder on your device.",
        });
      }

      login.nsec(nsec);
    } catch {
      toast({
        title: "Save failed",
        description:
          "Could not save the key. Please copy it manually.",
        variant: "destructive",
      });
      throw new Error("save-failed");
    }
  }, [nsec, login, config.appName]);

  // Check for existing follows and transition to the follows step (or outro if they have follows).
  //
  // Historically this callback also wrote a hardcoded `feedSettings` block + `contentWarningPolicy`
  // to both local config and encrypted relay settings. That block was the save handler for a
  // questionnaire that has since been removed, so it was overwriting settings with a stale
  // curated preset — clobbering the app-wide defaults in `App.tsx` (especially on the
  // `phase === 'not-found'` path, where a returning user on a new device could lose their
  // tuned feed settings if the encrypted-settings fetch returned empty). Defaults live in
  // `App.tsx`'s `defaultConfig` and cross-device sync handles the rest.
  const handleSaveAndContinue = useCallback(async () => {
    setIsSaving(true);

    // Check if the user already has a follow list
    let userHasFollows = false;
    if (user) {
      try {
        const events = await nostr.query(
          [{ kinds: [3], authors: [user.pubkey], limit: 1 }],
          { signal: AbortSignal.timeout(5000) },
        );
        if (events.length > 0) {
          const pTags = events[0].tags.filter(([n]) => n === "p");
          userHasFollows = pTags.length > 0;
        }
      } catch {
        userHasFollows = true;
      }
    }

    setHasFollows(userHasFollows);
    setIsSaving(false);

    // Advance through the active step list from the current step, skipping the
    // follows step when the user already has a follow list. The freshly-computed
    // value is passed as an override so we don't read stale `hasFollows` state.
    advance(step, 1, userHasFollows);
  }, [user, nostr, advance, step]);

  // Finish onboarding. After the outro, the app continues to its normal default
  // landing behavior. Deeper product education is handled later by the separate
  // post-onboarding tour.
  const handleComplete = useCallback(() => {
    onComplete();
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background h-[100dvh]">
      {/* Ambient warmth — a soft, static brand-tinted gradient so the flow
          doesn't feel flat. Non-interactive and behind all content. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,hsl(var(--primary)/0.10),transparent_60%)]"
      />

      {/* Progress bar */}
      <div className="relative h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Content area */}
      <div className="relative flex-1 flex flex-col overflow-y-auto overscroll-contain">
        <div className="w-full max-w-md mx-auto my-auto px-6 py-6 sm:py-12">
          {/* Signup steps */}
          {step === "welcome" && <WelcomeStep onNext={next} />}

          {step === "keygen" && <KeygenStep onGenerate={handleGenerate} />}

          {step === "download" && (
            <DownloadStep
              nsec={nsec}
              onContinue={handleDownloadContinue}
              onConfirm={next}
            />
          )}

          {step === "profile" && (
            <ProfileStep
              onNext={handleSaveAndContinue}
              isSaving={isSaving}
              expectedPubkey={expectedPubkey}
            />
          )}

          {/* Settings steps */}
          {step === "theme" && (
            <ThemeStep
              onNext={isSignup ? next : handleSaveAndContinue}
              onBack={back}
              isFirst={steps.indexOf("theme") === 0}
              fromWelcome={isSignup}
              isSaving={!isSignup && isSaving}
            />
          )}

          {step === "follows" && hasFollows === false && (
            <FollowsStep
              onNext={(didFollow) => {
                if (didFollow) onPreload();
                next();
              }}
              onBack={back}
              expectedPubkey={expectedPubkey}
            />
          )}

          {step === "outro" && <OutroStep onComplete={handleComplete} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Welcome Step
// ---------------------------------------------------------------------------

const GENERIC_OUTRO =
  "Your space is ready. Explore, follow a few people, or post something small.";

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-7 sm:gap-9 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="relative motion-safe:animate-in motion-safe:zoom-in-90 motion-safe:duration-700">
        {/* Soft glow behind the logo for a little warmth */}
        <div className="absolute -inset-5 rounded-full bg-primary/15 blur-2xl motion-safe:animate-pulse" />
        <DittoLogo size={56} className="relative sm:hidden" />
        <DittoLogo size={72} className="relative hidden sm:block" />
      </div>

      <div className="space-y-3 sm:space-y-4 max-w-sm">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-balance">
          A social app that starts with you
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground leading-relaxed text-pretty">
          Pick your look, set up your account, and fill your first feed with
          people worth hearing from.
        </p>
      </div>

      <Button
        size="lg"
        className="w-full max-w-xs gap-2 rounded-full h-12 motion-safe:transition-transform motion-safe:active:scale-[0.98]"
        onClick={onNext}
      >
        Start
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signup steps: Keygen, Download, Profile
// ---------------------------------------------------------------------------

function KeygenStep({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-6 sm:gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="relative motion-safe:animate-in motion-safe:zoom-in-90 motion-safe:duration-700">
        <div className="absolute -inset-5 rounded-full bg-primary/15 blur-2xl motion-safe:animate-pulse" />
        <DittoLogo size={64} className="relative sm:hidden" />
        <DittoLogo size={80} className="relative hidden sm:block" />
      </div>

      <div className="space-y-2 sm:space-y-3">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
          Create your account
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto text-pretty">
          This account belongs to you. Ditto will create a private key so you
          can come back safely.
        </p>
        <p className="text-xs text-muted-foreground/70 leading-relaxed max-w-sm mx-auto">
          Keep it private. You don't need to understand the math.
        </p>
      </div>

      <Button
        size="lg"
        className="w-full max-w-xs gap-2 rounded-full h-12 motion-safe:transition-transform motion-safe:active:scale-[0.98]"
        onClick={onGenerate}
      >
        Create my account key
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

function DownloadStep({
  nsec,
  onContinue,
  onConfirm,
}: {
  nsec: string;
  /** Saves the key and logs in. Resolves on success; throws on failure. */
  onContinue: () => Promise<void> | void;
  /** Advances to the next step. Called only after the user confirms they saved it. */
  onConfirm: () => void;
}) {
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // After the key is saved we don't advance immediately. Instead we show a
  // small, calm confirmation ritual ("saved somewhere safe?") so the user
  // takes one more beat to make sure they can find the key later. They only
  // continue once they explicitly confirm.
  const [confirming, setConfirming] = useState(false);

  // Wrap the continue handler in an in-flight guard so rapid double-taps
  // don't trigger multiple credential prompts. `finally` guarantees the
  // button is re-enabled even if the handler throws, so users can never
  // get stuck on a disabled button. On success we move to the confirmation
  // step; on failure (handler throws) we stay on the key view.
  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onContinue();
      setConfirming(true);
    } catch {
      // onContinue already surfaced a toast; keep the user on the key view.
    } finally {
      setIsSaving(false);
    }
  };

  // "Show key again" — return to the key view with the key revealed so the
  // user can re-save it before confirming.
  const handleShowAgain = () => {
    setConfirming(false);
    setShowKey(true);
  };

  if (confirming) {
    return (
      <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-400">
        <div className="flex flex-col items-center text-center gap-4">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="size-7" />
          </span>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">
              Saved somewhere safe?
            </h2>
            <p className="text-sm text-muted-foreground text-pretty">
              Take one more second to make sure you can find it later.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            className="w-full gap-2 rounded-full h-12"
            onClick={onConfirm}
          >
            <Check className="w-4 h-4" /> Yes, I saved it
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="w-full gap-2 rounded-full h-12"
            onClick={handleShowAgain}
          >
            <Eye className="w-4 h-4" /> Show key again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-400">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">
          Save your key
        </h2>
        <p className="text-sm text-muted-foreground text-pretty">
          Save this key somewhere safe. It's how you get back in.
        </p>
      </div>

      <div className="relative">
        <Input
          type={showKey ? "text" : "password"}
          value={nsec}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
          onClick={(e) => e.currentTarget.select()}
          className="pr-10 font-mono text-base md:text-sm"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
          onClick={() => setShowKey(!showKey)}
        >
          {showKey ? (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Eye className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>

      {/* Calm, always-visible safety note — "protect what's yours", not a scare. */}
      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-3">
        <ShieldCheck className="size-4 mt-0.5 shrink-0 text-primary" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          If you lose it, you may lose access. If someone else gets it, they can
          use your account.
        </p>
      </div>

      {showKey && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800 animate-in fade-in slide-in-from-top-1 duration-200">
          <p className="text-xs text-amber-900 dark:text-amber-300">
            Keep your key private. Avoid screenshotting it or pasting it anywhere except a password manager, anyone who has it can use your account.{" "}
            <a
              href="https://soapbox.pub/blog/managing-nostr-keys/"
              onClick={(e) => {
                e.preventDefault();
                openUrl("https://soapbox.pub/blog/managing-nostr-keys/");
              }}
              className="underline underline-offset-2 hover:no-underline"
            >
              Learn more
            </a>
          </p>
        </div>
      )}

      <Button
        size="lg"
        className="w-full gap-2 rounded-full h-12"
        onClick={handleSave}
        disabled={isSaving}
      >
        {isSaving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Saving…
          </>
        ) : (
          <>
            <Download className="w-4 h-4" /> Save Key
          </>
        )}
      </Button>
    </div>
  );
}

function ProfileStep({
  onNext,
  isSaving = false,
  expectedPubkey,
}: {
  onNext: () => void;
  isSaving?: boolean;
  /**
   * Hex pubkey of the just-generated signup key. When set, the publish
   * handler refuses to publish kind 0 unless the active signer matches —
   * a defensive guard against signing with a previously logged-in user's
   * key and overwriting their profile metadata.
   */
  expectedPubkey?: string;
}) {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent, isPending: isPublishing } =
    useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const pickInputRef = useRef<HTMLInputElement>(null);
  const pendingField = useRef<"picture" | "banner">("picture");

  const [profileData, setProfileData] = useState<Partial<NostrMetadata>>({
    name: "",
    about: "",
    picture: "",
    banner: "",
    website: "",
    shape: "",
  });
  const [cropState, setCropState] = useState<{
    imageSrc: string;
    aspect: number;
    field: "picture" | "banner";
  } | null>(null);

  const handlePickImage = useCallback((field: "picture" | "banner") => {
    pendingField.current = field;
    pickInputRef.current?.click();
  }, []);

  const handleFileChosen = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      const field = pendingField.current;
      setCropState({
        imageSrc: URL.createObjectURL(file),
        aspect: field === "picture" ? 1 : 3,
        field,
      });
    },
    [],
  );

  const handleCropConfirm = useCallback(
    async (blob: Blob) => {
      if (!cropState) return;
      const { field, imageSrc } = cropState;
      URL.revokeObjectURL(imageSrc);
      setCropState(null);
      try {
        const file = new File([blob], `${field}.jpg`, { type: "image/jpeg" });
        const [[, url]] = await uploadFile(file);
        setProfileData((prev) => ({ ...prev, [field]: url }));
      } catch {
        toast({
          title: "Upload failed",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    },
    [cropState, uploadFile],
  );

  const handleCropCancel = useCallback(() => {
    if (cropState) URL.revokeObjectURL(cropState.imageSrc);
    setCropState(null);
  }, [cropState]);

  const handlePublishProfile = useCallback(async () => {
    if (!user) return;

    // Defensive guard: when this is the signup flow, only publish kind 0 if
    // the active signer matches the freshly generated key. If the
    // auto-switch in useLoginActions ever fails to promote the new login,
    // publishing here would sign with the *previous* user's signer and
    // overwrite their kind 0 metadata. Refuse rather than risk it.
    if (expectedPubkey && user.pubkey !== expectedPubkey) {
      toast({
        title: "Profile not saved",
        description:
          "The new account is not active yet, so your profile was not published (this prevents overwriting another account). You can update it later from settings.",
        variant: "destructive",
      });
      return;
    }

    const hasData = Object.values(profileData).some((v) => v);
    if (hasData) {
      try {
        // Build the outgoing metadata, stripping empty strings and validating shape.
        const { shape, ...rest } = profileData;
        const data: Record<string, unknown> = { ...rest };
        if (shape && isValidAvatarShape(shape)) {
          data.shape = shape;
        }
        for (const key in data) {
          if (data[key] === "") delete data[key];
        }
        await publishEvent({ kind: 0, content: JSON.stringify(data), tags: [] });
        queryClient.invalidateQueries({ queryKey: ["logins"] });
        queryClient.invalidateQueries({ queryKey: ["author", user.pubkey] });
      } catch {
        toast({
          title: "Profile failed",
          description:
            "Your account was created but profile setup failed. You can update it later.",
          variant: "destructive",
        });
      }
    }
    onNext();
  }, [user, profileData, publishEvent, queryClient, onNext, expectedPubkey]);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-400">
      <div className="flex items-center gap-4">
        <IntroImage src="/profile-intro.png" />
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">
            Make yourself recognizable
          </h2>
          <p className="text-sm text-muted-foreground text-pretty">
            Add a name or photo so people know who they're meeting. You can
            change this anytime.
          </p>
        </div>
      </div>

      <input
        ref={pickInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChosen}
      />
      {cropState && (
        <ImageCropDialog
          open
          imageSrc={cropState.imageSrc}
          aspect={cropState.aspect}
          title={
            cropState.field === "picture"
              ? "Crop Profile Picture"
              : "Crop Banner"
          }
          onCancel={handleCropCancel}
          onCrop={handleCropConfirm}
        />
      )}

      <div className={cn(isPublishing && "opacity-50 pointer-events-none")}>
        <ProfileCard
          metadata={profileData}
          onChange={(patch) =>
            setProfileData((prev) => ({ ...prev, ...patch }))
          }
          onPickImage={handlePickImage}
          onAvatarShape={(shape) =>
            setProfileData((prev) => ({ ...prev, shape }))
          }
          showNip05={false}
        />
      </div>

      {isUploading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Uploading image…
        </div>
      )}

      <Button
        onClick={handlePublishProfile}
        className="w-full rounded-full h-11 gap-1.5"
        disabled={isPublishing || isUploading || isSaving}
      >
        {isPublishing || isSaving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Saving…
          </>
        ) : (
          <>
            Continue <ChevronRight className="w-4 h-4" />
          </>
        )}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings steps
// ---------------------------------------------------------------------------

function ThemeStep({
  onNext,
  onBack,
  isFirst = false,
  fromWelcome = false,
  isSaving = false,
}: {
  onNext: () => void;
  onBack: () => void;
  isFirst?: boolean;
  /** Whether the user arrived here from the welcome step (signup flow). */
  fromWelcome?: boolean;
  isSaving?: boolean;
}) {
  const { theme, customTheme, themes } = useTheme();
  const resolved = resolveTheme(theme);
  const activeConfig = resolved === 'custom' ? customTheme : resolveThemeConfig(resolved, themes);
  const bgUrl = activeConfig?.background?.url;

  // Discovery: count how many *distinct* themes the user manually selects.
  // We only reveal a small "create your own" affordance once they've actively
  // explored 2+ different themes — it should feel like a reward for tinkering,
  // not an extra required step. Crucially, we do NOT count the theme the user
  // arrived with. A user who picks a single theme and continues never sees the
  // custom option. The mini customizer below is local-only (applyCustomTheme
  // writes to AppContext even when logged out), so a custom theme built here
  // persists and can be published later from Settings once the account/key
  // exists. We intentionally do NOT mount the full ThemeSelector here (presets,
  // My Themes, publish/share) — too much surface for onboarding. The mini
  // customizer is colors-only during signup: background-image customization is
  // deferred until after account creation, where it can be uploaded to Blossom
  // and persisted properly (see TODO in src/pages/SettingsPage.tsx).
  //
  // ThemeGrid applies a selection imperatively (setTheme / applyCustomTheme)
  // and then calls `onSelect` synchronously — before AppContext (and therefore
  // `theme` / `customTheme` here) has re-rendered with the new value. So we
  // can't read the new theme inside the onSelect handler. Instead, onSelect
  // flips a "the user has started picking" flag, and an effect keyed on the
  // settled theme records each distinct theme *after* that first interaction.
  // This is what keeps the initial theme out of the count.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const hasInteracted = useRef(false);

  // Mobile carousel reveal gate. On mobile the themes are a one-at-a-time
  // carousel, so simply swiping forward through 2 themes shouldn't reveal
  // "create your own" the way trying 2 themes on the desktop grid does. Instead
  // we reveal once the user has actually explored the set: they reached the last
  // theme, OR they navigated backward at least once (comparing options). This
  // is mobile-only and never persisted beyond onboarding. The desktop grid
  // never fires `onCarouselNavigate`, so its behavior is untouched.
  const [mobileExplored, setMobileExplored] = useState(false);
  const handleCarouselNavigate = useCallback(
    ({ reachedLast, wentBackward }: { reachedLast: boolean; wentBackward: boolean }) => {
      if (reachedLast || wentBackward) setMobileExplored(true);
    },
    [],
  );

  // Which reveal rule applies depends on the layout, which is breakpoint-driven.
  // ThemeGrid switches between the mobile carousel and the desktop grid at
  // Tailwind's `sm` (640px), so we match that exact breakpoint here rather than
  // the app-wide `useIsMobile` (768px) to avoid a 640–767px mismatch.
  const [isDesktopLayout, setIsDesktopLayout] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches,
  );
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 640px)");
    const onChange = () => setIsDesktopLayout(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const themeKey = theme === "custom"
    ? `custom:${JSON.stringify(customTheme?.colors)}`
    : theme;

  const handleThemeSelected = useCallback(() => {
    hasInteracted.current = true;
  }, []);

  useEffect(() => {
    // Only start counting once the user has manually picked at least once.
    // This deliberately skips the theme the user landed on.
    if (!hasInteracted.current) return;
    setPicked((prev) => {
      if (prev.has(themeKey)) return prev;
      const next = new Set(prev);
      next.add(themeKey);
      return next;
    });
  }, [themeKey]);

  // Desktop: reward tinkering across 2+ distinct themes (unchanged).
  // Mobile: only after the user explored the carousel (last theme or a
  // backward move), so a couple of forward swipes don't reveal it early.
  const showCustomReveal = isDesktopLayout ? picked.size >= 2 : mobileExplored;

  // The theme-step content is laid over the active theme's published
  // background (painted just below). We give it a readable semi-transparent
  // surface whenever that background is visible.
  const hasBg = Boolean(bgUrl);

  return (
    <>
      {/* Theme-step-only background: preview the *active theme's* own published
          background here so picking a preset with art feels live. */}
      {bgUrl && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-0 bg-cover bg-center opacity-50 transition-all duration-700"
          style={{ backgroundImage: `url(${bgUrl})` }}
        />
      )}

      {/* Content — semi-transparent on desktop when a background is active so
          the theme-step background painted above shows through
          without hurting readability. */}
      <div
        className={cn(
          "relative z-10 flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-400",
          "sm:rounded-2xl sm:transition-[background-color,backdrop-filter] sm:duration-700",
          hasBg
            ? "sm:bg-background/60 sm:backdrop-blur-md sm:-mx-4 sm:px-4 sm:py-4"
            : "",
        )}
      >
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">
            {fromWelcome ? "Good. Let's start with the look" : "Choose your look"}
          </h2>
          <p className="text-sm text-muted-foreground transition-opacity duration-300">
            {showCustomReveal
              ? "Trying things out? Nice. You can also create your own look."
              : "Pick a starting look. You can change it anytime."}
          </p>
        </div>

        <ThemeGrid columns="scroll" limit={9} onSelect={handleThemeSelected} onCarouselNavigate={handleCarouselNavigate} />

        {/* Discovery reveal: a small, local-only "create your own" affordance
            that appears once the user has explored a couple of themes. Opens a
            tiny color customizer — NOT the full ThemeSelector.

            Entrance is a small "plim" discovery moment: a quick zoom-in + glow
            pulse and a one-shot ring ping on the icon. All purely motion-safe —
            reduced-motion users just get the card, no movement. No sound. */}
        {showCustomReveal && (
          <button
            type="button"
            onClick={() => setCustomizerOpen(true)}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl border-2 border-dashed border-border p-3.5 text-left",
              "transition-all duration-200 hover:border-primary/50 hover:bg-accent",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              // "Plim": zoom + fade entrance, slightly springy easing.
              "motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 motion-safe:ease-out",
              "motion-safe:active:scale-[0.98]",
            )}
          >
            <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
              {/* One-shot glow ring that pings outward on reveal, then settles. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-primary/40 motion-safe:animate-ping motion-safe:[animation-iteration-count:2] motion-reduce:hidden"
              />
              <Plus className="size-4 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-500" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">Create your own</span>
              <span className="block text-xs text-muted-foreground">
                Pick a few colors and make it yours.
              </span>
            </span>
          </button>
        )}

        {/* Tiny local color customizer (colors only during signup). */}
        <MiniThemeCustomizer
          open={customizerOpen}
          onOpenChange={setCustomizerOpen}
        />

        {isFirst ? (
          <Button
            onClick={onNext}
            className="w-full rounded-full h-11 gap-1.5"
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Saving...
              </>
            ) : (
              <>
                Continue <ChevronRight className="w-4 h-4" />
              </>
            )}
          </Button>
        ) : (
          <div className="flex gap-3">
            <Button
              variant="ghost"
              onClick={onBack}
              className="flex-1 rounded-full h-11"
              disabled={isSaving}
            >
              Back
            </Button>
            <Button
              onClick={onNext}
              className="flex-1 rounded-full h-11 gap-1.5"
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  Continue <ChevronRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Mini Theme Customizer (onboarding-only)
// ---------------------------------------------------------------------------

/** The three editable core colors, in display order. */
const MINI_COLOR_KEYS: { key: keyof CoreThemeColors; label: string }[] = [
  { key: "primary", label: "Accent" },
  { key: "background", label: "Background" },
  { key: "text", label: "Text" },
];

/**
 * A deliberately tiny, local-only theme customizer for onboarding.
 *
 * Exposes only the three core colors (accent, background, text). It does NOT
 * pull in the full ThemeSelector (no presets, no My Themes, no publish/share),
 * and it does NOT offer a background image during signup — background-image
 * customization is deferred until after account creation, where it can be
 * uploaded to Blossom and persisted properly (see TODO in
 * src/pages/SettingsPage.tsx).
 *
 * Colors apply live via `applyCustomTheme`, which writes to AppContext even
 * when logged out, so the result persists into the app and can be refined or
 * published later from Settings.
 */
function MiniThemeCustomizer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { theme, customTheme, themes, applyCustomTheme } = useTheme();

  // Resolve the colors currently in effect so the pickers start from what the
  // user already sees.
  const effectiveColors = useMemo<CoreThemeColors>(() => {
    if (theme === "custom" && customTheme) return customTheme.colors;
    const resolved = resolveTheme(theme);
    if (resolved === "custom") {
      return customTheme?.colors ?? resolveThemeConfig("dark", themes).colors;
    }
    return resolveThemeConfig(resolved, themes).colors;
  }, [theme, customTheme, themes]);

  const handleColorChange = useCallback(
    (key: keyof CoreThemeColors, hex: string) => {
      const newColors: CoreThemeColors = {
        ...effectiveColors,
        [key]: hexToHslString(hex),
      };
      // Preserve any font/background the user already had on a custom theme.
      applyCustomTheme({ ...customTheme, colors: newColors });
    },
    [effectiveColors, customTheme, applyCustomTheme],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-center">Create your own</DialogTitle>
          <DialogDescription className="text-center text-pretty">
            Pick a few colors. Changes apply instantly — you can fine-tune more
            later in Settings.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 py-2">
          {MINI_COLOR_KEYS.map(({ key, label }) => (
            <ColorPicker
              key={key}
              label={label}
              className="min-w-0"
              value={hslStringToHex(effectiveColors[key])}
              onChange={(hex) => handleColorChange(key, hex)}
            />
          ))}
        </div>

        <Button
          className="w-full rounded-full h-11"
          onClick={() => onOpenChange(false)}
        >
          Done
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Follow Packs Step
// ---------------------------------------------------------------------------

/** Parse a follow pack event into structured data. */
function parsePackEvent(event: NostrEvent) {
  const getTag = (name: string) => event.tags.find(([n]) => n === name)?.[1];
  const title = getTag("title") || getTag("name") || "Untitled Pack";
  const description = getTag("description") || getTag("summary") || "";
  const image = getTag("image") || getTag("thumb") || getTag("banner");
  const pubkeys = event.tags.filter(([n]) => n === "p").map(([, pk]) => pk);

  return { title, description, image, pubkeys };
}

/** Look up a friendlier curated description for a known suggested pack. */
function getPackDescriptionOverride(event: NostrEvent): string | undefined {
  const identifier = event.tags.find(([n]) => n === "d")?.[1];
  return SUGGESTED_PACKS.find(
    (p) =>
      p.kind === event.kind &&
      p.pubkey === event.pubkey &&
      p.identifier === identifier,
  )?.description;
}

function FollowsStep({
  onNext,
  onBack,
  expectedPubkey,
}: {
  onNext: (didFollow: boolean) => void;
  onBack: () => void;
  /**
   * Hex pubkey of the just-generated signup key. When set, the follow-all
   * handler refuses to publish kind 3 unless the active signer matches —
   * a defensive guard against merging a follow pack into a previously
   * logged-in user's contact list.
   */
  expectedPubkey?: string;
}) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();

  const [packs, setPacks] = useState<NostrEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [followedPacks, setFollowedPacks] = useState<Set<string>>(new Set());
  const [followingPack, setFollowingPack] = useState<string | null>(null);
  // Local UI state for individual follows performed inside the people preview.
  // Used only for button state and the didFollow/preload signal.
  const [followedPubkeys, setFollowedPubkeys] = useState<Set<string>>(
    new Set(),
  );
  const [followingPubkey, setFollowingPubkey] = useState<string | null>(null);

  // Fetch the suggested follow packs
  useEffect(() => {
    let cancelled = false;

    const fetchPacks = async () => {
      try {
        const filters = SUGGESTED_PACKS.map((p) => ({
          kinds: [p.kind],
          authors: [p.pubkey],
          "#d": [p.identifier],
          limit: 1,
        }));

        const events = await nostr.query(filters, {
          signal: AbortSignal.timeout(8000),
        });
        if (!cancelled) {
          setPacks(events);
        }
      } catch (error) {
        console.warn("Failed to fetch suggested follow packs:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPacks();
    return () => {
      cancelled = true;
    };
  }, [nostr]);

  /**
   * Shared merge/publish core for following one or more pubkeys. Preserves the
   * original Follow All behavior exactly:
   *  - keeps the expectedPubkey guard (refuses to publish to the wrong account);
   *  - fetches the freshest kind 3 from relays (not cache);
   *  - preserves non-p tags (relay hints, petnames, etc.) and existing p tags;
   *  - adds only pubkeys not already followed;
   *  - publishes kind 3 with `prev` for published_at preservation.
   * Throws on guard failure or publish error so callers can manage their own
   * in-flight/followed UI state.
   */
  const followPubkeys = useCallback(
    async (pubkeys: string[]) => {
      if (!user) throw new Error("Not logged in");

      // Defensive guard: when this is the signup flow, only publish kind 3
      // if the active signer matches the freshly generated key. Without
      // this, a regression in the auto-switch would merge follows into the
      // *previously logged-in user's* contact list — silently adding follows
      // to the wrong account.
      if (expectedPubkey && user.pubkey !== expectedPubkey) {
        toast({
          title: "Follows not saved",
          description:
            "The new account is not active yet, so your follows were not saved (this prevents modifying another account). You can follow people later from the app.",
          variant: "destructive",
        });
        throw new Error("Signer does not match expected pubkey");
      }

      // 1. Fetch freshest kind 3 from relays (not cache)
      const prev = await fetchFreshEvent(nostr, {
        kinds: [3],
        authors: [user.pubkey],
      });

      // 2. Separate p-tags from non-p-tags to preserve relay hints, petnames, etc.
      const existingPTags = prev?.tags.filter(([n]) => n === "p") ?? [];
      const nonPTags = prev?.tags.filter(([n]) => n !== "p") ?? [];
      const existingPubkeys = new Set(existingPTags.map(([, pk]) => pk));

      // 3. Merge: add new pubkeys that aren't already followed
      const newPTags = pubkeys
        .filter((pk) => !existingPubkeys.has(pk))
        .map((pk) => ["p", pk]);

      // 4. Publish with prev for published_at preservation
      await publishEvent({
        kind: 3,
        content: prev?.content ?? "",
        tags: [...nonPTags, ...existingPTags, ...newPTags],
        prev: prev ?? undefined,
      });
    },
    [user, nostr, publishEvent, expectedPubkey],
  );

  const handleFollowAll = useCallback(
    async (pack: NostrEvent) => {
      if (!user) return;

      const packId = pack.id;
      setFollowingPack(packId);

      try {
        const packPubkeys = pack.tags
          .filter(([n]) => n === "p")
          .map(([, pk]) => pk);

        await followPubkeys(packPubkeys);

        setFollowedPacks((prev) => new Set([...prev, packId]));
      } catch (error) {
        console.error("Failed to follow pack:", error);
      } finally {
        setFollowingPack(null);
      }
    },
    [user, followPubkeys],
  );

  const handleFollowPubkey = useCallback(
    async (pubkey: string) => {
      if (!user) return;

      setFollowingPubkey(pubkey);

      try {
        await followPubkeys([pubkey]);
        setFollowedPubkeys((prev) => new Set([...prev, pubkey]));
      } catch (error) {
        console.error("Failed to follow person:", error);
      } finally {
        setFollowingPubkey(null);
      }
    },
    [user, followPubkeys],
  );

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-400">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">
          Find your people
        </h2>
        <p className="text-sm text-muted-foreground text-pretty">
          Follow a few starter voices so your first feed feels alive.
        </p>
      </div>

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: SUGGESTED_PACKS.length }).map((_, i) => (
            <PackCardSkeleton key={i} />
          ))
        ) : packs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Couldn't load suggestions right now. You can find follow packs later
            in the app.
          </p>
        ) : (
          packs.map((pack) => (
            <PackCard
              key={pack.id}
              event={pack}
              descriptionOverride={getPackDescriptionOverride(pack)}
              isFollowed={followedPacks.has(pack.id)}
              isFollowing={followingPack === pack.id}
              onFollowAll={() => handleFollowAll(pack)}
              followedPubkeys={followedPubkeys}
              followingPubkey={followingPubkey}
              onFollowPubkey={handleFollowPubkey}
            />
          ))
        )}
      </div>

      <div className="flex gap-3">
        <Button
          variant="ghost"
          onClick={onBack}
          className="flex-1 rounded-full h-11"
        >
          Back
        </Button>
        <Button
          onClick={() =>
            onNext(followedPacks.size > 0 || followedPubkeys.size > 0)
          }
          className="flex-1 rounded-full h-11 gap-1.5"
        >
          {followedPacks.size > 0 || followedPubkeys.size > 0
            ? "Continue"
            : "Skip for now"}
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

/** Compact follow pack card for the onboarding flow. */
function PackCard({
  event,
  descriptionOverride,
  isFollowed,
  isFollowing,
  onFollowAll,
  followedPubkeys,
  followingPubkey,
  onFollowPubkey,
}: {
  event: NostrEvent;
  descriptionOverride?: string;
  isFollowed: boolean;
  isFollowing: boolean;
  onFollowAll: () => void;
  followedPubkeys: Set<string>;
  followingPubkey: string | null;
  onFollowPubkey: (pubkey: string) => void;
}) {
  const { title, description, pubkeys } = useMemo(
    () => parsePackEvent(event),
    [event],
  );

  const displayDescription = descriptionOverride || description;

  // The card has two modes: a compact "summary" and an inline "people" stepper.
  // Switching is a state change on the same card — no modal, the user stays in
  // the onboarding flow.
  const [mode, setMode] = useState<"summary" | "people">("summary");

  // In summary mode we only need metadata for the small preview cluster (first
  // six). When the user opens the inline preview we widen the fetch to every
  // member; useAuthors dedupes/caches, so the cluster's six are reused.
  const clusterPubkeys = useMemo(() => pubkeys.slice(0, 6), [pubkeys]);
  const previewPubkeys = mode === "people" ? pubkeys : clusterPubkeys;
  const { data: membersMap } = useAuthors(previewPubkeys);

  return (
    <div
      className={cn(
        "group rounded-2xl ring-1 ring-border overflow-hidden bg-card/60",
        "transition-all duration-200 hover:ring-primary/50 hover:shadow-md hover:shadow-primary/5",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300",
      )}
    >
      {mode === "people" ? (
        <PackPeoplePreview
          pubkeys={pubkeys}
          membersMap={membersMap}
          isFollowed={isFollowed}
          isFollowing={isFollowing}
          onFollowAll={onFollowAll}
          onBack={() => setMode("summary")}
          followedPubkeys={followedPubkeys}
          followingPubkey={followingPubkey}
          onFollowPubkey={onFollowPubkey}
        />
      ) : (
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
          {/* Warm gradient header band to make the card feel inviting, not flat. */}
          <div className="relative bg-[linear-gradient(135deg,hsl(var(--primary)/0.12),transparent_70%)] px-4 pt-4 pb-3 space-y-3">
            {/* "Starter voices" badge + member count */}
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-medium text-primary">
                <Sparkles className="size-3" />
                Starter voices
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                <Users className="w-3.5 h-3.5" />
                {pubkeys.length} people
              </span>
            </div>

            {/* Title + description */}
            <div className="min-w-0 space-y-1">
              <h3 className="font-semibold text-base leading-snug">{title}</h3>
              {displayDescription && (
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {displayDescription}
                </p>
              )}
            </div>

            {/* Avatar cluster — a quick visual that real people are inside. */}
            {clusterPubkeys.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {clusterPubkeys.map((pk) => {
                    const meta = membersMap?.get(pk)?.metadata;
                    const name =
                      meta?.display_name || meta?.name || "Anonymous";
                    return (
                      <MiniAvatar
                        key={pk}
                        src={meta?.picture}
                        name={name}
                        metadata={meta}
                      />
                    );
                  })}
                </div>
                {pubkeys.length > clusterPubkeys.length && (
                  <span className="text-[11px] text-muted-foreground">
                    +{pubkeys.length - clusterPubkeys.length} more
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="px-4 pb-4 pt-3">
            {/* Actions: Follow All stays primary and easy; "Meet the people"
                swaps this card into the inline people preview. */}
            <div className="space-y-2">
              <Button
                className="w-full gap-2 motion-safe:transition-transform motion-safe:active:scale-[0.98]"
                size="sm"
                variant={isFollowed ? "outline" : "default"}
                onClick={onFollowAll}
                disabled={isFollowed || isFollowing}
              >
                {isFollowing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Following...
                  </>
                ) : isFollowed ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Added to your follows
                  </>
                ) : (
                  <>
                    <UserPlus className="w-3.5 h-3.5" />
                    Follow All ({pubkeys.length})
                  </>
                )}
              </Button>

              {pubkeys.length > 0 && (
                <Button
                  className="w-full gap-2 motion-safe:transition-transform motion-safe:active:scale-[0.98]"
                  size="sm"
                  variant="ghost"
                  onClick={() => setMode("people")}
                >
                  <Users className="w-3.5 h-3.5" />
                  Meet the people
                </Button>
              )}
            </div>
          </div>

          {/* Author attribution */}
          <AuthorAttribution pubkey={event.pubkey} />
        </div>
      )}
    </div>
  );
}

/**
 * Inline "meet the people" stepper that lives *inside* the pack card.
 *
 * The user taps "Meet the people" and the card swaps from summary mode to this
 * people mode — no modal, so they stay inside the onboarding flow. One person
 * is shown at a time from a local `index`; compact arrow buttons + a "N of M"
 * indicator sit inside the card, and Left/Right arrow keys step too. "Follow
 * all" stays visible.
 *
 * Theme/vibe preview: when the current person has published an active profile
 * theme (kind 16767), we preview a SAFE SUBSET of it — only inside this card —
 * so the card briefly takes on that person's actual Ditto vibe. The subset is:
 *   - their theme background image (already https-sanitized at the parse layer),
 *     used as a large *ambient* layer behind the whole preview, blurred + dimmed
 *     under a scrim so text stays readable;
 *   - their theme background COLOR, used as the ambient base tint (and to avoid
 *     a white/black flash while the next image loads);
 *   - their accent/primary color, used for accents (avatar ring, dots, badge,
 *     decorative gradients) via a card-scoped `--pack-accent` CSS variable.
 * We deliberately do NOT trust their theme's text color for body copy, and we
 * never let the busy background sit directly behind text — all readable text
 * lives inside a translucent `bg-card/…` + backdrop-blur panel, so contrast is
 * guaranteed on both light and dark app themes. No theme font is applied (that
 * would mean loading remote font assets and injecting them globally).
 *
 * If there is no published theme, we fall back to the person's kind-0 banner.
 * If there's no banner either, the soft accent gradient shows through.
 *
 * This is strictly preview-only and LOCAL to this card. We never touch the
 * user's theme, never call applyCustomTheme, never inject global `<style>`
 * theme variables, never persist anything, and never write to Nostr. The theme
 * colors/background are applied only via inline `style` on this card's own
 * subtree (the parent card is `overflow-hidden`, so the ambient layer is
 * clipped to the card and nothing leaks to the rest of the app).
 *
 * Performance: the theme is fetched only for the CURRENT person via
 * useActiveProfileTheme (TanStack-cached, replaceable kind 16767, limit 1), so
 * stepping reuses the cache and only the visible person triggers a query.
 * Member kind-0 metadata is passed in from the parent (already fetched).
 */
function PackPeoplePreview({
  pubkeys,
  membersMap,
  isFollowed,
  isFollowing,
  onFollowAll,
  onBack,
  followedPubkeys,
  followingPubkey,
  onFollowPubkey,
}: {
  pubkeys: string[];
  membersMap?: Map<string, AuthorData>;
  isFollowed: boolean;
  isFollowing: boolean;
  onFollowAll: () => void;
  onBack: () => void;
  followedPubkeys: Set<string>;
  followingPubkey: string | null;
  onFollowPubkey: (pubkey: string) => void;
}) {
  const total = pubkeys.length;
  const [index, setIndex] = useState(0);

  const safeIndex = total > 0 ? Math.min(index, total - 1) : 0;
  const currentPubkey = pubkeys[safeIndex];
  const meta = currentPubkey ? membersMap?.get(currentPubkey)?.metadata : undefined;

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(
    () => setIndex((i) => Math.min(total - 1, i + 1)),
    [total],
  );

  const atStart = safeIndex === 0;
  const atEnd = safeIndex >= total - 1;

  // Individual follow state for the person currently in view. The whole pack
  // being followed implies this person is followed too. Disable the button
  // while the pack follow is in flight, or while this person's own follow is
  // in flight, to avoid concurrent kind 3 publishes overwriting each other.
  const isCurrentFollowed =
    isFollowed ||
    (currentPubkey ? followedPubkeys.has(currentPubkey) : false);
  const isCurrentFollowing = followingPubkey === currentPubkey;
  const isAnyFollowInFlight = isFollowing || followingPubkey !== null;

  // Keyboard support: Left/Right step between people while the preview is open.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    },
    [goPrev, goNext],
  );

  const name = meta?.display_name || meta?.name || "Anonymous";
  const bio = meta?.about?.replace(/\s+/g, " ").trim();
  const bannerUrl = sanitizeUrl(meta?.banner);
  const pictureUrl = sanitizeUrl(meta?.picture);

  // Real theme preview: try the current person's published active profile
  // theme (kind 16767). Fetched only for the visible person (TanStack-cached),
  // so stepping reuses the cache. Strictly preview-only and local to this card.
  const { data: activeTheme } = useActiveProfileTheme(currentPubkey);

  // Safe preview subset:
  //  - background image: already https-sanitized at the parse layer
  //    (parseBackgroundTag -> sanitizeUrl), re-sanitized here as defense in
  //    depth before it touches a CSS `url()`.
  //  - background color + accent (primary): HSL triples like "228 20% 10%".
  //    Used for the ambient layer + accents via card-scoped CSS vars. We do
  //    NOT adopt their text color for body copy — contrast stays guaranteed.
  const themeBgUrl = sanitizeUrl(activeTheme?.background?.url);
  const themeAccent = activeTheme?.colors.primary;
  const themeBgColor = activeTheme?.colors.background;

  // Two distinct visual roles, with cross-fallbacks:
  //   - Banner tile = "their profile" → prefer the kind-0 profile banner,
  //     fall back to the theme background image.
  //   - Card ambient = "their theme/space" → prefer the kind 16767 theme
  //     background image, fall back to the profile banner.
  // If neither exists for a role, the accent/primary gradient shows through.
  // All URLs are sanitized https (or undefined).
  const tileBgUrl = bannerUrl ?? themeBgUrl;
  const ambientBgUrl = themeBgUrl ?? bannerUrl;

  // Scope the theme to this card only. Setting CSS vars via inline style
  // cascades to descendants but never leaks globally — the app's own
  // `--primary`/`--background` stay untouched everywhere else.
  const cardStyle: React.CSSProperties | undefined =
    themeAccent || themeBgColor
      ? ({
          ...(themeAccent ? { "--pack-accent": themeAccent } : {}),
          ...(themeBgColor ? { "--pack-bg": themeBgColor } : {}),
        } as React.CSSProperties)
      : undefined;

  // Prefer a friendly handle (NIP-05 / @name); fall back to a shortened npub
  // so the slide never looks empty even with no metadata at all.
  const npub = currentPubkey ? tryNpubEncode(currentPubkey) : undefined;
  const handle = meta?.nip05
    ? meta.nip05.replace(/^_@/, "")
    : meta?.name
      ? `@${meta.name}`
      : npub
        ? `${npub.slice(0, 12)}…${npub.slice(-6)}`
        : undefined;

  return (
    <div
      className="relative overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
      style={cardStyle}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="group"
      aria-label="Meet the people in this pack"
    >
      {/* Ambient theme layer — a large preview of the person's actual Ditto
          SPACE behind the WHOLE inline preview. Prefers their kind 16767 theme
          background image (falls back to their profile banner). Built in layers
          so it reads strongly while staying readable:
            1. their theme background COLOR as a base tint (also prevents a
               white/black flash while the next person's image loads);
            2. their theme background IMAGE — only lightly blurred and fairly
               opaque now, so it's clearly recognizable as their space;
            3. an accent-tinted decorative glow;
            4. a scrim that stays light over the banner/top but deepens toward
               the readable content panel so body text always has a calm backing.
          Everything is contained by the parent's overflow-hidden + the card's
          own overflow-hidden, and applied only via scoped CSS vars / inline
          style — it never leaves this card. Keyed by pubkey so it cross-fades
          smoothly when stepping between people. */}
      <div
        key={currentPubkey}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700"
      >
        {/* 1. Base color tint (graceful fallback while image loads). */}
        {themeBgColor && (
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "hsl(var(--pack-bg) / 0.7)" }}
          />
        )}
        {/* 2. Theme background image — lightly blurred + fairly opaque so the
            person's space is recognizable, not just a vague wash. */}
        {ambientBgUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-70 blur-[2px] scale-105 transition-opacity duration-700"
            style={{ backgroundImage: `url("${ambientBgUrl}")` }}
          />
        )}
        {/* 3. Accent glow for warmth. */}
        <div
          className="absolute inset-x-0 top-0 h-48 opacity-70"
          style={{
            background:
              "radial-gradient(120% 80% at 50% 0%, hsl(var(--pack-accent,var(--primary)) / 0.4), transparent 70%)",
          }}
        />
        {/* 4. Readability scrim — light at the top (lets the banner/image read)
            and deepening toward the content so the info panel stays legible. */}
        <div className="absolute inset-0 bg-gradient-to-b from-card/30 via-card/55 to-card/90" />
      </div>

      <div className="relative">
        {/* Top bar: back to summary + position indicator. */}
        <div className="flex items-center justify-between gap-2 px-4 pt-2 pb-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 -ml-2 gap-1.5 text-xs"
            onClick={onBack}
          >
            <ChevronLeft className="size-3.5" />
            Back to pack
          </Button>
          <span
            className="text-xs font-medium text-muted-foreground tabular-nums shrink-0"
            aria-live="polite"
          >
            {safeIndex + 1} of {total}
          </span>
        </div>

        {/* Banner tile = "their profile" — prefers the kind-0 profile banner
            (falls back to the theme background image). Accent-tinted gradient
            fallback + accent ring tie it to their theme. */}
        <div
          className="relative mx-4 h-20 overflow-hidden rounded-xl bg-[linear-gradient(135deg,hsl(var(--pack-accent,var(--primary))/0.3),hsl(var(--pack-accent,var(--primary))/0.06))] ring-1"
          style={{ ["--tw-ring-color" as string]: "hsl(var(--pack-accent,var(--primary)) / 0.35)" }}
        >
          {tileBgUrl && (
            <img
              key={currentPubkey}
              src={tileBgUrl}
              alt=""
              className="absolute inset-0 size-full object-cover motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500"
              loading="lazy"
            />
          )}
          {/* Readability scrim over the image so the avatar overlap stays
              legible regardless of how busy the banner/theme background is. */}
          {tileBgUrl && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 to-transparent"
            />
          )}
        </div>

        <div className="px-4 pb-2.5">
          <Avatar
            className="size-14 -mt-7 ring-4 shadow-sm"
            shape={getAvatarShape(meta)}
            style={{
              ["--tw-ring-color" as string]:
                "hsl(var(--pack-accent,var(--primary)) / 0.55)",
            }}
          >
            <AvatarImage src={pictureUrl} alt={name} />
            <AvatarFallback
              className="text-lg"
              style={{
                backgroundColor: "hsl(var(--pack-accent,var(--primary)) / 0.18)",
                color: "hsl(var(--pack-accent,var(--primary)))",
              }}
            >
              {name[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>

          {/* Readable panel: name + handle + bio live on a translucent card
              layer with backdrop blur so the body text keeps strong contrast
              over the ambient theme, on both light and dark app themes. We
              never use the person's theme text color here — only an accent
              ring + a thin accent top-line tie the panel to their theme. */}
          <div
            className="relative mt-2 overflow-hidden rounded-xl bg-card/80 ring-1 backdrop-blur-md px-3 py-2 shadow-sm"
            style={{
              ["--tw-ring-color" as string]:
                "hsl(var(--pack-accent,var(--primary)) / 0.4)",
            }}
          >
            {/* Thin accent line along the top edge of the info panel. */}
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-0.5"
              style={{
                background:
                  "linear-gradient(90deg, transparent, hsl(var(--pack-accent,var(--primary)) / 0.8), transparent)",
              }}
            />
            <div className="space-y-0.5">
              <p className="font-semibold text-sm leading-tight truncate text-card-foreground">
                {name}
              </p>
              {/* Always reserve the handle line's height so the card doesn't
                  shift when a person has no handle. */}
              <p className="h-4 text-xs text-muted-foreground truncate">
                {handle ?? "\u00A0"}
              </p>
            </div>

            {/* Fixed-height bio area: exactly two text-xs/leading-relaxed
                lines (~2.5rem). line-clamp-2 truncates long bios; short or
                missing bios ("No bio yet.") still occupy the same height, so
                the panel — and the controls below it — never shift between
                people. Two lines (down from three) keeps the bio readable
                while trimming vertical height on short/mobile screens. */}
            <p className="mt-1.5 h-[2.5rem] overflow-hidden text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {bio || "No bio yet."}
            </p>
          </div>
        </div>

        {/* Stepper controls + Follow All. */}
        <div className="px-4 pb-3 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 shrink-0 rounded-full ring-1 hover:bg-[hsl(var(--pack-accent,var(--primary))/0.12)]"
              style={{
                ["--tw-ring-color" as string]:
                  "hsl(var(--pack-accent,var(--primary)) / 0.4)",
              }}
              onClick={goPrev}
              disabled={atStart}
              aria-label="Previous person"
            >
              <ChevronLeft className="size-4" />
            </Button>

            <div className="flex flex-1 justify-center gap-1" aria-hidden="true">
              {/* Compact progress dots, capped so long packs don't overflow. */}
              {total <= 12 ? (
                pubkeys.map((pk, i) => (
                  <span
                    key={pk}
                    className="size-1.5 rounded-full transition-colors"
                    style={{
                      backgroundColor:
                        i === safeIndex
                          ? "hsl(var(--pack-accent,var(--primary)))"
                          : "hsl(var(--muted-foreground) / 0.3)",
                    }}
                  />
                ))
              ) : (
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {safeIndex + 1} / {total}
                </span>
              )}
            </div>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 shrink-0 rounded-full ring-1 hover:bg-[hsl(var(--pack-accent,var(--primary))/0.12)]"
              style={{
                ["--tw-ring-color" as string]:
                  "hsl(var(--pack-accent,var(--primary)) / 0.4)",
              }}
              onClick={goNext}
              disabled={atEnd}
              aria-label="Next person"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <Button
            className="w-full gap-2 motion-safe:transition-transform motion-safe:active:scale-[0.98]"
            size="sm"
            variant={isCurrentFollowed ? "outline" : "default"}
            onClick={() => currentPubkey && onFollowPubkey(currentPubkey)}
            disabled={
              !currentPubkey ||
              isCurrentFollowed ||
              isCurrentFollowing ||
              isFollowing
            }
          >
            {isCurrentFollowing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Following…
              </>
            ) : isCurrentFollowed ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Following
              </>
            ) : (
              <>
                <UserPlus className="w-3.5 h-3.5" />
                Follow
              </>
            )}
          </Button>

          <Button
            className="w-full gap-2 motion-safe:transition-transform motion-safe:active:scale-[0.98]"
            size="sm"
            variant={isFollowed ? "outline" : "secondary"}
            onClick={onFollowAll}
            disabled={isFollowed || isAnyFollowInFlight}
          >
            {isFollowing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Following...
              </>
            ) : isFollowed ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Added to your follows
              </>
            ) : (
              <>
                <UserPlus className="w-3.5 h-3.5" />
                Follow All ({total})
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Small author attribution bar at the bottom of a pack card. */

function AuthorAttribution({ pubkey }: { pubkey: string }) {
  const { data: authorData } = useAuthors([pubkey]);
  const metadata: NostrMetadata | undefined = authorData?.get(pubkey)?.metadata;
  const name = metadata?.name || metadata?.display_name || 'Anonymous';

  return (
    <div className="px-4 py-2 bg-muted/30 border-t border-border flex items-center gap-2">
      <MiniAvatar src={metadata?.picture} name={name} metadata={metadata} />
      <span className="text-xs text-muted-foreground truncate">
        by <span className="font-medium text-foreground">{name}</span>
      </span>
    </div>
  );
}

/** Tiny avatar used in pack member stacks. */
function MiniAvatar({ src, name, metadata }: { src?: string; name: string; metadata?: NostrMetadata }) {
  return (
    <Avatar className="size-7 ring-2 ring-background" shape={getAvatarShape(metadata)}>
      <AvatarImage src={sanitizeUrl(src)} alt={name} />
      <AvatarFallback className="bg-primary/15 text-primary text-[10px]">
        {name[0]?.toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

function PackCardSkeleton() {
  return (
    <div className="rounded-xl ring-1 ring-border p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
        <Skeleton className="h-4 w-8" />
      </div>
      <div className="flex -space-x-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton
            key={i}
            className="size-7 rounded-full ring-2 ring-background"
          />
        ))}
      </div>
      <Skeleton className="h-8 w-full rounded-md" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outro Step
// ---------------------------------------------------------------------------

function OutroStep({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-6 sm:gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="relative motion-safe:animate-in motion-safe:zoom-in-90 motion-safe:duration-700">
        <div className="absolute -inset-5 rounded-full bg-primary/15 blur-2xl motion-safe:animate-pulse" />
        <DittoLogo size={64} className="relative sm:hidden" />
        <DittoLogo size={72} className="relative hidden sm:block" />
        <div className="absolute -bottom-1 -right-1 bg-primary/10 rounded-full p-1.5 motion-safe:animate-in motion-safe:zoom-in motion-safe:duration-500 motion-safe:delay-200 motion-safe:fill-mode-both">
          <Heart className="w-5 h-5 text-primary fill-primary" />
        </div>
      </div>

      <div className="space-y-2 sm:space-y-3 max-w-xs">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight">You're in</h2>
        <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
          {GENERIC_OUTRO}
        </p>
      </div>

      <Button
        size="lg"
        className="w-full max-w-xs gap-2 rounded-full h-12 motion-safe:transition-transform motion-safe:active:scale-[0.98]"
        onClick={onComplete}
      >
        Start exploring
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
