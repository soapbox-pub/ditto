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
  UserPlus,
  Users,
} from "lucide-react";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import { saveNsec } from "@/lib/credentialManager";
import { openUrl } from "@/lib/downloadFile";
import { fetchFreshEvent } from "@/lib/fetchFreshEvent";
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
import { genUserName } from "@/lib/genUserName";
import { getAvatarShape, isValidAvatarShape } from "@/lib/avatarShape";
import { resolveTheme, resolveThemeConfig } from "@/themes";
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
  const { phase, markComplete } = useInitialSync();
  const { isLoading: settingsLoading } = useEncryptedSettings();
  const [preloadApp, setPreloadApp] = useState(false);
  const [signupActive, setSignupActive] = useState(false);
  // Track whether we've shown the app at least once so we don't re-gate on
  // subsequent background refetches (e.g. window focus).
  const hasShownApp = useRef(false);

  const startSignup = useCallback(() => setSignupActive(true), []);

  const handleSignupComplete = useCallback(() => {
    setSignupActive(false);
    markComplete();
  }, [markComplete]);

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
const SUGGESTED_PACKS: { kind: number; pubkey: string; identifier: string }[] =
  [
    {
      kind: 39089,
      pubkey:
        "932614571afcbad4d17a191ee281e39eebbb41b93fac8fd87829622aeb112f4d",
      identifier: "k4p5w0n22suf",
    },
  ];

// Steps for signup (includes keygen + profile) vs. settings-only (existing login)
type SignupStep = "keygen" | "download" | "profile";
type SettingsStep = "theme" | "follows" | "outro";
type Step = SignupStep | SettingsStep;

const SIGNUP_STEPS: Step[] = [
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
  const { config, updateConfig } = useAppContext();
  const { user } = useCurrentUser();
  const { updateSettings } = useEncryptedSettings();
  const login = useLoginActions();

  const steps = isSignup ? SIGNUP_STEPS : SETTINGS_STEPS;

  const [step, setStep] = useState<Step>(steps[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasFollows, setHasFollows] = useState<boolean | null>(null);

  // Signup-specific state
  const [nsec, setNsec] = useState("");

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

  // Save settings and transition to the follows step (or outro if they have follows)
  const handleSaveAndContinue = useCallback(async () => {
    setIsSaving(true);

    const feedSettings = {
      showArticles: false,
      showEvents: true,
      feedIncludeEvents: true,
      showVines: true,
      showPolls: false,
      showTreasures: true,
      showTreasureGeocaches: true,
      showTreasureFoundLogs: true,
      showColors: true,
      showPacks: false,
      showDecks: true,
      showWebxdc: true,
      showProfileThemes: false,
      showThemeDefinitions: true,
      showProfileThemeUpdates: true,
      showCustomProfileThemes: true,
      feedIncludePosts: true,
      feedIncludeComments: true,
      feedIncludeReposts: true,
      feedIncludeGenericReposts: true,
      feedIncludeArticles: false,
      feedIncludeVines: true,
      feedIncludePolls: false,
      feedIncludeColors: true,
      feedIncludeDecks: true,
      feedIncludePacks: false,
      feedIncludeTreasureGeocaches: true,
      feedIncludeTreasureFoundLogs: true,
      feedIncludeWebxdc: true,
      feedIncludeVoiceMessages: false,
      showEmojiPacks: true,
      feedIncludeEmojiPacks: true,
      showCustomEmojis: true,
      showUserStatuses: true,
      feedIncludeProfileThemes: true,
      feedIncludeThemeDefinitions: true,
      feedIncludeProfileThemeUpdates: true,
      showPhotos: true,
      feedIncludePhotos: true,
      showVideos: true,
      feedIncludeNormalVideos: true,
      feedIncludeShortVideos: true,
      showMusic: false,
      feedIncludeMusicTracks: false,
      feedIncludeMusicPlaylists: false,
      showPodcasts: false,
      feedIncludePodcastEpisodes: false,
      feedIncludePodcastTrailers: false,
      showDevelopment: false,
      feedIncludeDevelopment: false,
      showBadges: false,
      showBadgeDefinitions: true,
      showProfileBadges: true,
      showBadgeAwards: true,
      feedIncludeBadgeDefinitions: false,
      feedIncludeProfileBadges: false,
      feedIncludeBadgeAwards: false,
      feedIncludeVanish: true,
      feedIncludeBlobbi: true,
      feedIncludeTiles: true,
      followsFeedShowReplies: true,
    };

    updateConfig((current) => ({
      ...current,
      feedSettings,
      contentWarningPolicy: "blur",
    }));

    if (user?.signer.nip44) {
      try {
        await updateSettings.mutateAsync({
          feedSettings,
          contentWarningPolicy: "blur",
        });
      } catch (error) {
        console.warn("Failed to save initial settings to Nostr:", error);
      }
    }

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
  }, [updateConfig, updateSettings, user, nostr, goTo]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        <div className="w-full max-w-md mx-auto my-auto px-6 py-12">
          {/* Signup steps */}
          {step === "keygen" && <KeygenStep onGenerate={handleGenerate} />}

          {step === "download" && (
            <DownloadStep nsec={nsec} onContinue={handleDownloadContinue} />
          )}

          {step === "profile" && (
            <ProfileStep onNext={handleSaveAndContinue} isSaving={isSaving} />
          )}

          {/* Settings steps */}
          {step === "theme" && (
            <ThemeStep
              onNext={isSignup ? next : handleSaveAndContinue}
              onBack={back}
              isFirst={isSignup && steps.indexOf("theme") === 0}
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
            />
          )}

          {step === "outro" && <OutroStep onComplete={onComplete} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signup steps: Keygen, Download, Profile
// ---------------------------------------------------------------------------

function KeygenStep({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <DittoLogo size={80} />

      <div className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight">
          Create your account
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
          Your identity on Nostr is a cryptographic key. We'll generate one
          for you now.
        </p>
      </div>

      <Button
        size="lg"
        className="w-full max-w-xs gap-2 rounded-full h-12"
        onClick={onGenerate}
      >
        Generate my key
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
  const { config } = useAppContext();
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
          Your secret key
        </h2>
        <p className="text-sm text-muted-foreground">
          This secret key controls your account on {config.appName}. You'll need it to log in later. Without it, you'll lose your account.
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

      {showKey && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800 animate-in fade-in slide-in-from-top-1 duration-200">
          <p className="text-xs text-amber-900 dark:text-amber-300">
            NEVER share your secret key with anyone. Avoid screenshotting your key or pasting it anywhere except a password manager. If shared, others will be able to access your account.{" "}
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
}: {
  onNext: () => void;
  isSaving?: boolean;
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
  }, [user, profileData, publishEvent, queryClient, onNext]);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-400">
      <div className="flex items-center gap-4">
        <IntroImage src="/profile-intro.png" />
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">
            Set up your profile
          </h2>
          <p className="text-sm text-muted-foreground">
            Tell people a bit about yourself. You can always change this later.
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
  isSaving = false,
}: {
  onNext: () => void;
  onBack: () => void;
  isFirst?: boolean;
  isSaving?: boolean;
}) {
  const { theme, customTheme, themes } = useTheme();
  const resolved = resolveTheme(theme);
  const activeConfig = resolved === 'custom' ? customTheme : resolveThemeConfig(resolved, themes);
  const bgUrl = activeConfig?.background?.url;

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
            Choose your look
          </h2>
          <p className="text-sm text-muted-foreground">
            Pick a theme that feels right.
          </p>
        </div>

        <ThemeGrid columns="scroll" limit={9} />

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

function FollowsStep({
  onNext,
  onBack,
}: {
  onNext: (didFollow: boolean) => void;
  onBack: () => void;
}) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
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
    [user, nostr, publishEvent],
  );

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-400">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">
          Find your people
        </h2>
        <p className="text-sm text-muted-foreground">
          Your feed is empty! Follow some people to get started. Here are some
          curated packs to help you find interesting voices.
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
  isFollowed,
  isFollowing,
  onFollowAll,
}: {
  event: NostrEvent;
  isFollowed: boolean;
  isFollowing: boolean;
  onFollowAll: () => void;
}) {
  const { title, description, pubkeys } = useMemo(
    () => parsePackEvent(event),
    [event],
  );

  // Show first 6 member avatars
  const previewPubkeys = useMemo(() => pubkeys.slice(0, 6), [pubkeys]);
  const { data: membersMap } = useAuthors(previewPubkeys);

  return (
    <div className="rounded-xl ring-1 ring-border overflow-hidden">
      <div className="p-4 space-y-3">
        {/* Title + member count */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm leading-snug">{title}</h3>
            {description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {description}
              </p>
            )}
          </div>
          <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0 mt-0.5">
            <Users className="w-3.5 h-3.5" />
            {pubkeys.length}
          </span>
        </div>

        {/* Member avatar stack */}
        <div className="flex items-center gap-1">
          <div className="flex -space-x-2">
            {previewPubkeys.map((pk) => {
              const member = membersMap?.get(pk);
              const name = member?.metadata?.name || genUserName(pk);
              return (
                <MiniAvatar
                  key={pk}
                  src={member?.metadata?.picture}
                  name={name}
                />
              );
            })}
          </div>
          {pubkeys.length > previewPubkeys.length && (
            <span className="text-xs text-muted-foreground ml-1">
              +{pubkeys.length - previewPubkeys.length} more
            </span>
          )}
        </div>

        {/* Follow All button */}
        <Button
          className="w-full gap-2"
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
  const name = metadata?.name || genUserName(pubkey);

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
      <div className="relative">
        <DittoLogo size={72} />
        <div className="absolute -bottom-1 -right-1 bg-primary/10 rounded-full p-1.5">
          <Heart className="w-5 h-5 text-primary fill-primary" />
        </div>
      </div>

      <div className="space-y-3 max-w-xs">
        <h2 className="text-2xl font-bold tracking-tight">You're all set</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          That's it! Go find something wonderful, share something fun, and make
          yourself at home.
        </p>
      </div>

      <Button
        size="lg"
        className="w-full max-w-xs gap-2 rounded-full h-12"
        onClick={onComplete}
      >
        Let's go
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
