// src/blobbi/actions/hooks/useEvolveTasks.ts

/**
 * Hook to compute evolve task progress from Nostr events and current stats.
 * 
 * CRITICAL ARCHITECTURE:
 * - PERSISTENT TASKS: Based on Nostr events, can be cached in tags
 * - DYNAMIC TASKS: Based on current stats, NEVER stored in tags
 * 
 * Tags are only cache for persistent tasks. Source of truth = Nostr events.
 */

import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { BlobbiCompanion } from '@/lib/blobbi';

import {
  KIND_THEME_DEFINITION,
  KIND_COLOR_MOMENT,
  KIND_PROFILE_METADATA,
  KIND_SHORT_TEXT_NOTE,
  BLOBBI_POST_REQUIRED_HASHTAGS,
  sanitizeToHashtag,
  type HatchTask,
  type TaskType,
} from './useHatchTasks';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Kind for wall edit events */
export const KIND_WALL_EDIT = 16769;

/** Required themes for evolve task */
export const EVOLVE_REQUIRED_THEMES = 3;

/** Required color moments for evolve task */
export const EVOLVE_REQUIRED_COLOR_MOMENTS = 3;

/** Required posts for evolve task (lighter than hatch - just 1 evolve-specific post) */
export const EVOLVE_REQUIRED_POSTS = 1;

/** Required interactions for evolve task */
export const EVOLVE_REQUIRED_INTERACTIONS = 21;

/** Prefix text for Blobbi evolve post */
export const BLOBBI_EVOLVE_POST_PREFIX = 'Hello Nostr! Posting to evolve';

/** Stat threshold for evolve dynamic task (all stats >= 80) */
export const EVOLVE_STAT_THRESHOLD = 80;

// ─── Types ────────────────────────────────────────────────────────────────────

// Re-export task types for convenience
export type { HatchTask as EvolveTask, TaskType };

/**
 * Result of computing evolve tasks.
 */
export interface EvolveTasksResult {
  tasks: HatchTask[];
  /** All persistent tasks are complete */
  persistentTasksComplete: boolean;
  /** Dynamic stat task is complete */
  dynamicTaskComplete: boolean;
  /** All tasks (persistent + dynamic) are complete - required to evolve */
  allCompleted: boolean;
  isLoading: boolean;
  error: Error | null;
  /** Refetch task progress */
  refetch: () => void;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Extract the 'shape' property from kind 0 metadata content.
 */
function extractShapeFromMetadata(event: NostrEvent): string | undefined {
  try {
    const content = JSON.parse(event.content);
    return content.shape;
  } catch {
    return undefined;
  }
}

/**
 * Check if a shape is a Blobbi shape (starts with "blobbi:").
 */
function isBlobbiShape(shape: string | undefined): boolean {
  if (!shape || typeof shape !== 'string') return false;
  return shape.startsWith('blobbi:');
}

/**
 * Check if a post is a valid Blobbi evolve post.
 * Must contain the evolve prefix and all required hashtags including the Blobbi name.
 * 
 * @param event - The Nostr event to validate
 * @param blobbiName - The Blobbi's name (will be sanitized and checked as hashtag)
 */
export function isValidEvolvePost(event: NostrEvent, blobbiName: string): boolean {
  // Check content starts with evolve prefix
  if (!event.content.startsWith(BLOBBI_EVOLVE_POST_PREFIX)) {
    return false;
  }
  
  // Check for required hashtags in tags
  const hashtags = event.tags
    .filter(tag => tag[0] === 't')
    .map(tag => tag[1]?.toLowerCase());
  
  // All required hashtags must be present
  const hasRequiredHashtags = BLOBBI_POST_REQUIRED_HASHTAGS.every(required => 
    hashtags.includes(required.toLowerCase())
  );
  
  if (!hasRequiredHashtags) {
    return false;
  }
  
  // Blobbi name hashtag must also be present
  const blobbiHashtag = sanitizeToHashtag(blobbiName);
  return hashtags.includes(blobbiHashtag);
}

// ─── Main Hook ────────────────────────────────────────────────────────────────

/**
 * Hook to compute evolve task progress from Nostr events and current stats.
 * 
 * PERSISTENT TASKS (event-based, can be cached):
 * 1. Create 3 Themes (kind 36767)
 * 2. Create 3 Color Moments (kind 3367)
 * 3. Create 1 Evolve Post (kind 1) - lighter than hatch, evolve-specific
 * 4. Interact 21 times (tracked via companion.tasks cache)
 * 5. Use Blobbi Shape (kind 0) - shape starts with "blobbi:"
 * 6. Edit Wall once (kind 16769)
 * 
 * DYNAMIC TASK (stat-based, NEVER cached):
 * 7. Maintain All Stats >= 80
 * 
 * @param companion - The Blobbi companion (must be in evolving state)
 * @param interactionCount - Current interaction count from companion tasks cache
 */
export function useEvolveTasks(
  companion: BlobbiCompanion | null,
  interactionCount?: number
): EvolveTasksResult {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  
  const pubkey = user?.pubkey;
  const stateStartedAt = companion?.stateStartedAt;
  const isEvolving = companion?.state === 'evolving';
  
  // Query for all relevant events
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['evolve-tasks', pubkey, stateStartedAt],
    queryFn: async () => {
      if (!pubkey || !stateStartedAt) {
        return null;
      }
      
      // Build filters for events we need
      const filters: NostrFilter[] = [
        // Theme definitions after start
        {
          kinds: [KIND_THEME_DEFINITION],
          authors: [pubkey],
          since: stateStartedAt,
        },
        // Color moments after start
        {
          kinds: [KIND_COLOR_MOMENT],
          authors: [pubkey],
          since: stateStartedAt,
        },
        // Posts after start (will filter for valid evolve posts)
        {
          kinds: [KIND_SHORT_TEXT_NOTE],
          authors: [pubkey],
          since: stateStartedAt,
          limit: 50, // Only need 1 valid evolve post
        },
        // Wall edits after start
        {
          kinds: [KIND_WALL_EDIT],
          authors: [pubkey],
          since: stateStartedAt,
          limit: 1, // Only need 1
        },
        // Profile metadata after start (for Blobbi shape check)
        {
          kinds: [KIND_PROFILE_METADATA],
          authors: [pubkey],
          since: stateStartedAt,
          limit: 1,
        },
      ];
      
      // Execute all queries
      const events = await nostr.query(filters);
      
      // Categorize events
      const themeEvents = events.filter(e => 
        e.kind === KIND_THEME_DEFINITION && e.created_at >= stateStartedAt
      );
      
      const colorMomentEvents = events.filter(e => 
        e.kind === KIND_COLOR_MOMENT && e.created_at >= stateStartedAt
      );
      
      const postEvents = events.filter(e => 
        e.kind === KIND_SHORT_TEXT_NOTE && e.created_at >= stateStartedAt
      );
      
      const wallEditEvents = events.filter(e => 
        e.kind === KIND_WALL_EDIT && e.created_at >= stateStartedAt
      );
      
      // Get latest profile after start
      const profileEvents = events.filter(e => e.kind === KIND_PROFILE_METADATA);
      const profileAfter = profileEvents
        .filter(e => e.created_at >= stateStartedAt)
        .sort((a, b) => b.created_at - a.created_at)[0];
      
      return {
        themeEvents,
        colorMomentEvents,
        postEvents,
        wallEditEvents,
        profileAfter,
      };
    },
    enabled: !!pubkey && !!stateStartedAt && isEvolving,
    staleTime: 30_000, // 30 seconds
    refetchInterval: 60_000, // Refetch every minute
  });
  
  // ─── Compute PERSISTENT Tasks ───
  const tasks: HatchTask[] = [];
  
  // 1. Create 3 Themes (PERSISTENT)
  const themeCount = data?.themeEvents?.length ?? 0;
  const themesCompleted = themeCount >= EVOLVE_REQUIRED_THEMES;
  tasks.push({
    id: 'create_themes',
    name: 'Create Themes',
    description: `Create ${EVOLVE_REQUIRED_THEMES} custom themes`,
    current: Math.min(themeCount, EVOLVE_REQUIRED_THEMES),
    required: EVOLVE_REQUIRED_THEMES,
    completed: themesCompleted,
    type: 'persistent',
    action: 'navigate',
    actionTarget: '/themes',
    actionLabel: 'Create Theme',
  });
  
  // 2. Create 3 Color Moments (PERSISTENT)
  const colorMomentCount = data?.colorMomentEvents?.length ?? 0;
  const colorMomentsCompleted = colorMomentCount >= EVOLVE_REQUIRED_COLOR_MOMENTS;
  tasks.push({
    id: 'color_moments',
    name: 'Color Moments',
    description: `Share ${EVOLVE_REQUIRED_COLOR_MOMENTS} color moments on espy`,
    current: Math.min(colorMomentCount, EVOLVE_REQUIRED_COLOR_MOMENTS),
    required: EVOLVE_REQUIRED_COLOR_MOMENTS,
    completed: colorMomentsCompleted,
    type: 'persistent',
    action: 'external_link',
    actionTarget: 'https://espy.social/',
    actionLabel: 'Open espy',
  });
  
  // 3. Create 1 Evolve Post (PERSISTENT) - lighter than hatch
  const blobbiName = companion?.name ?? '';
  const validPosts = data?.postEvents?.filter(e => isValidEvolvePost(e, blobbiName)) ?? [];
  const postCount = validPosts.length;
  const postsCompleted = postCount >= EVOLVE_REQUIRED_POSTS;
  tasks.push({
    id: 'create_posts',
    name: 'Share Evolution',
    description: 'Post about your Blobbi evolving',
    current: Math.min(postCount, EVOLVE_REQUIRED_POSTS),
    required: EVOLVE_REQUIRED_POSTS,
    completed: postsCompleted,
    type: 'persistent',
    action: 'open_modal',
    actionTarget: 'blobbi_post',
    actionLabel: 'Create Post',
  });
  
  // 4. Interact 21 times (PERSISTENT)
  const interactions = interactionCount ?? 0;
  const interactionsCompleted = interactions >= EVOLVE_REQUIRED_INTERACTIONS;
  tasks.push({
    id: 'interactions',
    name: 'Interact with Blobbi',
    description: `Care for your Blobbi ${EVOLVE_REQUIRED_INTERACTIONS} times`,
    current: Math.min(interactions, EVOLVE_REQUIRED_INTERACTIONS),
    required: EVOLVE_REQUIRED_INTERACTIONS,
    completed: interactionsCompleted,
    type: 'persistent',
    // No action - just interact with Blobbi
  });
  
  // 5. Use Blobbi Shape (PERSISTENT)
  const currentShape = data?.profileAfter ? extractShapeFromMetadata(data.profileAfter) : undefined;
  const hasBlobbiShape = isBlobbiShape(currentShape);
  tasks.push({
    id: 'blobbi_shape',
    name: 'Use Blobbi Shape',
    description: 'Set a Blobbi avatar shape in your profile',
    current: hasBlobbiShape ? 1 : 0,
    required: 1,
    completed: hasBlobbiShape,
    type: 'persistent',
    action: 'navigate',
    actionTarget: '/settings/profile',
    actionLabel: 'Edit Profile',
  });
  
  // 6. Edit Wall once (PERSISTENT)
  const wallEditCount = data?.wallEditEvents?.length ?? 0;
  const hasWallEdit = wallEditCount >= 1;
  tasks.push({
    id: 'edit_wall',
    name: 'Edit Your Wall',
    description: 'Customize your profile wall',
    current: hasWallEdit ? 1 : 0,
    required: 1,
    completed: hasWallEdit,
    type: 'persistent',
    action: 'navigate',
    actionTarget: '/settings/profile',
    actionLabel: 'Edit Wall',
  });
  
  // ─── Compute DYNAMIC Task (stat-based, NEVER cached) ───
  // 7. Maintain All Stats >= 80
  const stats = companion?.stats ?? {};
  const hunger = stats.hunger ?? 0;
  const happiness = stats.happiness ?? 0;
  const health = stats.health ?? 0;
  const hygiene = stats.hygiene ?? 0;
  const energy = stats.energy ?? 0;
  
  const statsOk = 
    hunger >= EVOLVE_STAT_THRESHOLD &&
    happiness >= EVOLVE_STAT_THRESHOLD &&
    health >= EVOLVE_STAT_THRESHOLD &&
    hygiene >= EVOLVE_STAT_THRESHOLD &&
    energy >= EVOLVE_STAT_THRESHOLD;
  
  // Calculate minimum stat for progress display
  const minStat = Math.min(hunger, happiness, health, hygiene, energy);
  
  tasks.push({
    id: 'maintain_stats',
    name: 'Peak Condition',
    description: `Keep all stats above ${EVOLVE_STAT_THRESHOLD}`,
    current: statsOk ? EVOLVE_STAT_THRESHOLD : minStat,
    required: EVOLVE_STAT_THRESHOLD,
    completed: statsOk,
    type: 'dynamic', // CRITICAL: Never persist this task
    // No action - just care for your Blobbi
  });
  
  // ─── Compute Completion States ───
  const persistentTasks = tasks.filter(t => t.type === 'persistent');
  const dynamicTasks = tasks.filter(t => t.type === 'dynamic');
  
  const persistentTasksComplete = persistentTasks.every(t => t.completed);
  const dynamicTaskComplete = dynamicTasks.every(t => t.completed);
  const allCompleted = persistentTasksComplete && dynamicTaskComplete;
  
  return {
    tasks,
    persistentTasksComplete,
    dynamicTaskComplete,
    allCompleted,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Get the current interaction count for evolve from companion task cache.
 */
export function getEvolveInteractionCount(companion: BlobbiCompanion | null): number {
  if (!companion) return 0;
  const interactionTask = companion.tasks.find(t => t.name === 'interactions');
  return interactionTask?.value ?? 0;
}
