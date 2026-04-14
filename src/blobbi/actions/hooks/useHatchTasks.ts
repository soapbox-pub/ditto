// src/blobbi/actions/hooks/useHatchTasks.ts

/**
 * Hook to compute hatch task progress from Nostr events.
 * 
 * CRITICAL ARCHITECTURE:
 * - PERSISTENT TASKS: Based on Nostr events, can be cached in tags
 * 
 * Tags are only cache for persistent tasks. Source of truth = Nostr events.
 * 
 * Most tasks are RETROACTIVE — they query the user's full history without
 * a `since:` filter. Only Blobbi-specific tasks (interactions) require
 * actions performed on the current Blobbi instance.
 * 
 * Note: Egg stats no longer decay, so there are no dynamic tasks for hatching.
 */

import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Kind for theme definition events */
export const KIND_THEME_DEFINITION = 36767;
/** Kind for color moment events (espy.you) */
export const KIND_COLOR_MOMENT = 3367;
/** Kind for profile metadata */
export const KIND_PROFILE_METADATA = 0;
/** Kind for short text notes */
export const KIND_SHORT_TEXT_NOTE = 1;

/** Required interactions to complete the hatch interactions task */
export const HATCH_REQUIRED_INTERACTIONS = 7;

/** Required hashtags for the Blobbi post (excludes Blobbi name, which is dynamic) */
export const BLOBBI_POST_REQUIRED_HASHTAGS = ['blobbi'];

/** Prefix text for Blobbi hatch post (the Blobbi name is appended after this) */
export const BLOBBI_POST_PREFIX = 'Posting to hatch';

// Legacy export for backwards compatibility
export const REQUIRED_INTERACTIONS = HATCH_REQUIRED_INTERACTIONS;

/**
 * Sanitize a name into a valid hashtag format.
 * Must match the implementation in BlobbiPostModal.tsx.
 */
export function sanitizeToHashtag(name: string): string {
  return name
    .toLowerCase()
    // Remove emojis and special characters, keep letters, numbers, underscores
    .replace(/[^\p{L}\p{N}_]/gu, '')
    // Ensure it starts with a letter (prepend 'blobbi' if it starts with number)
    .replace(/^(\d)/, 'blobbi$1')
    // Limit length
    .slice(0, 30)
    // Fallback if empty
    || 'myblobbi';
}

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Task type classification.
 * - persistent: Based on Nostr events, can be cached in tags
 * - dynamic: Based on current stats, NEVER stored in tags
 */
export type TaskType = 'persistent' | 'dynamic';

/**
 * Individual task definition.
 */
export interface HatchTask {
  id: string;
  name: string;
  description: string;
  /** Current progress value */
  current: number;
  /** Required value for completion */
  required: number;
  /** Whether the task is complete */
  completed: boolean;
  /** Task type - persistent (event-based) or dynamic (stat-based) */
  type: TaskType;
  /** Action to perform (if applicable) */
  action?: 'navigate' | 'open_modal' | 'external_link';
  /** Target for the action */
  actionTarget?: string;
  /** Button label */
  actionLabel?: string;
}

/**
 * Result of computing hatch tasks.
 */
export interface HatchTasksResult {
  tasks: HatchTask[];
  /** All persistent tasks are complete */
  persistentTasksComplete: boolean;
  /** Dynamic stat task is complete */
  dynamicTaskComplete: boolean;
  /** All tasks (persistent + dynamic) are complete - required to hatch */
  allCompleted: boolean;
  isLoading: boolean;
  error: Error | null;
  /** Refetch task progress */
  refetch: () => void;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Build the required phrase for a hatch post.
 * Format: "Posting to hatch {CapitalizedName} #blobbi"
 */
export function buildHatchPhrase(blobbiName: string): string {
  const capitalized = blobbiName.charAt(0).toUpperCase() + blobbiName.slice(1);
  return `${BLOBBI_POST_PREFIX} ${capitalized} #blobbi`;
}

/**
 * Check if a post is a valid Blobbi-related post.
 *
 * A post is valid if it mentions the "blobbi" hashtag in either:
 * - A `["t", "blobbi"]` tag, OR
 * - The literal text `#blobbi` anywhere in the content
 *
 * This is intentionally loose so that historical posts can count
 * retroactively toward hatch requirements.
 */
export function isValidHatchPost(event: NostrEvent): boolean {
  // Check for blobbi hashtag in t tags
  const hasBlobbiTag = event.tags.some(
    tag => tag[0] === 't' && tag[1]?.toLowerCase() === 'blobbi',
  );
  if (hasBlobbiTag) return true;

  // Fallback: check content for #blobbi (case-insensitive)
  return /#blobbi\b/i.test(event.content);
}

/** @deprecated Use isValidHatchPost instead. */
export const isValidBlobbiPost = isValidHatchPost;

// ─── Main Hook ────────────────────────────────────────────────────────────────

/**
 * Hook to compute hatch task progress from Nostr events and current stats.
 * 
 * RETROACTIVE TASKS (count from full user history):
 * 1. Create Theme (kind 36767) - ≥1 event ever
 * 2. Color Moment (kind 3367) - ≥1 event ever
 * 3. Create Post (kind 1) - ≥1 post with #blobbi hashtag ever
 * 
 * BLOBBI-SPECIFIC TASKS (must be done for this Blobbi):
 * 4. Interactions - 7 total (tracked via companion.tasks cache)
 * 
 * @param companion - The Blobbi companion (must be incubating)
 * @param interactionCount - Current interaction count from companion tasks cache
 */
export function useHatchTasks(
  companion: BlobbiCompanion | null,
  interactionCount?: number
): HatchTasksResult {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  
  const pubkey = user?.pubkey;
  const stateStartedAt = companion?.stateStartedAt;
  const isIncubating = companion?.state === 'incubating';
  
  // Query for all relevant events.
  //
  // RETROACTIVE tasks (theme, color moment, post) query the user's full
  // history — no `since:` filter. This means completing the activity once
  // satisfies the requirement for every future egg.
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['hatch-tasks', pubkey, stateStartedAt],
    queryFn: async () => {
      if (!pubkey || !stateStartedAt) {
        return null;
      }
      
      // Build filters for events we need
      const filters: NostrFilter[] = [
        // Theme definitions — retroactive (no since:)
        {
          kinds: [KIND_THEME_DEFINITION],
          authors: [pubkey],
          limit: 1, // Only need to know ≥1 exists
        },
        // Color moments — retroactive (no since:)
        {
          kinds: [KIND_COLOR_MOMENT],
          authors: [pubkey],
          limit: 1,
        },
        // Blobbi-tagged posts — retroactive (no since:)
        // Relay-level filter by #t=blobbi; client-side fallback in isValidHatchPost
        {
          kinds: [KIND_SHORT_TEXT_NOTE],
          authors: [pubkey],
          '#t': ['blobbi'],
          limit: 1,
        },
      ];
      
      // Execute all queries
      const events = await nostr.query(filters);
      
      // Categorize events
      const themeEvents = events.filter(e => e.kind === KIND_THEME_DEFINITION);
      const colorMomentEvents = events.filter(e => e.kind === KIND_COLOR_MOMENT);
      const postEvents = events.filter(e => e.kind === KIND_SHORT_TEXT_NOTE);
      
      return {
        themeEvents,
        colorMomentEvents,
        postEvents,
      };
    },
    enabled: !!pubkey && !!stateStartedAt && isIncubating,
    staleTime: 30_000, // 30 seconds
    refetchInterval: 60_000, // Refetch every minute
  });
  
  // ─── Compute PERSISTENT Tasks ───
  const tasks: HatchTask[] = [];
  
  // 1. Create Theme (PERSISTENT)
  const hasTheme = (data?.themeEvents?.length ?? 0) >= 1;
  tasks.push({
    id: 'create_theme',
    name: 'Create Theme',
    description: 'Create a custom theme for your profile',
    current: hasTheme ? 1 : 0,
    required: 1,
    completed: hasTheme,
    type: 'persistent',
    action: 'navigate',
    actionTarget: '/themes',
    actionLabel: 'Create Theme',
  });
  
  // 2. Color Moment (PERSISTENT)
  const hasColorMoment = (data?.colorMomentEvents?.length ?? 0) >= 1;
  tasks.push({
    id: 'color_moment',
    name: 'Color Moment',
    description: 'Share a color moment on espy',
    current: hasColorMoment ? 1 : 0,
    required: 1,
    completed: hasColorMoment,
    type: 'persistent',
    action: 'external_link',
    actionTarget: 'https://espy.you/',
    actionLabel: 'Open espy',
  });
  
  // 3. Create Post (PERSISTENT) — retroactive: any post with #blobbi
  const validPosts = data?.postEvents?.filter(e => isValidHatchPost(e)) ?? [];
  const hasValidPost = validPosts.length >= 1;
  tasks.push({
    id: 'create_post',
    name: 'Create Post',
    description: 'Share a post with the #blobbi hashtag',
    current: hasValidPost ? 1 : 0,
    required: 1,
    completed: hasValidPost,
    type: 'persistent',
    action: 'open_modal',
    actionTarget: 'blobbi_post',
    actionLabel: 'Create Post',
  });
  
  // 5. Interactions (PERSISTENT)
  const interactions = interactionCount ?? 0;
  const interactionsCompleted = interactions >= HATCH_REQUIRED_INTERACTIONS;
  tasks.push({
    id: 'interactions',
    name: 'Interact with Blobbi',
    description: `Care for your Blobbi ${HATCH_REQUIRED_INTERACTIONS} times`,
    current: Math.min(interactions, HATCH_REQUIRED_INTERACTIONS),
    required: HATCH_REQUIRED_INTERACTIONS,
    completed: interactionsCompleted,
    type: 'persistent',
    // No action - just interact with Blobbi
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
 * Get the current interaction count from companion task cache.
 */
export function getInteractionCount(companion: BlobbiCompanion | null): number {
  if (!companion) return 0;
  const interactionTask = companion.tasks.find(t => t.name === 'interactions');
  return interactionTask?.value ?? 0;
}

/**
 * Filter tasks to only persistent tasks (for tag sync).
 * CRITICAL: Dynamic tasks must NEVER be synced to tags.
 */
export function filterPersistentTasks(tasks: HatchTask[]): HatchTask[] {
  return tasks.filter(t => t.type === 'persistent');
}
