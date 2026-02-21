import { type ReactNode, useState, useCallback, useMemo, useEffect } from 'react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { MewLogo } from '@/components/MewLogo';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { type Theme, type ContentWarningPolicy } from '@/contexts/AppContext';
import { useAppContext } from '@/hooks/useAppContext';
import { useInitialSync, type SyncPhase } from '@/hooks/useInitialSync';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useAuthors } from '@/hooks/useAuthors';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';
import {
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Shield,
  Clapperboard,
  BarChart3,
  Palette,
  Users,
  Radio,
  UserPlus,
  Loader2,
  Heart,
  type LucideIcon,
} from 'lucide-react';
import { ChestIcon } from '@/components/icons/ChestIcon';

interface InitialSyncGateProps {
  children: ReactNode;
}

/**
 * Gates the main app behind an initial sync / setup flow for logged-in users.
 * - Logged-out users pass straight through.
 * - Logged-in users see a sync spinner, then either proceed (settings found)
 *   or walk through a brief questionnaire (fresh account / new device with no settings).
 */
export function InitialSyncGate({ children }: InitialSyncGateProps) {
  const { phase, markComplete } = useInitialSync();
  const [preloadApp, setPreloadApp] = useState(false);

  // Logged-out or sync already done -> show app
  if (phase === 'idle' || phase === 'complete') {
    return <>{children}</>;
  }

  // Syncing or found -> show sync screen
  if (phase === 'syncing' || phase === 'found') {
    return <SyncScreen phase={phase} />;
  }

  // Not found -> show setup questionnaire (with app rendered behind if preloading)
  return (
    <>
      {preloadApp && <div className="invisible">{children}</div>}
      <SetupQuestionnaire onComplete={markComplete} onPreload={() => setPreloadApp(true)} />
    </>
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
          <MewLogo size={72} className="relative" />
        </div>

        {/* Spinner */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-10 h-10">
            <div
              className="absolute inset-0 rounded-full border-[2.5px] border-primary/20"
            />
            <div
              className="absolute inset-0 rounded-full border-[2.5px] border-transparent border-t-primary animate-spin"
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">
              {phase === 'found' ? 'Settings restored' : 'Syncing your settings...'}
            </p>
            <p className="text-xs text-muted-foreground">
              {phase === 'found'
                ? 'Welcome back! Loading your experience...'
                : 'Checking for your preferences across devices'}
            </p>
          </div>
        </div>

        {/* Subtle progress dots */}
        {phase === 'syncing' && (
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

        {phase === 'found' && (
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

const THEMES: { value: Theme; label: string; description: string; preview: string }[] = [
  { value: 'dark', label: 'Mew', description: 'Deep purple dark theme', preview: 'bg-[hsl(228,20%,10%)]' },
  { value: 'light', label: 'Light', description: 'Clean and bright', preview: 'bg-white border border-border' },
  { value: 'black', label: 'Black', description: 'True OLED black', preview: 'bg-black' },
  { value: 'pink', label: 'Pink', description: 'Warm and playful', preview: 'bg-[hsl(330,100%,96%)]' },
];

interface ContentKind {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon | React.ComponentType<{ className?: string }>;
  sidebarKey: string;
  feedKey: string;
}

const CONTENT_KINDS: ContentKind[] = [
  { key: 'vines', label: 'Vines', description: 'Short video clips', icon: Clapperboard, sidebarKey: 'showVines', feedKey: 'feedIncludeVines' },
  { key: 'polls', label: 'Polls', description: 'Community polls', icon: BarChart3, sidebarKey: 'showPolls', feedKey: 'feedIncludePolls' },
  { key: 'treasures', label: 'Treasures', description: 'Geocaching adventures', icon: ChestIcon, sidebarKey: 'showTreasures', feedKey: 'feedIncludeTreasureGeocaches' },
  { key: 'colors', label: 'Colors', description: 'Color palette sharing', icon: Palette, sidebarKey: 'showColors', feedKey: 'feedIncludeColors' },
  { key: 'packs', label: 'Follow Packs', description: 'Curated follow lists', icon: Users, sidebarKey: 'showPacks', feedKey: 'feedIncludePacks' },
  { key: 'streams', label: 'Streams', description: 'Live broadcasts', icon: Radio, sidebarKey: 'showStreams', feedKey: 'feedIncludeStreams' },
];

const CW_OPTIONS: { value: ContentWarningPolicy; label: string; description: string; icon: typeof Eye }[] = [
  { value: 'blur', label: 'Blur', description: 'Blur sensitive content until you tap', icon: Shield },
  { value: 'hide', label: 'Hide', description: 'Remove sensitive content entirely', icon: EyeOff },
  { value: 'show', label: 'Show', description: 'Display all content without warnings', icon: Eye },
];

/** Suggested follow packs shown to new users with empty follow lists. */
const SUGGESTED_PACKS: { kind: number; pubkey: string; identifier: string }[] = [
  { kind: 39089, pubkey: '932614571afcbad4d17a191ee281e39eebbb41b93fac8fd87829622aeb112f4d', identifier: 'k4p5w0n22suf' },
];

type Step = 'welcome' | 'theme' | 'content' | 'safety' | 'follows' | 'outro';
const STEPS: Step[] = ['welcome', 'theme', 'content', 'safety', 'follows', 'outro'];

function SetupQuestionnaire({ onComplete, onPreload }: { onComplete: () => void; onPreload: () => void }) {
  const { nostr } = useNostr();
  const { updateConfig } = useAppContext();
  const { user } = useCurrentUser();
  const { updateSettings } = useEncryptedSettings();

  const [step, setStep] = useState<Step>('welcome');
  const [selectedTheme, setSelectedTheme] = useState<Theme>('dark');
  const [selectedContent, setSelectedContent] = useState<Set<string>>(
    new Set(['vines', 'streams']),
  );
  const [selectedCW, setSelectedCW] = useState<ContentWarningPolicy>('blur');
  const [isSaving, setIsSaving] = useState(false);
  const [hasFollows, setHasFollows] = useState<boolean | null>(null); // null = unknown

  const stepIndex = STEPS.indexOf(step);
  const progress = ((stepIndex) / (STEPS.length - 1)) * 100;

  const goTo = useCallback((target: Step) => setStep(target), []);

  const next = useCallback(() => {
    const i = STEPS.indexOf(step);
    if (i < STEPS.length - 1) {
      setStep(STEPS[i + 1]);
    }
  }, [step]);

  const back = useCallback(() => {
    const i = STEPS.indexOf(step);
    if (i > 0) {
      setStep(STEPS[i - 1]);
    }
  }, [step]);

  const toggleContent = useCallback((key: string) => {
    setSelectedContent((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Save settings and transition to the follows step (or outro if they have follows)
  const handleSaveAndContinue = useCallback(async () => {
    setIsSaving(true);

    // Build feed settings from selections
    const feedSettings = {
      showVines: selectedContent.has('vines'),
      showPolls: selectedContent.has('polls'),
      showTreasures: selectedContent.has('treasures'),
      showTreasureGeocaches: true,
      showTreasureFoundLogs: true,
      showColors: selectedContent.has('colors'),
      showPacks: selectedContent.has('packs'),
      showStreams: selectedContent.has('streams'),
      feedIncludeVines: selectedContent.has('vines'),
      feedIncludePolls: selectedContent.has('polls'),
      feedIncludeTreasureGeocaches: selectedContent.has('treasures'),
      feedIncludeTreasureFoundLogs: selectedContent.has('treasures'),
      feedIncludeColors: selectedContent.has('colors'),
      feedIncludePacks: selectedContent.has('packs'),
      feedIncludeStreams: selectedContent.has('streams'),
    };

    // Apply settings locally
    updateConfig((current) => ({
      ...current,
      theme: selectedTheme,
      feedSettings,
      contentWarningPolicy: selectedCW,
    }));

    // Try to persist to encrypted settings (best-effort)
    if (user?.signer.nip44) {
      try {
        await updateSettings.mutateAsync({
          theme: selectedTheme,
          feedSettings,
          contentWarningPolicy: selectedCW,
        });
      } catch (error) {
        console.warn('Failed to save initial settings to Nostr:', error);
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
          const pTags = events[0].tags.filter(([n]) => n === 'p');
          userHasFollows = pTags.length > 0;
        }
      } catch {
        // On error, skip the follows step
        userHasFollows = true;
      }
    }

    setHasFollows(userHasFollows);
    setIsSaving(false);

    if (userHasFollows) {
      // Skip follows, go straight to outro
      goTo('outro');
    } else {
      goTo('follows');
    }
  }, [selectedTheme, selectedContent, selectedCW, updateConfig, updateSettings, user, nostr, goTo]);

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
      <div className="flex-1 flex items-center justify-center overflow-y-auto">
        <div className="w-full max-w-md px-6 py-12">
          {step === 'welcome' && (
            <WelcomeStep onNext={next} />
          )}

          {step === 'theme' && (
            <ThemeStep
              selected={selectedTheme}
              onSelect={setSelectedTheme}
              onNext={next}
              onBack={back}
            />
          )}

          {step === 'content' && (
            <ContentStep
              selected={selectedContent}
              onToggle={toggleContent}
              onNext={next}
              onBack={back}
            />
          )}

          {step === 'safety' && (
            <SafetyStep
              selected={selectedCW}
              onSelect={setSelectedCW}
              onNext={handleSaveAndContinue}
              onBack={back}
              isSaving={isSaving}
            />
          )}

          {step === 'follows' && hasFollows === false && (
            <FollowsStep
              onNext={(didFollow) => {
                if (didFollow) onPreload();
                goTo('outro');
              }}
              onBack={() => goTo('safety')}
            />
          )}

          {step === 'outro' && (
            <OutroStep onComplete={onComplete} />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual steps
// ---------------------------------------------------------------------------

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <MewLogo size={80} />

      <div className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome to Mew
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
          Let's personalize your experience. This only takes a moment and you can always change these later in Settings.
        </p>
      </div>

      <Button
        size="lg"
        className="w-full max-w-xs gap-2 rounded-full h-12"
        onClick={onNext}
      >
        Get started
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

function ThemeStep({
  selected,
  onSelect,
  onNext,
  onBack,
}: {
  selected: Theme;
  onSelect: (t: Theme) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-400">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Choose your look</h2>
        <p className="text-sm text-muted-foreground">Pick a theme that feels right.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {THEMES.map((theme) => (
          <button
            key={theme.value}
            type="button"
            onClick={() => onSelect(theme.value)}
            className={cn(
              'group relative flex flex-col items-center gap-3 p-4 rounded-xl transition-all duration-200',
              'hover:bg-muted/50',
              selected === theme.value
                ? 'ring-2 ring-primary bg-primary/5'
                : 'ring-1 ring-border',
            )}
          >
            <div
              className={cn(
                'w-14 h-14 rounded-full transition-transform duration-200 group-hover:scale-110',
                theme.preview,
              )}
            />
            <div className="space-y-0.5 text-center">
              <p className="text-sm font-medium">{theme.label}</p>
              <p className="text-xs text-muted-foreground">{theme.description}</p>
            </div>
            {selected === theme.value && (
              <div className="absolute top-2 right-2">
                <Check className="w-4 h-4 text-primary" />
              </div>
            )}
          </button>
        ))}
      </div>

      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  );
}

function ContentStep({
  selected,
  onToggle,
  onNext,
  onBack,
}: {
  selected: Set<string>;
  onToggle: (key: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-400">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">What interests you?</h2>
        <p className="text-sm text-muted-foreground">
          Enable content types to see in your sidebar and feed. You can change these anytime.
        </p>
      </div>

      <div className="space-y-2">
        {CONTENT_KINDS.map((kind) => {
          const isSelected = selected.has(kind.key);
          return (
            <button
              key={kind.key}
              type="button"
              onClick={() => onToggle(kind.key)}
              className={cn(
                'w-full flex items-center gap-4 p-3.5 rounded-xl transition-all duration-200 text-left',
                isSelected
                  ? 'ring-2 ring-primary bg-primary/5'
                  : 'ring-1 ring-border hover:bg-muted/50',
              )}
            >
              <div className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                isSelected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
              )}>
                <kind.icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{kind.label}</p>
                <p className="text-xs text-muted-foreground">{kind.description}</p>
              </div>
              <div
                className={cn(
                  'w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-colors',
                  isSelected
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-input',
                )}
              >
                {isSelected && <Check className="w-3.5 h-3.5" />}
              </div>
            </button>
          );
        })}
      </div>

      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  );
}

function SafetyStep({
  selected,
  onSelect,
  onNext,
  onBack,
  isSaving,
}: {
  selected: ContentWarningPolicy;
  onSelect: (p: ContentWarningPolicy) => void;
  onNext: () => void;
  onBack: () => void;
  isSaving: boolean;
}) {
  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-400">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Content safety</h2>
        <p className="text-sm text-muted-foreground">
          Choose how to handle posts marked with content warnings.
        </p>
      </div>

      <div className="space-y-2">
        {CW_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect(option.value)}
              disabled={isSaving}
              className={cn(
                'w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200 text-left',
                isSelected
                  ? 'ring-2 ring-primary bg-primary/5'
                  : 'ring-1 ring-border hover:bg-muted/50',
                isSaving && 'opacity-50 pointer-events-none',
              )}
            >
              <div className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                isSelected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
              )}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{option.label}</p>
                <p className="text-xs text-muted-foreground">{option.description}</p>
              </div>
              {isSelected && (
                <Check className="w-4 h-4 text-primary flex-shrink-0" />
              )}
            </button>
          );
        })}
      </div>

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
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              Continue
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Follow Packs Step
// ---------------------------------------------------------------------------

/** Parse a follow pack event into structured data. */
function parsePackEvent(event: NostrEvent) {
  const getTag = (name: string) => event.tags.find(([n]) => n === name)?.[1];
  const title = getTag('title') || getTag('name') || 'Untitled Pack';
  const description = getTag('description') || getTag('summary') || '';
  const image = getTag('image') || getTag('thumb') || getTag('banner');
  const pubkeys = event.tags.filter(([n]) => n === 'p').map(([, pk]) => pk);

  return { title, description, image, pubkeys };
}

function FollowsStep({ onNext, onBack }: { onNext: (didFollow: boolean) => void; onBack: () => void }) {
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
          '#d': [p.identifier],
          limit: 1,
        }));

        const events = await nostr.query(filters, { signal: AbortSignal.timeout(8000) });
        if (!cancelled) {
          setPacks(events);
        }
      } catch (error) {
        console.warn('Failed to fetch suggested follow packs:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPacks();
    return () => { cancelled = true; };
  }, [nostr]);

  const handleFollowAll = useCallback(async (pack: NostrEvent) => {
    if (!user) return;

    const packId = pack.id;
    setFollowingPack(packId);

    try {
      const packPubkeys = pack.tags.filter(([n]) => n === 'p').map(([, pk]) => pk);

      // Fetch current follow list
      const followEvents: NostrEvent[] = await nostr.query(
        [{ kinds: [3], authors: [user.pubkey], limit: 1 }],
        { signal: AbortSignal.timeout(10_000) },
      ).catch((): NostrEvent[] => []);

      const latestEvent = followEvents.length > 0
        ? followEvents.reduce((latest, current) => current.created_at > latest.created_at ? current : latest)
        : null;

      const existingFollows = latestEvent
        ? latestEvent.tags.filter(([name]) => name === 'p').map(([, pk]) => pk)
        : [];

      const allFollows = [...new Set([...existingFollows, ...packPubkeys])];

      await publishEvent({
        kind: 3,
        content: latestEvent?.content ?? '',
        tags: allFollows.map((pk) => ['p', pk]),
      });

      setFollowedPacks((prev) => new Set([...prev, packId]));
    } catch (error) {
      console.error('Failed to follow pack:', error);
    } finally {
      setFollowingPack(null);
    }
  }, [user, nostr, publishEvent]);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-400">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Find your people</h2>
        <p className="text-sm text-muted-foreground">
          Your feed is empty! Follow some people to get started. Here are some curated packs to help you find interesting voices.
        </p>
      </div>

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: SUGGESTED_PACKS.length }).map((_, i) => (
            <PackCardSkeleton key={i} />
          ))
        ) : packs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Couldn't load suggestions right now. You can find follow packs later in the app.
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
          {followedPacks.size > 0 ? 'Continue' : 'Skip for now'}
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
  const { title, description, pubkeys } = useMemo(() => parsePackEvent(event), [event]);

  // Show first 6 member avatars
  const previewPubkeys = useMemo(() => pubkeys.slice(0, 6), [pubkeys]);
  const { data: membersMap } = useAuthors(previewPubkeys);

  const authorNpub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);

  return (
    <div className="rounded-xl ring-1 ring-border overflow-hidden">
      <div className="p-4 space-y-3">
        {/* Title + member count */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm leading-snug">{title}</h3>
            {description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{description}</p>
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
          variant={isFollowed ? 'outline' : 'default'}
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
      <AuthorAttribution pubkey={event.pubkey} npub={authorNpub} />
    </div>
  );
}

/** Small author attribution bar at the bottom of a pack card. */
function AuthorAttribution({ pubkey, npub: _npub }: { pubkey: string; npub: string }) {
  const { data: authorData } = useAuthors([pubkey]);
  const metadata: NostrMetadata | undefined = authorData?.get(pubkey)?.metadata;
  const name = metadata?.name || genUserName(pubkey);

  return (
    <div className="px-4 py-2 bg-muted/30 border-t border-border flex items-center gap-2">
      <MiniAvatar src={metadata?.picture} name={name} />
      <span className="text-xs text-muted-foreground truncate">
        by <span className="font-medium text-foreground">{name}</span>
      </span>
    </div>
  );
}

/** Tiny avatar used in pack member stacks. */
function MiniAvatar({ src, name }: { src?: string; name: string }) {
  return (
    <Avatar className="size-7 ring-2 ring-background">
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
          <Skeleton key={i} className="size-7 rounded-full ring-2 ring-background" />
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
        <MewLogo size={72} />
        <div className="absolute -bottom-1 -right-1 bg-primary/10 rounded-full p-1.5">
          <Heart className="w-5 h-5 text-primary fill-primary" />
        </div>
      </div>

      <div className="space-y-3 max-w-xs">
        <h2 className="text-2xl font-bold tracking-tight">
          You're all set
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          That's it! Go find something wonderful, share something fun,
          and make yourself at home.
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

function StepNav({
  onBack,
  onNext,
  nextLabel = 'Continue',
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
      <Button
        onClick={onNext}
        className="flex-1 rounded-full h-11 gap-1.5"
      >
        {nextLabel}
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
