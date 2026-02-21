import { type ReactNode, useState, useCallback } from 'react';
import { MewLogo } from '@/components/MewLogo';
import { Button } from '@/components/ui/button';
import { type Theme, type ContentWarningPolicy } from '@/contexts/AppContext';
import { useAppContext } from '@/hooks/useAppContext';
import { useInitialSync, type SyncPhase } from '@/hooks/useInitialSync';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { cn } from '@/lib/utils';
import { Check, ChevronRight, Eye, EyeOff, Shield } from 'lucide-react';

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

  // Logged-out or sync already done -> show app
  if (phase === 'idle' || phase === 'complete') {
    return <>{children}</>;
  }

  // Syncing or found -> show sync screen
  if (phase === 'syncing' || phase === 'found') {
    return <SyncScreen phase={phase} />;
  }

  // Not found -> show setup questionnaire
  return <SetupQuestionnaire onComplete={markComplete} />;
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
  icon: string;
  sidebarKey: string;
  feedKey: string;
}

const CONTENT_KINDS: ContentKind[] = [
  { key: 'vines', label: 'Vines', description: 'Short video clips', icon: '🎬', sidebarKey: 'showVines', feedKey: 'feedIncludeVines' },
  { key: 'polls', label: 'Polls', description: 'Community polls', icon: '📊', sidebarKey: 'showPolls', feedKey: 'feedIncludePolls' },
  { key: 'treasures', label: 'Treasures', description: 'Geocaching adventures', icon: '🗺️', sidebarKey: 'showTreasures', feedKey: 'feedIncludeTreasureGeocaches' },
  { key: 'colors', label: 'Colors', description: 'Color palette sharing', icon: '🎨', sidebarKey: 'showColors', feedKey: 'feedIncludeColors' },
  { key: 'packs', label: 'Follow Packs', description: 'Curated follow lists', icon: '👥', sidebarKey: 'showPacks', feedKey: 'feedIncludePacks' },
  { key: 'streams', label: 'Streams', description: 'Live broadcasts', icon: '📡', sidebarKey: 'showStreams', feedKey: 'feedIncludeStreams' },
];

const CW_OPTIONS: { value: ContentWarningPolicy; label: string; description: string; icon: typeof Eye }[] = [
  { value: 'blur', label: 'Blur', description: 'Blur sensitive content until you tap', icon: Shield },
  { value: 'hide', label: 'Hide', description: 'Remove sensitive content entirely', icon: EyeOff },
  { value: 'show', label: 'Show', description: 'Display all content without warnings', icon: Eye },
];

type Step = 'welcome' | 'theme' | 'content' | 'safety' | 'done';
const STEPS: Step[] = ['welcome', 'theme', 'content', 'safety', 'done'];

function SetupQuestionnaire({ onComplete }: { onComplete: () => void }) {
  const { updateConfig } = useAppContext();
  const { user } = useCurrentUser();
  const { updateSettings } = useEncryptedSettings();

  const [step, setStep] = useState<Step>('welcome');
  const [selectedTheme, setSelectedTheme] = useState<Theme>('dark');
  const [selectedContent, setSelectedContent] = useState<Set<string>>(
    new Set(['vines', 'packs', 'streams']),
  );
  const [selectedCW, setSelectedCW] = useState<ContentWarningPolicy>('blur');
  const [isSaving, setIsSaving] = useState(false);

  const stepIndex = STEPS.indexOf(step);
  const progress = ((stepIndex) / (STEPS.length - 1)) * 100;

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

  const handleFinish = useCallback(async () => {
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

    setIsSaving(false);
    onComplete();
  }, [selectedTheme, selectedContent, selectedCW, updateConfig, updateSettings, user, onComplete]);

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
              onNext={() => {
                next();
                handleFinish();
              }}
              onBack={back}
            />
          )}

          {step === 'done' && (
            <DoneStep isSaving={isSaving} />
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
              <span className="text-2xl flex-shrink-0">{kind.icon}</span>
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
}: {
  selected: ContentWarningPolicy;
  onSelect: (p: ContentWarningPolicy) => void;
  onNext: () => void;
  onBack: () => void;
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
              className={cn(
                'w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200 text-left',
                isSelected
                  ? 'ring-2 ring-primary bg-primary/5'
                  : 'ring-1 ring-border hover:bg-muted/50',
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

      <StepNav onBack={onBack} onNext={onNext} nextLabel="Finish" />
    </div>
  );
}

function DoneStep({ isSaving }: { isSaving: boolean }) {
  return (
    <div className="flex flex-col items-center text-center gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <MewLogo size={64} />
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-8 h-8">
          <div className="absolute inset-0 rounded-full border-[2.5px] border-primary/20" />
          <div className="absolute inset-0 rounded-full border-[2.5px] border-transparent border-t-primary animate-spin" />
        </div>
        <p className="text-sm font-medium text-foreground">
          {isSaving ? 'Saving your preferences...' : 'Setting things up...'}
        </p>
      </div>
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
