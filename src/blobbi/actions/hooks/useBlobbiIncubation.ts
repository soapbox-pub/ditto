// src/blobbi/actions/hooks/useBlobbiIncubation.ts

/**
 * Hooks for Blobbi incubation task system.
 * 
 * When a user starts incubation:
 * 1. Apply accumulated decay from last_decay_at to now
 * 2. Set state to 'incubating'
 * 3. Add state_started_at timestamp
 * 4. Update last_decay_at to the same timestamp
 * 5. Clear any previous task progress
 * 
 * Tasks are computed from Nostr events with created_at >= state_started_at
 */

import { useMutation } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';

import type { BlobbiCompanion, BlobbonautProfile } from '@/lib/blobbi';
import {
  KIND_BLOBBI_STATE,
  updateBlobbiTags,
} from '@/lib/blobbi';
import { applyBlobbiDecay } from '@/lib/blobbi-decay';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Mode for starting incubation.
 * This makes the intent explicit rather than auto-detecting behavior.
 */
export type StartIncubationMode = 
  | 'start'              // Normal start (no other Blobbi incubating)
  | 'restart'            // Restart same Blobbi (already incubating)
  | 'switch';            // Switch from another incubating Blobbi

/**
 * Request to start incubation with explicit mode.
 */
export interface StartIncubationRequest {
  /** Explicit mode for this operation */
  mode: StartIncubationMode;
  /** The d-tag of the other Blobbi to stop (required when mode === 'switch') */
  stopOtherD?: string;
}

/**
 * Parameters for start incubation hook.
 */
export interface UseStartIncubationParams {
  companion: BlobbiCompanion | null;
  profile: BlobbonautProfile | null;
  /** Called to ensure companion is canonical (from migration helper) */
  ensureCanonicalBeforeAction: () => Promise<{
    companion: BlobbiCompanion;
    content: string;
    allTags: string[][];
    wasMigrated: boolean;
    profileAllTags: string[][];
    profileStorage: import('@/lib/blobbi').StorageItem[];
  } | null>;
  /** Update companion event in local cache */
  updateCompanionEvent: (event: NostrEvent) => void;
  /** Invalidate companion queries */
  invalidateCompanion: () => void;
  /** Invalidate profile queries (needed if migration occurred) */
  invalidateProfile: () => void;
}

/**
 * Result of starting incubation.
 */
export interface StartIncubationResult {
  /** The Blobbi's name */
  name: string;
  /** Timestamp when incubation started */
  stateStartedAt: number;
  /** Mode that was used */
  mode: StartIncubationMode;
  /** Name of other Blobbi that was stopped (if mode === 'switch') */
  stoppedOtherName?: string;
}

// ─── Start Incubation Hook ────────────────────────────────────────────────────

/**
 * Hook to start the incubation process for an egg.
 * 
 * This sets the Blobbi state to 'incubating' and records the start timestamp.
 * Tasks will be computed based on events created after this timestamp.
 * 
 * IMPORTANT: The mode must be explicitly specified by the caller (UI).
 * This hook does NOT auto-detect whether to switch or restart.
 * The UI dialog determines the mode and passes it explicitly.
 * 
 * Modes:
 * - 'start': Normal start, no other Blobbi incubating
 * - 'restart': Restart same Blobbi (already incubating), resets task progress
 * - 'switch': Stop another Blobbi first, then start this one
 * 
 * Requirements:
 * - Blobbi must be in egg stage
 * - User must be logged in
 */
export function useStartIncubation({
  companion,
  profile,
  ensureCanonicalBeforeAction,
  updateCompanionEvent,
  invalidateCompanion,
  invalidateProfile,
}: UseStartIncubationParams) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { mutateAsync: publishEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async (request: StartIncubationRequest): Promise<StartIncubationResult> => {
      const { mode, stopOtherD } = request;
      
      // ─── Validation ───
      if (!user?.pubkey) {
        throw new Error('You must be logged in to start incubation');
      }

      if (!companion) {
        throw new Error('No companion selected');
      }

      if (!profile) {
        throw new Error('Profile not found');
      }

      if (companion.stage !== 'egg') {
        throw new Error('Only eggs can be incubated');
      }

      // Validate switch mode requires stopOtherD
      if (mode === 'switch' && !stopOtherD) {
        throw new Error('Switch mode requires stopOtherD parameter');
      }

      let stoppedOtherName: string | undefined;

      // ─── Stop Other Incubating Blobbi (switch mode only) ───
      if (mode === 'switch' && stopOtherD) {
        // Fetch the current event for the other Blobbi
        const [otherEvent] = await nostr.query([{
          kinds: [KIND_BLOBBI_STATE],
          authors: [user.pubkey],
          '#d': [stopOtherD],
          limit: 1,
        }]);
        
        if (otherEvent) {
          // Get name from the event for the result
          const nameTag = otherEvent.tags.find(t => t[0] === 'name');
          stoppedOtherName = nameTag?.[1] ?? stopOtherD;
          
          // Stop the other Blobbi's incubation
          const now = Math.floor(Date.now() / 1000);
          const nowStr = now.toString();
          
          // Parse stats from the event
          const getTagValue = (tags: string[][], name: string): number => 
            parseInt(tags.find(t => t[0] === name)?.[1] ?? '50', 10);
          
          const otherStats = {
            hunger: getTagValue(otherEvent.tags, 'hunger'),
            happiness: getTagValue(otherEvent.tags, 'happiness'),
            health: getTagValue(otherEvent.tags, 'health'),
            hygiene: getTagValue(otherEvent.tags, 'hygiene'),
            energy: getTagValue(otherEvent.tags, 'energy'),
          };
          const otherLastDecayAt = getTagValue(otherEvent.tags, 'last_decay_at') || now;
          
          // Apply decay to the other Blobbi
          const otherDecayResult = applyBlobbiDecay({
            stage: 'egg',
            state: 'incubating',
            stats: otherStats,
            lastDecayAt: otherLastDecayAt,
            now,
          });
          
          // Remove task tags and state_started_at from the other Blobbi
          const otherCleanedTags = otherEvent.tags.filter(tag => 
            tag[0] !== 'task' && 
            tag[0] !== 'task_completed' && 
            tag[0] !== 'state_started_at'
          );
          
          const otherNewTags = updateBlobbiTags(otherCleanedTags, {
            health: otherDecayResult.stats.health.toString(),
            hygiene: otherDecayResult.stats.hygiene.toString(),
            happiness: otherDecayResult.stats.happiness.toString(),
            hunger: '100',
            energy: '100',
            state: 'active',
            last_interaction: nowStr,
            last_decay_at: nowStr,
          });
          
          // Publish the stop event for the other Blobbi
          const stopEvent = await publishEvent({
            kind: KIND_BLOBBI_STATE,
            content: otherEvent.content,
            tags: otherNewTags,
          });
          
          // Update the cache for the stopped Blobbi
          updateCompanionEvent(stopEvent);
        }
      }

      // ─── Ensure Canonical Before Action ───
      const canonical = await ensureCanonicalBeforeAction();
      if (!canonical) {
        throw new Error('Failed to prepare companion for incubation');
      }

      // ─── Apply Accumulated Decay ───
      // CRITICAL: Apply decay from last_decay_at to now before changing state
      const now = Math.floor(Date.now() / 1000);
      const nowStr = now.toString();
      
      const decayResult = applyBlobbiDecay({
        stage: canonical.companion.stage,
        state: canonical.companion.state,
        stats: canonical.companion.stats,
        lastDecayAt: canonical.companion.lastDecayAt,
        now,
      });
      
      // ─── Build Updated Tags ───
      // Remove any existing task tags when starting fresh (for all modes)
      const cleanedTags = canonical.allTags.filter(tag => 
        tag[0] !== 'task' && tag[0] !== 'task_completed'
      );
      
      // Build stats update with decayed values
      // Eggs have fixed hunger and energy at 100
      const statsUpdate: Record<string, string> = {
        health: decayResult.stats.health.toString(),
        hygiene: decayResult.stats.hygiene.toString(),
        happiness: decayResult.stats.happiness.toString(),
        hunger: '100',
        energy: '100',
      };
      
      const newTags = updateBlobbiTags(cleanedTags, {
        ...statsUpdate,
        state: 'incubating',
        state_started_at: nowStr,
        last_interaction: nowStr,
        last_decay_at: nowStr,
      });

      // ─── Publish Event ───
      const event = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content: canonical.content,
        tags: newTags,
      });

      updateCompanionEvent(event);
      invalidateCompanion();
      
      // Invalidate profile if migration occurred
      if (canonical.wasMigrated) {
        invalidateProfile();
      }

      return {
        name: canonical.companion.name,
        stateStartedAt: now,
        mode,
        stoppedOtherName,
      };
    },
    onSuccess: ({ name, mode, stoppedOtherName }) => {
      if (mode === 'switch' && stoppedOtherName) {
        toast({
          title: 'Switched incubation!',
          description: `Stopped ${stoppedOtherName}, now incubating ${name}.`,
        });
      } else if (mode === 'restart') {
        toast({
          title: 'Incubation restarted!',
          description: `${name}'s task progress has been reset.`,
        });
      } else {
        toast({
          title: 'Incubation started!',
          description: `${name} is now incubating. Complete the tasks to hatch!`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to start incubation',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// ─── Stop Incubation Hook ─────────────────────────────────────────────────────

/**
 * Parameters for stop incubation hook.
 */
export interface UseStopIncubationParams {
  companion: BlobbiCompanion | null;
  /** Called to ensure companion is canonical (from migration helper) */
  ensureCanonicalBeforeAction: () => Promise<{
    companion: BlobbiCompanion;
    content: string;
    allTags: string[][];
    wasMigrated: boolean;
    profileAllTags: string[][];
    profileStorage: import('@/lib/blobbi').StorageItem[];
  } | null>;
  /** Update companion event in local cache */
  updateCompanionEvent: (event: NostrEvent) => void;
  /** Invalidate companion queries */
  invalidateCompanion: () => void;
  /** Invalidate profile queries (needed if migration occurred) */
  invalidateProfile: () => void;
}

/**
 * Result of stopping incubation.
 */
export interface StopIncubationResult {
  /** The Blobbi's name */
  name: string;
}

/**
 * Hook to stop/cancel the incubation process for a Blobbi.
 * 
 * This resets the Blobbi state to 'active' and clears all task progress tags.
 * The user can restart incubation later, but will need to complete tasks again.
 * 
 * When stopping incubation:
 * - Apply accumulated decay first
 * - Set state back to 'active'
 * - Remove state_started_at tag
 * - Remove all task and task_completed tags
 * 
 * Requirements:
 * - Blobbi must be in incubating state
 * - User must be logged in
 */
export function useStopIncubation({
  companion,
  ensureCanonicalBeforeAction,
  updateCompanionEvent,
  invalidateCompanion,
  invalidateProfile,
}: UseStopIncubationParams) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async (): Promise<StopIncubationResult> => {
      // ─── Validation ───
      if (!user?.pubkey) {
        throw new Error('You must be logged in to stop incubation');
      }

      if (!companion) {
        throw new Error('No companion selected');
      }

      if (companion.state !== 'incubating') {
        throw new Error('This Blobbi is not incubating');
      }

      // ─── Ensure Canonical Before Action ───
      const canonical = await ensureCanonicalBeforeAction();
      if (!canonical) {
        throw new Error('Failed to prepare companion');
      }

      // ─── Apply Accumulated Decay ───
      const now = Math.floor(Date.now() / 1000);
      const nowStr = now.toString();
      
      const decayResult = applyBlobbiDecay({
        stage: canonical.companion.stage,
        state: canonical.companion.state,
        stats: canonical.companion.stats,
        lastDecayAt: canonical.companion.lastDecayAt,
        now,
      });
      
      // ─── Build Updated Tags ───
      // Remove task tags and state_started_at
      const cleanedTags = canonical.allTags.filter(tag => 
        tag[0] !== 'task' && 
        tag[0] !== 'task_completed' && 
        tag[0] !== 'state_started_at'
      );
      
      // Build stats update with decayed values
      // Eggs have fixed hunger and energy at 100
      const statsUpdate: Record<string, string> = {
        health: decayResult.stats.health.toString(),
        hygiene: decayResult.stats.hygiene.toString(),
        happiness: decayResult.stats.happiness.toString(),
        hunger: '100',
        energy: '100',
      };
      
      const newTags = updateBlobbiTags(cleanedTags, {
        ...statsUpdate,
        state: 'active',
        last_interaction: nowStr,
        last_decay_at: nowStr,
      });

      // ─── Publish Event ───
      const event = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content: canonical.content,
        tags: newTags,
      });

      updateCompanionEvent(event);
      invalidateCompanion();
      
      // Invalidate profile if migration occurred
      if (canonical.wasMigrated) {
        invalidateProfile();
      }

      return {
        name: canonical.companion.name,
      };
    },
    onSuccess: ({ name }) => {
      toast({
        title: 'Incubation stopped',
        description: `${name} is no longer incubating. Task progress has been reset.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to stop incubation',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// ─── Start Evolution Hook ─────────────────────────────────────────────────────

/**
 * Parameters for start evolution hook.
 */
export interface UseStartEvolutionParams {
  companion: BlobbiCompanion | null;
  /** Called to ensure companion is canonical (from migration helper) */
  ensureCanonicalBeforeAction: () => Promise<{
    companion: BlobbiCompanion;
    content: string;
    allTags: string[][];
    wasMigrated: boolean;
    profileAllTags: string[][];
    profileStorage: import('@/lib/blobbi').StorageItem[];
  } | null>;
  /** Update companion event in local cache */
  updateCompanionEvent: (event: NostrEvent) => void;
  /** Invalidate companion queries */
  invalidateCompanion: () => void;
  /** Invalidate profile queries (needed if migration occurred) */
  invalidateProfile: () => void;
}

/**
 * Result of starting evolution.
 */
export interface StartEvolutionResult {
  /** The Blobbi's name */
  name: string;
  /** Timestamp when evolution started */
  stateStartedAt: number;
}

/**
 * Hook to start the evolution process for a baby Blobbi.
 * 
 * This sets the Blobbi state to 'evolving' and records the start timestamp.
 * Tasks will be computed based on events created after this timestamp.
 * 
 * Requirements:
 * - Blobbi must be in baby stage
 * - Blobbi must not already be evolving
 * - User must be logged in
 */
export function useStartEvolution({
  companion,
  ensureCanonicalBeforeAction,
  updateCompanionEvent,
  invalidateCompanion,
  invalidateProfile,
}: UseStartEvolutionParams) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async (): Promise<StartEvolutionResult> => {
      // ─── Validation ───
      if (!user?.pubkey) {
        throw new Error('You must be logged in to start evolution');
      }

      if (!companion) {
        throw new Error('No companion selected');
      }

      if (companion.stage !== 'baby') {
        throw new Error('Only baby Blobbis can evolve');
      }

      if (companion.state === 'evolving') {
        throw new Error('This Blobbi is already evolving');
      }

      // ─── Ensure Canonical Before Action ───
      const canonical = await ensureCanonicalBeforeAction();
      if (!canonical) {
        throw new Error('Failed to prepare companion for evolution');
      }

      // ─── Apply Accumulated Decay ───
      const now = Math.floor(Date.now() / 1000);
      const nowStr = now.toString();
      
      const decayResult = applyBlobbiDecay({
        stage: canonical.companion.stage,
        state: canonical.companion.state,
        stats: canonical.companion.stats,
        lastDecayAt: canonical.companion.lastDecayAt,
        now,
      });
      
      // ─── Build Updated Tags ───
      // Remove any existing task tags when starting fresh
      const cleanedTags = canonical.allTags.filter(tag => 
        tag[0] !== 'task' && tag[0] !== 'task_completed'
      );
      
      // Build stats update with decayed values
      const statsUpdate: Record<string, string> = {
        health: decayResult.stats.health.toString(),
        hygiene: decayResult.stats.hygiene.toString(),
        happiness: decayResult.stats.happiness.toString(),
        hunger: decayResult.stats.hunger.toString(),
        energy: decayResult.stats.energy.toString(),
      };
      
      const newTags = updateBlobbiTags(cleanedTags, {
        ...statsUpdate,
        state: 'evolving',
        state_started_at: nowStr,
        last_interaction: nowStr,
        last_decay_at: nowStr,
      });

      // ─── Publish Event ───
      const event = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content: canonical.content,
        tags: newTags,
      });

      updateCompanionEvent(event);
      invalidateCompanion();
      
      // Invalidate profile if migration occurred
      if (canonical.wasMigrated) {
        invalidateProfile();
      }

      return {
        name: canonical.companion.name,
        stateStartedAt: now,
      };
    },
    onSuccess: ({ name }) => {
      toast({
        title: 'Evolution started!',
        description: `${name} is now working towards evolution. Complete the tasks to evolve!`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to start evolution',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// ─── Stop Evolution Hook ──────────────────────────────────────────────────────

/**
 * Parameters for stop evolution hook.
 */
export interface UseStopEvolutionParams {
  companion: BlobbiCompanion | null;
  /** Called to ensure companion is canonical (from migration helper) */
  ensureCanonicalBeforeAction: () => Promise<{
    companion: BlobbiCompanion;
    content: string;
    allTags: string[][];
    wasMigrated: boolean;
    profileAllTags: string[][];
    profileStorage: import('@/lib/blobbi').StorageItem[];
  } | null>;
  /** Update companion event in local cache */
  updateCompanionEvent: (event: NostrEvent) => void;
  /** Invalidate companion queries */
  invalidateCompanion: () => void;
  /** Invalidate profile queries (needed if migration occurred) */
  invalidateProfile: () => void;
}

/**
 * Result of stopping evolution.
 */
export interface StopEvolutionResult {
  /** The Blobbi's name */
  name: string;
}

/**
 * Hook to stop/cancel the evolution process for a Blobbi.
 * 
 * This resets the Blobbi state to 'active' and clears all task progress tags.
 * The user can restart evolution later, but will need to complete tasks again.
 * 
 * When stopping evolution:
 * - Apply accumulated decay first
 * - Set state back to 'active'
 * - Remove state_started_at tag
 * - Remove all task and task_completed tags
 * 
 * Requirements:
 * - Blobbi must be in evolving state
 * - User must be logged in
 */
export function useStopEvolution({
  companion,
  ensureCanonicalBeforeAction,
  updateCompanionEvent,
  invalidateCompanion,
  invalidateProfile,
}: UseStopEvolutionParams) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async (): Promise<StopEvolutionResult> => {
      // ─── Validation ───
      if (!user?.pubkey) {
        throw new Error('You must be logged in to stop evolution');
      }

      if (!companion) {
        throw new Error('No companion selected');
      }

      if (companion.state !== 'evolving') {
        throw new Error('This Blobbi is not evolving');
      }

      // ─── Ensure Canonical Before Action ───
      const canonical = await ensureCanonicalBeforeAction();
      if (!canonical) {
        throw new Error('Failed to prepare companion');
      }

      // ─── Apply Accumulated Decay ───
      const now = Math.floor(Date.now() / 1000);
      const nowStr = now.toString();
      
      const decayResult = applyBlobbiDecay({
        stage: canonical.companion.stage,
        state: canonical.companion.state,
        stats: canonical.companion.stats,
        lastDecayAt: canonical.companion.lastDecayAt,
        now,
      });
      
      // ─── Build Updated Tags ───
      // Remove task tags and state_started_at
      const cleanedTags = canonical.allTags.filter(tag => 
        tag[0] !== 'task' && 
        tag[0] !== 'task_completed' && 
        tag[0] !== 'state_started_at'
      );
      
      // Build stats update with decayed values
      const statsUpdate: Record<string, string> = {
        health: decayResult.stats.health.toString(),
        hygiene: decayResult.stats.hygiene.toString(),
        happiness: decayResult.stats.happiness.toString(),
        hunger: decayResult.stats.hunger.toString(),
        energy: decayResult.stats.energy.toString(),
      };
      
      const newTags = updateBlobbiTags(cleanedTags, {
        ...statsUpdate,
        state: 'active',
        last_interaction: nowStr,
        last_decay_at: nowStr,
      });

      // ─── Publish Event ───
      const event = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content: canonical.content,
        tags: newTags,
      });

      updateCompanionEvent(event);
      invalidateCompanion();
      
      // Invalidate profile if migration occurred
      if (canonical.wasMigrated) {
        invalidateProfile();
      }

      return {
        name: canonical.companion.name,
      };
    },
    onSuccess: ({ name }) => {
      toast({
        title: 'Evolution stopped',
        description: `${name} is no longer evolving. Task progress has been reset.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to stop evolution',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// ─── Sync Task Completions Hook ───────────────────────────────────────────────

/** Enable debug logging in development only */
const DEBUG_TASK_SYNC = import.meta.env.DEV;

/**
 * Parameters for syncing task completions (works for both hatch and evolve).
 */
export interface UseSyncTaskCompletionsParams {
  companion: BlobbiCompanion | null;
  /** Called to ensure companion is canonical */
  ensureCanonicalBeforeAction: () => Promise<{
    companion: BlobbiCompanion;
    content: string;
    allTags: string[][];
    wasMigrated: boolean;
    profileAllTags: string[][];
    profileStorage: import('@/lib/blobbi').StorageItem[];
  } | null>;
  /** Update companion event in local cache */
  updateCompanionEvent: (event: NostrEvent) => void;
  /** Invalidate companion queries */
  invalidateCompanion: () => void;
  /** Invalidate profile queries */
  invalidateProfile: () => void;
}

/**
 * Task completions to sync (from useHatchTasks or useEvolveTasks).
 */
export interface TaskCompletionToSync {
  taskId: string;
  completed: boolean;
}

/**
 * Result of sync operation.
 */
export interface SyncTaskCompletionsResult {
  /** Task IDs that were synced (empty if nothing needed) */
  synced: string[];
  /** Whether sync was skipped (no diff) */
  skipped: boolean;
  /** Reason for skip (for debugging) */
  skipReason?: string;
}

/**
 * Hook to sync persistent task completions to kind 31124 tags.
 * Works for both hatch (incubating) and evolve (evolving) processes.
 * 
 * CRITICAL: This is a cache-only sync. It must be:
 * 1. Fully idempotent - calling multiple times with same data = no-op
 * 2. Diff-based - only publish when tags would actually change
 * 3. Safe - no last_interaction update (this is cache sync, not user action)
 * 4. Only sync PERSISTENT tasks - dynamic tasks must NEVER be synced
 * 
 * Source of truth = computed task state from Nostr events.
 * Tags = cache layer for faster access.
 */
export function useSyncTaskCompletions({
  companion,
  ensureCanonicalBeforeAction,
  updateCompanionEvent,
  invalidateCompanion,
  invalidateProfile,
}: UseSyncTaskCompletionsParams) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async (tasksToSync: TaskCompletionToSync[]): Promise<SyncTaskCompletionsResult> => {
      // ─── Early Guards ───
      if (!user?.pubkey) {
        return { synced: [], skipped: true, skipReason: 'no_user' };
      }

      if (!companion) {
        return { synced: [], skipped: true, skipReason: 'no_companion' };
      }

      // Must be in an active task process (incubating or evolving)
      if (companion.state !== 'incubating' && companion.state !== 'evolving') {
        return { synced: [], skipped: true, skipReason: 'not_in_task_process' };
      }

      // ─── Compute Diff ───
      // Get cached completions from companion.tasksCompleted (parsed from tags)
      const cachedCompletions = new Set(companion.tasksCompleted);
      
      // Get computed completions from tasks (works for both hatch and evolve)
      const computedCompletions = tasksToSync
        .filter(t => t.completed)
        .map(t => t.taskId);
      
      // Find tasks that are computed as complete but NOT in cache
      const missingFromCache = computedCompletions.filter(id => !cachedCompletions.has(id));

      if (DEBUG_TASK_SYNC) {
        console.log('[TaskSync] Diff check:', {
          cachedCompletions: Array.from(cachedCompletions),
          computedCompletions,
          missingFromCache,
        });
      }

      // If no diff, skip entirely
      if (missingFromCache.length === 0) {
        if (DEBUG_TASK_SYNC) {
          console.log('[TaskSync] Skipped: no diff between computed and cached');
        }
        return { synced: [], skipped: true, skipReason: 'no_diff' };
      }

      // ─── Ensure Canonical ───
      const canonical = await ensureCanonicalBeforeAction();
      if (!canonical) {
        return { synced: [], skipped: true, skipReason: 'canonical_failed' };
      }

      // ─── Build Updated Tags ───
      // Re-check against canonical.allTags (may have updated since companion was parsed)
      const existingCompletionTags = new Set(
        canonical.allTags
          .filter(tag => tag[0] === 'task_completed')
          .map(tag => tag[1])
      );

      // Filter to only truly missing tags
      const tagsToAdd = missingFromCache.filter(id => !existingCompletionTags.has(id));

      if (tagsToAdd.length === 0) {
        if (DEBUG_TASK_SYNC) {
          console.log('[TaskSync] Skipped: all tags already exist in canonical');
        }
        return { synced: [], skipped: true, skipReason: 'tags_already_exist' };
      }

      // Add only the missing task_completed tags
      // CRITICAL: Do NOT update last_interaction - this is cache sync, not user action
      const updatedTags = [
        ...canonical.allTags,
        ...tagsToAdd.map(id => ['task_completed', id]),
      ];

      if (DEBUG_TASK_SYNC) {
        console.log('[TaskSync] Publishing:', {
          tagsToAdd,
          totalTags: updatedTags.length,
        });
      }

      // ─── Publish ───
      const event = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content: canonical.content,
        tags: updatedTags,
      });

      updateCompanionEvent(event);
      invalidateCompanion();

      if (canonical.wasMigrated) {
        invalidateProfile();
      }

      if (DEBUG_TASK_SYNC) {
        console.log('[TaskSync] Published successfully:', tagsToAdd);
      }

      return { synced: tagsToAdd, skipped: false };
    },
  });
}
