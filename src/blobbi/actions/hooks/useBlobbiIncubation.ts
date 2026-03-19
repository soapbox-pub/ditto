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
