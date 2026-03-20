// src/blobbi/actions/hooks/useHatchTasks.ts

/**
 * Hook to compute hatch task progress from Nostr events.
 * 
 * CRITICAL ARCHITECTURE:
 * - PERSISTENT TASKS: Based on Nostr events, can be cached in tags
 * - DYNAMIC TASKS: Based on current stats, NEVER stored in tags
 * 
 * Tags are only cache for persistent tasks. Source of truth = Nostr events.
 * All persistent tasks are computed dynamically from events with created_at >= state_started_at.
 */

import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { BlobbiCompanion } from '@/lib/blobbi';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Kind for theme definition events */
export const KIND_THEME_DEFINITION = 36767;
/** Kind for color moment events (espy.social) */
export const KIND_COLOR_MOMENT = 3367;
/** Kind for profile metadata */
export const KIND_PROFILE_METADATA = 0;
/** Kind for short text notes */
export const KIND_SHORT_TEXT_NOTE = 1;

/** Required interactions to complete the hatch interactions task */
export const HATCH_REQUIRED_INTERACTIONS = 7;

/** Required hashtags for the Blobbi post (excludes Blobbi name, which is dynamic) */
export const BLOBBI_POST_REQUIRED_HASHTAGS = ['blobbi', 'ditto', 'nostr'];

/** Prefix text for Blobbi hatch post */
export const BLOBBI_POST_PREFIX = 'Hello Nostr! Posting to hatch';

/** Stat threshold for hatch dynamic task (health, hygiene, happiness >= 70) */
export const HATCH_STAT_THRESHOLD = 70;

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
 * Check if a post is a valid Blobbi hatch post.
 * Must contain the required prefix and all required hashtags including the Blobbi name.
 * 
 * @param event - The Nostr event to validate
 * @param blobbiName - The Blobbi's name (will be sanitized and checked as hashtag)
 */
export function isValidHatchPost(event: NostrEvent, blobbiName: string): boolean {
  // Check content starts with prefix
  if (!event.content.startsWith(BLOBBI_POST_PREFIX)) {
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

// Legacy function name for backwards compatibility
export const isValidBlobbiPost = isValidHatchPost;

// ─── Main Hook ────────────────────────────────────────────────────────────────

/**
 * Hook to compute hatch task progress from Nostr events and current stats.
 * 
 * PERSISTENT TASKS (event-based, can be cached):
 * 1. Create Theme (kind 36767) - ≥1 event after start
 * 2. Color Moment (kind 3367) - ≥1 event after start
 * 3. Change Avatar Shape (kind 0) - shape changed between before/after start
 * 4. Create Post (kind 1) - ≥1 valid Blobbi hatch post after start
 * 5. Interactions - 7 total (tracked via companion.tasks cache)
 * 
 * DYNAMIC TASK (stat-based, NEVER cached):
 * 6. Maintain Stats - health >= 70, hygiene >= 70, happiness >= 70
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
  
  // Query for all relevant events
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['hatch-tasks', pubkey, stateStartedAt],
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
        // Posts after start (will filter for valid Blobbi posts)
        {
          kinds: [KIND_SHORT_TEXT_NOTE],
          authors: [pubkey],
          since: stateStartedAt,
          limit: 50, // Reasonable limit
        },
        // Profile metadata - need both before and after start
        // Get latest before start
        {
          kinds: [KIND_PROFILE_METADATA],
          authors: [pubkey],
          until: stateStartedAt,
          limit: 1,
        },
        // Get latest after start
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
      
      // Separate profile events into before and after
      const profileEvents = events.filter(e => e.kind === KIND_PROFILE_METADATA);
      const profileBefore = profileEvents
        .filter(e => e.created_at < stateStartedAt)
        .sort((a, b) => b.created_at - a.created_at)[0];
      const profileAfter = profileEvents
        .filter(e => e.created_at >= stateStartedAt)
        .sort((a, b) => b.created_at - a.created_at)[0];
      
      return {
        themeEvents,
        colorMomentEvents,
        postEvents,
        profileBefore,
        profileAfter,
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
    actionTarget: 'https://espy.social/',
    actionLabel: 'Open espy',
  });
  
  // 3. Change Avatar Shape (PERSISTENT)
  const shapeBefore = data?.profileBefore ? extractShapeFromMetadata(data.profileBefore) : undefined;
  const shapeAfter = data?.profileAfter ? extractShapeFromMetadata(data.profileAfter) : undefined;
  
  const hasPostStartProfileUpdate = !!data?.profileAfter;
  const hasNewShapeValue = shapeAfter !== undefined && shapeAfter !== '';
  const shapeActuallyChanged = shapeAfter !== shapeBefore;
  const shapeChanged = hasPostStartProfileUpdate && hasNewShapeValue && shapeActuallyChanged;
  tasks.push({
    id: 'change_shape',
    name: 'Change Avatar Shape',
    description: 'Update your profile avatar shape',
    current: shapeChanged ? 1 : 0,
    required: 1,
    completed: !!shapeChanged,
    type: 'persistent',
    action: 'navigate',
    actionTarget: '/settings/profile',
    actionLabel: 'Edit Profile',
  });
  
  // 4. Create Post (PERSISTENT)
  const blobbiName = companion?.name ?? '';
  const validPosts = data?.postEvents?.filter(e => isValidHatchPost(e, blobbiName)) ?? [];
  const hasValidPost = validPosts.length >= 1;
  tasks.push({
    id: 'create_post',
    name: 'Create Post',
    description: 'Share a post about hatching your Blobbi',
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
  
  // ─── Compute DYNAMIC Task (stat-based, NEVER cached) ───
  // 6. Maintain Stats - health >= 70, hygiene >= 70, happiness >= 70
  const stats = companion?.stats ?? {};
  const health = stats.health ?? 0;
  const hygiene = stats.hygiene ?? 0;
  const happiness = stats.happiness ?? 0;
  
  const statsOk = 
    health >= HATCH_STAT_THRESHOLD &&
    hygiene >= HATCH_STAT_THRESHOLD &&
    happiness >= HATCH_STAT_THRESHOLD;
  
  // Calculate minimum stat for progress display
  const minStat = Math.min(health, hygiene, happiness);
  
  tasks.push({
    id: 'maintain_stats',
    name: 'Keep Egg Healthy',
    description: `Keep health, hygiene & happiness above ${HATCH_STAT_THRESHOLD}`,
    current: statsOk ? HATCH_STAT_THRESHOLD : minStat,
    required: HATCH_STAT_THRESHOLD,
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
