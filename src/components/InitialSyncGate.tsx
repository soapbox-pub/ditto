import type { NostrEvent, NostrMetadata } from "@nostrify/nostrify";
import { useNostr } from "@nostrify/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Heart,
  Loader2,
  Plus,
  ShieldCheck,
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
import { useAppContext } from "@/hooks/useAppContext";
import { useAuthors } from "@/hooks/useAuthors";
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
import {
  type CoreThemeColors,
  resolveTheme,
  resolveThemeConfig,
} from "@/themes";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Typewriter
// ---------------------------------------------------------------------------

/** True if the user has asked the OS to reduce motion. */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Lightweight "being written" text effect for the main onboarding copy.
 *
 * This is intentionally simple — a foundation for a later pass where Blobbi
 * will be the one "writing" these messages. It is NOT the magical glyph
 * writing effect.
 *
 * - Fast by default (~18ms/char) and never blocks the user.
 * - Click/tap anywhere on the text, or press any key, finishes it instantly.
 * - Respects `prefers-reduced-motion`: the full text shows immediately.
 * - Layout-stable: the full text is always present (transparent until typed)
 *   so the container reserves its final height and nothing reflows.
 */
function Typewriter({
  text,
  className,
  speed = 18,
}: {
  text: string;
  className?: string;
  /** Milliseconds per character. */
  speed?: number;
}) {
  const reduce = useMemo(() => prefersReducedMotion(), []);
  const [count, setCount] = useState(() => (reduce ? text.length : 0));
  const done = count >= text.length;

  // Restart typing whenever the text changes (e.g. step transitions reuse the
  // component). Reduced-motion users always see the full string.
  useEffect(() => {
    if (reduce) {
      setCount(text.length);
      return;
    }
    setCount(0);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= text.length) window.clearInterval(id);
    }, speed);
    return () => window.clearInterval(id);
  }, [text, speed, reduce]);

  const finish = useCallback(() => setCount(text.length), [text.length]);

  return (
    <span
      className={cn("relative inline-block cursor-default", className)}
      onClick={done ? undefined : finish}
      onKeyDown={done ? undefined : (e) => {
        // Any key finishes the text instantly (without hijacking tab/modifier nav).
        if (e.key === "Tab") return;
        finish();
      }}
      // Only focusable (for key-to-skip) while still animating.
      tabIndex={done ? undefined : -1}
      role="presentation"
    >
      {/* Invisible full text reserves the final layout height. */}
      <span aria-hidden="true" className="invisible">
        {text}
      </span>
      {/* Visible typed slice, overlaid so it doesn't affect layout. */}
      <span className="absolute inset-0">
        {reduce ? text : text.slice(0, count)}
      </span>
    </span>
  );
}

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
        "People building tools, communities, and strange new corners of the internet.",
    },
  ];

// Steps for signup (includes welcome + keygen + profile) vs. settings-only (existing login)
type SignupStep = "welcome" | "keygen" | "download" | "profile";
type SettingsStep = "theme" | "follows" | "outro";
type Step = SignupStep | SettingsStep;

const SIGNUP_STEPS: Step[] = [
  "welcome",
  "theme",
  "keygen",
  "download",
  "profile",
  "follows",
  "outro",
];
const SETTINGS_STEPS: Step[] = ["theme", "follows", "outro"];

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

  const steps = isSignup ? SIGNUP_STEPS : SETTINGS_STEPS;

  const [step, setStep] = useState<Step>(steps[0]);
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

  const goTo = useCallback((target: Step) => setStep(target), []);

  const next = useCallback(() => {
    const i = steps.indexOf(step);
    if (i < steps.length - 1) {
      setStep(steps[i + 1]);
    }
  }, [step, steps]);

  const back = useCallback(() => {
    const i = steps.indexOf(step);
    if (i > 0) {
      setStep(steps[i - 1]);
    }
  }, [step, steps]);

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
  // on web), logs in, and advances to the next step.
  //
  // If the user dismisses the iOS credential prompt, `saveNsec` resolves to
  // `'dismissed'` and we still advance — dismissal is a legitimate choice
  // (e.g. the user is saving the key in their own password manager).
  //
  // On Android, if no credential provider is available (e.g. GrapheneOS or
  // other de-Googled devices), `saveNsec` falls back to writing the key to
  // the app's Documents folder and returns `'saved-to-file'`. We surface a
  // toast so the user knows where to find the backup file.
  //
  // Only unexpected errors (decode failure, filesystem write failure)
  // surface as a destructive toast.
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
      next();
    } catch {
      toast({
        title: "Save failed",
        description:
          "Could not save the key. Please copy it manually.",
        variant: "destructive",
      });
    }
  }, [nsec, login, next, config.appName]);

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

    if (userHasFollows) {
      goTo("outro");
    } else {
      goTo("follows");
    }
  }, [user, nostr, goTo]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Ambient warmth — a soft, static brand-tinted gradient so the flow
          doesn't feel flat. Non-interactive and behind all content. The theme
          step paints its own background above this (z-0 / z-10). */}
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
      <div className="relative flex-1 flex flex-col overflow-y-auto">
        <div className="w-full max-w-md mx-auto my-auto px-6 py-12">
          {/* Signup steps */}
          {step === "welcome" && <WelcomeStep onNext={next} />}

          {step === "keygen" && <KeygenStep onGenerate={handleGenerate} />}

          {step === "download" && (
            <DownloadStep nsec={nsec} onContinue={handleDownloadContinue} />
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
                goTo("outro");
              }}
              onBack={back}
              expectedPubkey={expectedPubkey}
            />
          )}

          {step === "outro" && <OutroStep onComplete={onComplete} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Welcome Step
// ---------------------------------------------------------------------------

/**
 * Lightweight, non-technical choices that let a new user express what they
 * want out of a social app. Selections are UI-only for now — they set an
 * intentional, warm tone before theme selection without affecting behavior.
 */
const WELCOME_CHOICES: { id: string; emoji: string; label: string }[] = [
  { id: "personal", emoji: "🪴", label: "Feel more like my space" },
  { id: "control", emoji: "🎛️", label: "Give me more control" },
  { id: "conversations", emoji: "💬", label: "Show better conversations" },
  { id: "freedom", emoji: "🕊️", label: "Feel less controlled" },
  { id: "fun", emoji: "✨", label: "Make posting fun again" },
  { id: "fresh", emoji: "🌱", label: "Give me a fresh start" },
];

function WelcomeStep({ onNext }: { onNext: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col gap-7 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col items-center text-center gap-4">
        <div className="relative motion-safe:animate-in motion-safe:zoom-in-90 motion-safe:duration-700">
          {/* Soft glow behind the logo for a little warmth */}
          <div className="absolute -inset-4 rounded-full bg-primary/15 blur-2xl motion-safe:animate-pulse" />
          <DittoLogo size={64} className="relative" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-balance">
            Let's make the internet feel like yours again
          </h1>
          <Typewriter
            text="Most social apps make every account feel the same. Ditto gives you more room to shape your space, your conversations, and how you show up."
            className="text-sm text-muted-foreground leading-relaxed text-pretty"
          />
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-foreground">
          What do you wish social apps did better?
        </legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {WELCOME_CHOICES.map((choice, i) => {
            const isSelected = selected.has(choice.id);
            return (
              <button
                key={choice.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggle(choice.id)}
                style={{ animationDelay: `${i * 50}ms` }}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl border p-3.5 text-left",
                  "transition-all duration-200 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  "motion-safe:active:scale-[0.97] motion-safe:hover:-translate-y-0.5",
                  isSelected
                    ? "border-primary bg-primary/10 ring-1 ring-primary shadow-sm shadow-primary/10"
                    : "border-border bg-card hover:border-primary/40 hover:bg-accent",
                )}
              >
                <span
                  className={cn(
                    "text-xl leading-none transition-transform duration-200",
                    "motion-safe:group-hover:scale-110",
                    isSelected && "motion-safe:scale-110",
                  )}
                  aria-hidden="true"
                >
                  {choice.emoji}
                </span>
                <span className="flex-1 text-sm font-medium">
                  {choice.label}
                </span>
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border transition-all duration-200",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground motion-safe:zoom-in"
                      : "border-muted-foreground/30 text-transparent",
                  )}
                >
                  <Check className="size-3" />
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <Button
        size="lg"
        className="w-full gap-2 rounded-full h-12 motion-safe:transition-transform motion-safe:active:scale-[0.98]"
        onClick={onNext}
      >
        {selected.size > 0 ? "Continue" : "Skip for now"}
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
    <div className="flex flex-col items-center text-center gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="relative motion-safe:animate-in motion-safe:zoom-in-90 motion-safe:duration-700">
        <div className="absolute -inset-5 rounded-full bg-primary/15 blur-2xl motion-safe:animate-pulse" />
        <DittoLogo size={80} className="relative" />
      </div>

      <div className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight">
          Create your account
        </h1>
        <Typewriter
          text="Most apps keep your account on their terms. Ditto works differently: this account belongs to you. We'll create a private key that proves it's yours, and we'll help you keep it safe."
          className="text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto text-pretty"
        />
        <p className="text-xs text-muted-foreground/70 leading-relaxed max-w-sm mx-auto">
          Your private key is a cryptographic secret. You don't need to
          understand the math, just keep it private.
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
}: {
  nsec: string;
  onContinue: () => Promise<void> | void;
}) {
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Wrap the continue handler in an in-flight guard so rapid double-taps
  // don't trigger multiple credential prompts. `finally` guarantees the
  // button is re-enabled even if the handler throws, so users can never
  // get stuck on a disabled button.
  const handleClick = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onContinue();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-400">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">
          Save your key
        </h2>
        <Typewriter
          text="This key is yours. It lets Ditto know it's really you when you come back."
          className="text-sm text-muted-foreground text-pretty"
        />
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
          Keep it private and store it somewhere safe. If you lose it, you may
          lose access. If someone else gets it, they can use your account.
        </p>
      </div>

      {showKey && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800 animate-in fade-in slide-in-from-top-1 duration-200">
          <p className="text-xs text-amber-900 dark:text-amber-300">
            Keep your key private. Avoid screenshotting it or pasting it anywhere except a password manager — anyone who has it can use your account.{" "}
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
        onClick={handleClick}
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
          <Typewriter
            text="Add a name, photo, or short line so people know who they're meeting. You can change this anytime."
            className="text-sm text-muted-foreground text-pretty"
          />
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

  // Discovery: track how many *distinct* themes the user tries. Once they've
  // explored 2+, we gently reveal a small "create your own" affordance — it
  // should feel like a discovery, not an extra required step. The mini
  // customizer below is local-only (applyCustomTheme writes to AppContext even
  // when logged out), so a custom theme built here persists and can be
  // published later from Settings once the account/key exists. We intentionally
  // do NOT mount the full ThemeSelector here (presets, My Themes, publish/share)
  // — that's too much surface for onboarding.
  const [tried, setTried] = useState<Set<string>>(new Set());
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const themeKey = theme === "custom"
    ? `custom:${JSON.stringify(customTheme?.colors)}`
    : theme;
  // Record each distinct theme the user lands on, including the initial one.
  // Once the set reaches 2, the user has explored beyond their starting theme.
  useEffect(() => {
    setTried((prev) => {
      if (prev.has(themeKey)) return prev;
      const next = new Set(prev);
      next.add(themeKey);
      return next;
    });
  }, [themeKey]);

  const showCustomReveal = tried.size >= 2;

  return (
    <>
      {/* Background image — full screen behind everything */}
      {bgUrl && (
        <div
          className="fixed inset-0 z-0 bg-cover bg-center opacity-50 transition-all duration-700"
          style={{ backgroundImage: `url(${bgUrl})` }}
        />
      )}

      {/* Center content — semi-transparent on desktop when bg is active */}
      <div
        className={cn(
          "relative z-10 flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-400",
          "sm:rounded-2xl sm:transition-[background-color,backdrop-filter] sm:duration-700",
          bgUrl
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
              : "Pick a starting theme. You can change it anytime."}
          </p>
        </div>

        <ThemeGrid columns="scroll" limit={9} />

        {/* Discovery reveal: a small, local-only "create your own" affordance
            that appears once the user has explored a couple of themes. Opens a
            tiny color customizer — NOT the full ThemeSelector. */}
        {showCustomReveal && (
          <button
            type="button"
            onClick={() => setCustomizerOpen(true)}
            className={cn(
              "group flex items-center gap-3 rounded-xl border-2 border-dashed border-border p-3.5 text-left",
              "transition-all duration-200 hover:border-primary/50 hover:bg-accent",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300",
              "motion-safe:active:scale-[0.98]",
            )}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
              <Plus className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">Create your own</span>
              <span className="block text-xs text-muted-foreground">
                Pick a few colors and make it yours.
              </span>
            </span>
          </button>
        )}

        {/* Tiny local color customizer (Primary / Background / Text only). */}
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
 * pull in the full ThemeSelector (no presets, no My Themes, no publish/share).
 * Changes apply live via `applyCustomTheme`, which writes to AppContext even
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
      <DialogContent className="w-[calc(100%-2rem)] max-w-xs rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-center">Create your own</DialogTitle>
          <DialogDescription className="text-center">
            Pick a few colors. Changes apply instantly — you can fine-tune more
            later in Settings.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start justify-center gap-6 py-2">
          {MINI_COLOR_KEYS.map(({ key, label }) => (
            <ColorPicker
              key={key}
              label={label}
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
  const { config } = useAppContext();
  const { mutateAsync: publishEvent } = useNostrPublish();

  const [packs, setPacks] = useState<NostrEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [followedPacks, setFollowedPacks] = useState<Set<string>>(new Set());
  const [followingPack, setFollowingPack] = useState<string | null>(null);

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

  const handleFollowAll = useCallback(
    async (pack: NostrEvent) => {
      if (!user) return;

      // Defensive guard: when this is the signup flow, only publish kind 3
      // if the active signer matches the freshly generated key. Without
      // this, a regression in the auto-switch would merge the follow pack
      // into the *previously logged-in user's* contact list — silently
      // adding follows to the wrong account.
      if (expectedPubkey && user.pubkey !== expectedPubkey) {
        toast({
          title: "Follows not saved",
          description:
            "The new account is not active yet, so your follows were not saved (this prevents modifying another account). You can follow people later from the app.",
          variant: "destructive",
        });
        return;
      }

      const packId = pack.id;
      setFollowingPack(packId);

      try {
        const packPubkeys = pack.tags
          .filter(([n]) => n === "p")
          .map(([, pk]) => pk);

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
        const newPTags = packPubkeys
          .filter((pk) => !existingPubkeys.has(pk))
          .map((pk) => ["p", pk]);

        // 4. Publish with prev for published_at preservation
        await publishEvent({
          kind: 3,
          content: prev?.content ?? "",
          tags: [...nonPTags, ...existingPTags, ...newPTags],
          prev: prev ?? undefined,
        });

        setFollowedPacks((prev) => new Set([...prev, packId]));
      } catch (error) {
        console.error("Failed to follow pack:", error);
      } finally {
        setFollowingPack(null);
      }
    },
    [user, nostr, publishEvent, expectedPubkey],
  );

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-400">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">
          Start with a few interesting voices
        </h2>
        <Typewriter
          text={`Your feed gets better when you follow people. Here's a small group to help ${config.appName} feel alive from the start.`}
          className="text-sm text-muted-foreground text-pretty"
        />
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
          onClick={() => onNext(followedPacks.size > 0)}
          className="flex-1 rounded-full h-11 gap-1.5"
        >
          {followedPacks.size > 0 ? "Continue" : "Skip for now"}
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
}: {
  event: NostrEvent;
  descriptionOverride?: string;
  isFollowed: boolean;
  isFollowing: boolean;
  onFollowAll: () => void;
}) {
  const { title, description, pubkeys } = useMemo(
    () => parsePackEvent(event),
    [event],
  );

  const displayDescription = descriptionOverride || description;

  // Fetch metadata for the first handful of members. We show a few of them in
  // detail (avatar + name + one-line bio) so the user gets a small sense of
  // "who are these people?" before tapping Follow All, plus a compact avatar
  // stack for the rest. This is intentionally NOT a carousel.
  const previewPubkeys = useMemo(() => pubkeys.slice(0, 6), [pubkeys]);
  const { data: membersMap } = useAuthors(previewPubkeys);

  const detailedPubkeys = useMemo(() => pubkeys.slice(0, 3), [pubkeys]);

  return (
    <div
      className={cn(
        "rounded-xl ring-1 ring-border overflow-hidden bg-card/50",
        "transition-all duration-200 hover:ring-primary/40 hover:shadow-sm",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300",
      )}
    >
      <div className="p-4 space-y-3">
        {/* Title + member count */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm leading-snug">{title}</h3>
            {displayDescription && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {displayDescription}
              </p>
            )}
          </div>
          <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0 mt-0.5">
            <Users className="w-3.5 h-3.5" />
            {pubkeys.length}
          </span>
        </div>

        {/* Small "who's in here" preview — up to 3 people in detail. Falls
            back gracefully to avatar + name when bio/metadata is missing. */}
        {detailedPubkeys.length > 0 && (
          <div className="space-y-1.5">
            {detailedPubkeys.map((pk, i) => {
              const member = membersMap?.get(pk);
              const meta = member?.metadata;
              const name =
                meta?.display_name || meta?.name || "Anonymous";
              const bio = meta?.about?.replace(/\s+/g, " ").trim();
              return (
                <div
                  key={pk}
                  style={{ animationDelay: `${i * 60}ms` }}
                  className="flex items-center gap-2.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-1 motion-safe:fill-mode-both"
                >
                  <Avatar
                    className="size-8 shrink-0 ring-1 ring-border"
                    shape={getAvatarShape(meta)}
                  >
                    <AvatarImage src={meta?.picture} alt={name} />
                    <AvatarFallback className="bg-primary/15 text-primary text-[11px]">
                      {name[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium leading-tight truncate">
                      {name}
                    </p>
                    {bio && (
                      <p className="text-[11px] text-muted-foreground leading-tight truncate">
                        {bio}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            {pubkeys.length > detailedPubkeys.length && (
              <p className="text-[11px] text-muted-foreground pl-[2.625rem]">
                and {pubkeys.length - detailedPubkeys.length} more
              </p>
            )}
          </div>
        )}

        {/* Follow All button */}
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
      </div>

      {/* Author attribution */}
      <AuthorAttribution pubkey={event.pubkey} />
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
      <AvatarImage src={src} alt={name} />
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
    <div className="flex flex-col items-center text-center gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="relative motion-safe:animate-in motion-safe:zoom-in-90 motion-safe:duration-700">
        <div className="absolute -inset-5 rounded-full bg-primary/15 blur-2xl motion-safe:animate-pulse" />
        <DittoLogo size={72} className="relative" />
        <div className="absolute -bottom-1 -right-1 bg-primary/10 rounded-full p-1.5 motion-safe:animate-in motion-safe:zoom-in motion-safe:duration-500 motion-safe:delay-200 motion-safe:fill-mode-both">
          <Heart className="w-5 h-5 text-primary fill-primary" />
        </div>
      </div>

      <div className="space-y-3 max-w-xs">
        <h2 className="text-2xl font-bold tracking-tight">You're in.</h2>
        <Typewriter
          text="Your space is ready. Go explore, follow a few interesting people, or post something small to make it yours."
          className="text-muted-foreground text-sm leading-relaxed text-pretty"
        />
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

// ---------------------------------------------------------------------------
// Shared nav buttons
// ---------------------------------------------------------------------------

function _StepNav({
  onBack,
  onNext,
  nextLabel = "Continue",
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
}) {
  return (
    <div className="flex gap-3">
      <Button
        variant="ghost"
        onClick={onBack}
        className="flex-1 rounded-full h-11"
      >
        Back
      </Button>
      <Button onClick={onNext} className="flex-1 rounded-full h-11 gap-1.5">
        {nextLabel}
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
