/**
 * BlobbiDevEditor - DEV MODE ONLY
 * 
 * A comprehensive editor for directly modifying Blobbi state during development.
 * Allows testing stage transitions, stat changes, adult forms, and other properties
 * without going through the normal game flow.
 * 
 * IMPORTANT: This component should only be rendered in development mode.
 */

import { useState, useCallback, useMemo } from 'react';
import { Egg, Baby, Sparkles, Loader2, RotateCcw, Zap, Heart, Utensils, Droplets, Activity, Battery, Moon, Sun, RefreshCw, SkipForward } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import type { BlobbiCompanion, BlobbiStage, BlobbiState, BlobbiStats } from '@/blobbi/core/lib/blobbi';
import { ADULT_FORMS } from '@/blobbi/adult-blobbi/types/adult.types';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Tour dev actions for the first-hatch tour */
interface FirstHatchTourDevActions {
  /** Skip the current step (for dev testing) */
  skipPostRequirement: () => void;
  /** Reset the entire first-hatch tour so it can be tested again from scratch */
  resetTour: () => void;
  /** Current tour step id, or null if not active */
  currentStepId: string | null;
  /** Whether the tour has been completed */
  isCompleted: boolean;
}

interface BlobbiDevEditorProps {
  /** Whether the editor modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** The current Blobbi companion to edit */
  companion: BlobbiCompanion;
  /** Callback when changes should be applied */
  onApply: (updates: BlobbiDevUpdates) => Promise<void>;
  /** Whether an update is in progress */
  isUpdating?: boolean;
  /** Optional: first-hatch tour dev actions (only passed when tour system is available) */
  tourDevActions?: FirstHatchTourDevActions;
}

/** Updates that can be applied to a Blobbi */
export interface BlobbiDevUpdates {
  /** Stage transition */
  stage?: BlobbiStage;
  /** State change (active, sleeping, etc.) */
  state?: BlobbiState;
  /** Adult form type (only for adults) */
  adultType?: string;
  /** Stats updates */
  stats?: Partial<BlobbiStats>;
  /** Experience points */
  experience?: number;
  /** Care streak */
  careStreak?: number;
  /** Breeding ready flag */
  breedingReady?: boolean;
  /** Generation number */
  generation?: number;
}

// ─── Stat Presets ─────────────────────────────────────────────────────────────

interface StatPreset {
  name: string;
  description: string;
  stats: Partial<BlobbiStats>;
  variant: 'default' | 'destructive' | 'outline' | 'secondary';
}

const STAT_PRESETS: StatPreset[] = [
  {
    name: 'Max Stats',
    description: 'All stats at 100',
    stats: { hunger: 100, happiness: 100, health: 100, hygiene: 100, energy: 100 },
    variant: 'default',
  },
  {
    name: 'Starving',
    description: 'Hunger at 5',
    stats: { hunger: 5 },
    variant: 'destructive',
  },
  {
    name: 'Exhausted',
    description: 'Energy at 5',
    stats: { energy: 5 },
    variant: 'destructive',
  },
  {
    name: 'Dirty',
    description: 'Hygiene at 10',
    stats: { hygiene: 10 },
    variant: 'outline',
  },
  {
    name: 'Sad',
    description: 'Happiness at 15',
    stats: { happiness: 15 },
    variant: 'outline',
  },
  {
    name: 'Critical Health',
    description: 'Health at 10',
    stats: { health: 10 },
    variant: 'destructive',
  },
  {
    name: 'All Low',
    description: 'All stats at 20',
    stats: { hunger: 20, happiness: 20, health: 20, hygiene: 20, energy: 20 },
    variant: 'destructive',
  },
  {
    name: 'Half Stats',
    description: 'All stats at 50',
    stats: { hunger: 50, happiness: 50, health: 50, hygiene: 50, energy: 50 },
    variant: 'secondary',
  },
];

// ─── Stat Editor Component ────────────────────────────────────────────────────

interface StatSliderProps {
  label: string;
  icon: React.ReactNode;
  value: number;
  onChange: (value: number) => void;
  color: string;
}

function StatSlider({ label, icon, value, onChange, color }: StatSliderProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('size-4', color)}>{icon}</span>
          <Label className="text-sm font-medium">{label}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={100}
            value={value}
            onChange={(e) => onChange(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
            className="w-16 h-7 text-sm text-center"
          />
          <span className="text-xs text-muted-foreground w-6">%</span>
        </div>
      </div>
      <Slider
        value={[value]}
        min={0}
        max={100}
        step={1}
        onValueChange={([v]) => onChange(v)}
        className="w-full"
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BlobbiDevEditor({
  isOpen,
  onClose,
  companion,
  onApply,
  isUpdating = false,
  tourDevActions,
}: BlobbiDevEditorProps) {
  // ─── Local State ───
  // Initialize from companion values
  const [stage, setStage] = useState<BlobbiStage>(companion.stage);
  const [state, setState] = useState<BlobbiState>(companion.state);
  const [adultType, setAdultType] = useState<string>(companion.adultType ?? 'catti');
  const [stats, setStats] = useState<BlobbiStats>({
    hunger: companion.stats.hunger ?? 100,
    happiness: companion.stats.happiness ?? 100,
    health: companion.stats.health ?? 100,
    hygiene: companion.stats.hygiene ?? 100,
    energy: companion.stats.energy ?? 100,
  });
  const [experience, setExperience] = useState(companion.experience ?? 0);
  const [careStreak, setCareStreak] = useState(companion.careStreak ?? 0);
  const [breedingReady, setBreedingReady] = useState(companion.breedingReady);
  const [generation, setGeneration] = useState(companion.generation ?? 1);

  // Reset state when companion changes or modal opens
  const resetToCompanion = useCallback(() => {
    setStage(companion.stage);
    setState(companion.state);
    setAdultType(companion.adultType ?? 'catti');
    setStats({
      hunger: companion.stats.hunger ?? 100,
      happiness: companion.stats.happiness ?? 100,
      health: companion.stats.health ?? 100,
      hygiene: companion.stats.hygiene ?? 100,
      energy: companion.stats.energy ?? 100,
    });
    setExperience(companion.experience ?? 0);
    setCareStreak(companion.careStreak ?? 0);
    setBreedingReady(companion.breedingReady);
    setGeneration(companion.generation ?? 1);
  }, [companion]);

  // Check if there are any changes
  const hasChanges = useMemo(() => {
    return (
      stage !== companion.stage ||
      state !== companion.state ||
      (stage === 'adult' && adultType !== (companion.adultType ?? 'catti')) ||
      stats.hunger !== (companion.stats.hunger ?? 100) ||
      stats.happiness !== (companion.stats.happiness ?? 100) ||
      stats.health !== (companion.stats.health ?? 100) ||
      stats.hygiene !== (companion.stats.hygiene ?? 100) ||
      stats.energy !== (companion.stats.energy ?? 100) ||
      experience !== (companion.experience ?? 0) ||
      careStreak !== (companion.careStreak ?? 0) ||
      breedingReady !== companion.breedingReady ||
      generation !== (companion.generation ?? 1)
    );
  }, [stage, state, adultType, stats, experience, careStreak, breedingReady, generation, companion]);

  // Apply preset
  const applyPreset = useCallback((preset: StatPreset) => {
    setStats(prev => ({ ...prev, ...preset.stats }));
  }, []);

  // Update single stat
  const updateStat = useCallback((key: keyof BlobbiStats, value: number) => {
    setStats(prev => ({ ...prev, [key]: value }));
  }, []);

  // Handle apply
  const handleApply = useCallback(async () => {
    const updates: BlobbiDevUpdates = {};

    // Only include changed values
    if (stage !== companion.stage) {
      updates.stage = stage;
    }
    if (state !== companion.state) {
      updates.state = state;
    }
    if (stage === 'adult' && adultType !== (companion.adultType ?? 'catti')) {
      updates.adultType = adultType;
    }

    // Stats - check each individually
    const statsUpdates: Partial<BlobbiStats> = {};
    if (stats.hunger !== (companion.stats.hunger ?? 100)) statsUpdates.hunger = stats.hunger;
    if (stats.happiness !== (companion.stats.happiness ?? 100)) statsUpdates.happiness = stats.happiness;
    if (stats.health !== (companion.stats.health ?? 100)) statsUpdates.health = stats.health;
    if (stats.hygiene !== (companion.stats.hygiene ?? 100)) statsUpdates.hygiene = stats.hygiene;
    if (stats.energy !== (companion.stats.energy ?? 100)) statsUpdates.energy = stats.energy;
    if (Object.keys(statsUpdates).length > 0) {
      updates.stats = statsUpdates;
    }

    // Other fields
    if (experience !== (companion.experience ?? 0)) updates.experience = experience;
    if (careStreak !== (companion.careStreak ?? 0)) updates.careStreak = careStreak;
    if (breedingReady !== companion.breedingReady) updates.breedingReady = breedingReady;
    if (generation !== (companion.generation ?? 1)) updates.generation = generation;

    await onApply(updates);
    onClose();
  }, [stage, state, adultType, stats, experience, careStreak, breedingReady, generation, companion, onApply, onClose]);

  // Handle close
  const handleClose = useCallback(() => {
    resetToCompanion();
    onClose();
  }, [resetToCompanion, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-amber-500">DEV</span>
            <span>Blobbi State Editor</span>
            <Badge variant="outline" className="ml-2 text-xs">
              {companion.name}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Directly edit Blobbi state for testing. Changes are published to the network.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* ─── Stage Controls ─── */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Stage / Evolution</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={stage === 'egg' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStage('egg')}
                className="gap-2"
              >
                <Egg className="size-4" />
                Egg
              </Button>
              <Button
                variant={stage === 'baby' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStage('baby')}
                className="gap-2"
              >
                <Baby className="size-4" />
                Baby
              </Button>
              <Button
                variant={stage === 'adult' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStage('adult')}
                className="gap-2"
              >
                <Sparkles className="size-4" />
                Adult
              </Button>
            </div>
            {stage !== companion.stage && (
              <p className="text-xs text-amber-500">
                Stage will change from {companion.stage} to {stage}
              </p>
            )}
          </div>

          {/* ─── Adult Form (only shown for adults) ─── */}
          {stage === 'adult' && (
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Adult Form</Label>
              <Select value={adultType} onValueChange={setAdultType}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select form" />
                </SelectTrigger>
                <SelectContent>
                  {ADULT_FORMS.map((form) => (
                    <SelectItem key={form} value={form} className="capitalize">
                      {form}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Separator />

          {/* ─── State Controls ─── */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Activity State</Label>
            <Select value={state} onValueChange={(v) => setState(v as BlobbiState)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">
                  <div className="flex items-center gap-2">
                    <Sun className="size-4" />
                    Active (Awake)
                  </div>
                </SelectItem>
                <SelectItem value="sleeping">
                  <div className="flex items-center gap-2">
                    <Moon className="size-4" />
                    Sleeping
                  </div>
                </SelectItem>
                <SelectItem value="hibernating">
                  <div className="flex items-center gap-2">
                    <Moon className="size-4 opacity-50" />
                    Hibernating
                  </div>
                </SelectItem>
                <SelectItem value="incubating">
                  <div className="flex items-center gap-2">
                    <Egg className="size-4" />
                    Incubating
                  </div>
                </SelectItem>
                <SelectItem value="evolving">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4" />
                    Evolving
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* ─── Stats Section ─── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Stats</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStats({
                  hunger: companion.stats.hunger ?? 100,
                  happiness: companion.stats.happiness ?? 100,
                  health: companion.stats.health ?? 100,
                  hygiene: companion.stats.hygiene ?? 100,
                  energy: companion.stats.energy ?? 100,
                })}
                className="h-7 text-xs"
              >
                <RotateCcw className="size-3 mr-1" />
                Reset Stats
              </Button>
            </div>

            {/* Stat Presets */}
            <div className="flex flex-wrap gap-2">
              {STAT_PRESETS.map((preset) => (
                <Button
                  key={preset.name}
                  variant={preset.variant}
                  size="sm"
                  onClick={() => applyPreset(preset)}
                  className="h-7 text-xs"
                  title={preset.description}
                >
                  {preset.name}
                </Button>
              ))}
            </div>

            {/* Stat Sliders */}
            <div className="space-y-4 pt-2">
              <StatSlider
                label="Hunger"
                icon={<Utensils className="size-4" />}
                value={stats.hunger}
                onChange={(v) => updateStat('hunger', v)}
                color="text-orange-500"
              />
              <StatSlider
                label="Happiness"
                icon={<Heart className="size-4" />}
                value={stats.happiness}
                onChange={(v) => updateStat('happiness', v)}
                color="text-pink-500"
              />
              <StatSlider
                label="Health"
                icon={<Activity className="size-4" />}
                value={stats.health}
                onChange={(v) => updateStat('health', v)}
                color="text-red-500"
              />
              <StatSlider
                label="Hygiene"
                icon={<Droplets className="size-4" />}
                value={stats.hygiene}
                onChange={(v) => updateStat('hygiene', v)}
                color="text-blue-500"
              />
              <StatSlider
                label="Energy"
                icon={<Battery className="size-4" />}
                value={stats.energy}
                onChange={(v) => updateStat('energy', v)}
                color="text-yellow-500"
              />
            </div>
          </div>

          <Separator />

          {/* ─── Other Properties ─── */}
          <div className="space-y-4">
            <Label className="text-sm font-semibold">Other Properties</Label>

            <div className="grid grid-cols-2 gap-4">
              {/* Experience */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Experience (XP)</Label>
                <Input
                  type="number"
                  min={0}
                  value={experience}
                  onChange={(e) => setExperience(Math.max(0, parseInt(e.target.value) || 0))}
                  className="h-8"
                />
              </div>

              {/* Care Streak */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Care Streak (days)</Label>
                <Input
                  type="number"
                  min={0}
                  value={careStreak}
                  onChange={(e) => setCareStreak(Math.max(0, parseInt(e.target.value) || 0))}
                  className="h-8"
                />
              </div>

              {/* Generation */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Generation</Label>
                <Input
                  type="number"
                  min={1}
                  value={generation}
                  onChange={(e) => setGeneration(Math.max(1, parseInt(e.target.value) || 1))}
                  className="h-8"
                />
              </div>
            </div>

            {/* Boolean Flags */}
            <div className="flex flex-col gap-3 pt-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Breeding Ready</Label>
                <Switch
                  checked={breedingReady}
                  onCheckedChange={setBreedingReady}
                />
              </div>
             </div>
          </div>

          {/* ─── First-Hatch Tour Controls ─── */}
          {tourDevActions && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">First-Hatch Tour</Label>
                  <Badge variant="outline" className="text-xs">
                    {tourDevActions.isCompleted
                      ? 'Completed'
                      : tourDevActions.currentStepId
                        ? tourDevActions.currentStepId
                        : 'Not started'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Test the first-hatch tour flow without needing to create a real post.
                </p>
                <div className="flex flex-wrap gap-2">
                  {/* A. Skip Post Requirement */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      tourDevActions.skipPostRequirement();
                    }}
                    disabled={tourDevActions.currentStepId !== 'idle'}
                    className="gap-2 text-xs"
                    title="Skip to egg_glowing_waiting_click (skips idle)"
                  >
                    <SkipForward className="size-3.5" />
                    Skip Post
                  </Button>

                  {/* B. Restart First-Hatch Tour */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      tourDevActions.resetTour();
                    }}
                    className="gap-2 text-xs"
                    title="Reset the entire first-hatch tour state so it can be tested again"
                  >
                    <RefreshCw className="size-3.5" />
                    Restart Tour
                  </Button>

                  {/* C. Reset Blobbi to Egg */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setStage('egg');
                      setState('active');
                      tourDevActions.resetTour();
                    }}
                    disabled={companion.stage === 'egg'}
                    className="gap-2 text-xs"
                    title="Set stage to egg AND reset the tour — apply changes to test from scratch"
                  >
                    <Egg className="size-3.5" />
                    Reset to Egg + Tour
                  </Button>
                </div>
                {companion.stage !== 'egg' && stage === 'egg' && (
                  <p className="text-xs text-amber-500">
                    Stage will change to egg. Click "Apply Changes" to publish, then the tour will auto-start.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isUpdating}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={resetToCompanion}
            disabled={isUpdating || !hasChanges}
          >
            <RotateCcw className="size-4 mr-2" />
            Reset
          </Button>
          <Button
            onClick={handleApply}
            disabled={isUpdating || !hasChanges}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {isUpdating ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <Zap className="size-4 mr-2" />
                Apply Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
