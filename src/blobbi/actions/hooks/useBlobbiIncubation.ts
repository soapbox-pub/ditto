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
 * Parameters for start incubation hook.
 */
export interface UseStartIncubationParams {
  companion: BlobbiCompanion | null;
  profile: BlobbonautProfile | null;
  /** All companions in the collection (for checking/stopping other incubating Blobbis) */
  companions?: BlobbiCompanion[];
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
}

// ─── Start Incubation Hook ────────────────────────────────────────────────────

/**
 * Hook to start the incubation process for an egg.
 * 
 * This sets the Blobbi state to 'incubating' and records the start timestamp.
 * Tasks will be computed based on events created after this timestamp.
 * 
 * If another Blobbi in the collection is already incubating, this hook will
 * automatically stop their incubation first (only one can incubate at a time).
 * 
 * Requirements:
 * - Blobbi must be in egg stage
 * - User must be logged in
 */
export function useStartIncubation({
  companion,
  profile,
  companions = [],
  ensureCanonicalBeforeAction,
  updateCompanionEvent,
  invalidateCompanion,
  invalidateProfile,
}: UseStartIncubationParams) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { mutateAsync: publishEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async (): Promise<StartIncubationResult> => {
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

      // ─── Stop Other Incubating Blobbi (if any) ───
      // Only one Blobbi can incubate at a time
      const otherIncubating = companions.find(c => 
        c.d !== companion.d && 
        c.state === 'incubating' &&
        c.stage === 'egg'
      );
      
      if (otherIncubating) {
        // Fetch the current event for the other Blobbi
        const [otherEvent] = await nostr.query([{
          kinds: [KIND_BLOBBI_STATE],
          authors: [user.pubkey],
          '#d': [otherIncubating.d],
          limit: 1,
        }]);
        
        if (otherEvent) {
          // Stop the other Blobbi's incubation
          const now = Math.floor(Date.now() / 1000);
          const nowStr = now.toString();
          
          // Apply decay to the other Blobbi
          const otherDecayResult = applyBlobbiDecay({
            stage: otherIncubating.stage,
            state: otherIncubating.state,
            stats: otherIncubating.stats,
            lastDecayAt: otherIncubating.lastDecayAt,
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
      // Remove any existing task tags when starting fresh
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
      };
    },
    onSuccess: ({ name }) => {
      toast({
        title: 'Incubation started!',
        description: `${name} is now incubating. Complete the tasks to hatch!`,
      });
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

// ─── Update Task Progress Hook ────────────────────────────────────────────────

/**
 * Parameters for updating task progress.
 */
export interface UseUpdateTaskProgressParams {
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
 * Request to update task progress.
 */
export interface UpdateTaskProgressRequest {
  /** Task name (e.g., 'interactions') */
  taskName: string;
  /** New value for the task */
  value: number;
  /** Whether the task is completed */
  completed?: boolean;
}

/**
 * Hook to update task progress in the Blobbi event.
 * 
 * Note: This is used to sync computed task progress to the event tags.
 * The source of truth is always the computed progress from Nostr events.
 */
export function useUpdateTaskProgress({
  companion,
  ensureCanonicalBeforeAction,
  updateCompanionEvent,
  invalidateCompanion,
  invalidateProfile,
}: UseUpdateTaskProgressParams) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async ({ taskName, value, completed }: UpdateTaskProgressRequest) => {
      if (!user?.pubkey) {
        throw new Error('You must be logged in');
      }

      if (!companion) {
        throw new Error('No companion selected');
      }

      if (companion.state !== 'incubating' && companion.state !== 'evolving') {
        throw new Error('Blobbi is not in a task state');
      }

      const canonical = await ensureCanonicalBeforeAction();
      if (!canonical) {
        throw new Error('Failed to prepare companion');
      }

      // Build task tags
      const existingTaskTags = canonical.allTags.filter(tag => 
        tag[0] === 'task' || tag[0] === 'task_completed'
      );
      
      // Remove old entry for this task
      const filteredTaskTags = existingTaskTags.filter(tag => {
        if (tag[0] === 'task') {
          const [name] = tag[1]?.split(':') ?? [];
          return name !== taskName;
        }
        if (tag[0] === 'task_completed') {
          return tag[1] !== taskName;
        }
        return true;
      });
      
      // Add updated task tag
      const newTaskTags: string[][] = [...filteredTaskTags];
      newTaskTags.push(['task', `${taskName}:${value}`]);
      if (completed) {
        newTaskTags.push(['task_completed', taskName]);
      }
      
      // Build complete tags
      const baseTags = canonical.allTags.filter(tag => 
        tag[0] !== 'task' && tag[0] !== 'task_completed'
      );
      
      const now = Math.floor(Date.now() / 1000);
      const newTags = updateBlobbiTags([...baseTags, ...newTaskTags], {
        last_interaction: now.toString(),
      });

      const event = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content: canonical.content,
        tags: newTags,
      });

      updateCompanionEvent(event);
      invalidateCompanion();
      
      if (canonical.wasMigrated) {
        invalidateProfile();
      }

      return { taskName, value, completed };
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

// ─── Sync Hatch Task Completions Hook ─────────────────────────────────────────

/**
 * Parameters for syncing hatch task completions.
 */
export interface UseSyncHatchTaskCompletionsParams {
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
 * Task completions to sync (from useHatchTasks).
 */
export interface TaskCompletionToSync {
  taskId: string;
  completed: boolean;
}

/**
 * Hook to sync hatch task completions to kind 31124 tags.
 * 
 * This hook watches for newly completed tasks and syncs them to the Blobbi state
 * event as `task_completed` tags. This is a cache sync operation - the source of
 * truth is always the computed task state from Nostr events.
 * 
 * Usage:
 * 1. Call this hook in a component that has access to hatch tasks
 * 2. Call syncCompletions(tasks) whenever tasks change
 * 3. The hook will publish updated events for any newly completed tasks
 */
export function useSyncHatchTaskCompletions({
  companion,
  ensureCanonicalBeforeAction,
  updateCompanionEvent,
  invalidateCompanion,
  invalidateProfile,
}: UseSyncHatchTaskCompletionsParams) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async (tasksToSync: TaskCompletionToSync[]) => {
      if (!user?.pubkey) {
        throw new Error('You must be logged in');
      }

      if (!companion) {
        throw new Error('No companion selected');
      }

      if (companion.state !== 'incubating') {
        // Only sync during incubation
        return { synced: [] };
      }

      // Get current cached completions from companion
      const cachedCompletions = new Set(companion.tasksCompleted);

      // Find tasks that are completed but not cached
      const newlyCompleted = tasksToSync.filter(t => 
        t.completed && !cachedCompletions.has(t.taskId)
      );

      if (newlyCompleted.length === 0) {
        // Nothing to sync
        return { synced: [] };
      }

      // Ensure canonical before action
      const canonical = await ensureCanonicalBeforeAction();
      if (!canonical) {
        throw new Error('Failed to prepare companion');
      }

      // Add task_completed tags for newly completed tasks
      let updatedTags = [...canonical.allTags];
      
      for (const task of newlyCompleted) {
        // Check if already has this completion tag (avoid duplicates)
        const hasTag = updatedTags.some(tag => 
          tag[0] === 'task_completed' && tag[1] === task.taskId
        );
        
        if (!hasTag) {
          updatedTags = [...updatedTags, ['task_completed', task.taskId]];
        }
      }

      // Update last_interaction timestamp
      const now = Math.floor(Date.now() / 1000);
      updatedTags = updateBlobbiTags(updatedTags, {
        last_interaction: now.toString(),
      });

      // Publish updated event
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

      return { synced: newlyCompleted.map(t => t.taskId) };
    },
  });
}
