// src/blobbi/actions/hooks/useActiveTaskProcess.ts

/**
 * Central abstraction for the active task process (hatch or evolve).
 * 
 * This hook consolidates all scattered if/else logic for determining:
 * - Which process is active (incubating vs evolving)
 * - Which tasks to use (hatch vs evolve)
 * - Thresholds and configuration
 * - Badge-related computed values
 * 
 * ARCHITECTURE RULES:
 * - Computed tasks remain the source of truth
 * - Tags are cache only for PERSISTENT tasks
 * - Dynamic tasks are NEVER persisted
 * - Badge counts ALL incomplete tasks (persistent + dynamic)
 */

import { useMemo } from 'react';
import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';
import type { HatchTask, HatchTasksResult } from './useHatchTasks';
import type { EvolveTasksResult } from './useEvolveTasks';
import { HATCH_REQUIRED_INTERACTIONS } from './useHatchTasks';
import { EVOLVE_REQUIRED_INTERACTIONS } from './useEvolveTasks';

// ─── Types ────────────────────────────────────────────────────────────────────

/** The type of task process currently active */
export type TaskProcessType = 'hatch' | 'evolve' | null;

/**
 * Configuration for the active task process.
 * This provides a unified interface regardless of whether
 * the process is hatch or evolve.
 */
export interface TaskProcessConfig {
  /** The type of process ('hatch' | 'evolve' | null) */
  type: TaskProcessType;
  /** Whether there is an active task process */
  isActive: boolean;
  /** Required interactions threshold for the current process */
  interactionThreshold: number;
}

/**
 * Result of the active task process hook.
 * Provides unified access to all task-related state.
 */
export interface ActiveTaskProcessResult {
  /** Configuration for the current process */
  config: TaskProcessConfig;
  
  /** All tasks for the current process (empty if no active process) */
  tasks: HatchTask[];
  /** Whether tasks are still loading */
  isLoading: boolean;
  /** Whether all tasks (persistent + dynamic) are complete */
  allCompleted: boolean;
  /** Whether all persistent tasks are complete */
  persistentTasksComplete: boolean;
  /** Whether the dynamic task is complete */
  dynamicTaskComplete: boolean;
  
  /** Refetch function for current tasks */
  refetch: () => void;
  
  // ─── Badge-related computed values ───
  
  /** 
   * Count of ALL remaining incomplete tasks (persistent + dynamic).
   * This is used for the badge display.
   * Dynamic tasks ARE counted here but are NEVER synced to tags.
   */
  remainingTasksCount: number;
  
  /**
   * Only persistent tasks that are incomplete.
   * Used for sync logic - dynamic tasks must NEVER be synced.
   */
  incompletePersistentTasks: HatchTask[];
  
  /**
   * Only persistent tasks that are complete.
   * Used for sync logic.
   */
  completedPersistentTasks: HatchTask[];
  
  /**
   * Stable string key of completed persistent task IDs.
   * Used for sync anti-loop protection.
   */
  completedPersistentTaskIds: string;
  
  /**
   * Tasks to sync (persistent only, with completion status).
   * Dynamic tasks are excluded.
   */
  tasksToSync: Array<{ taskId: string; completed: boolean }>;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Filter tasks to only persistent tasks.
 * Dynamic tasks must NEVER be synced to tags.
 */
export function filterPersistentTasks(tasks: HatchTask[]): HatchTask[] {
  return tasks.filter(t => t.type === 'persistent');
}

/**
 * Filter tasks to only dynamic tasks.
 */
export function filterDynamicTasks(tasks: HatchTask[]): HatchTask[] {
  return tasks.filter(t => t.type === 'dynamic');
}

// ─── Main Hook ────────────────────────────────────────────────────────────────

/**
 * Hook that provides a unified interface for the active task process.
 * 
 * Usage:
 * ```ts
 * const taskProcess = useActiveTaskProcess(companion, hatchTasks, evolveTasks);
 * 
 * // Access unified data
 * taskProcess.config.type // 'hatch' | 'evolve' | null
 * taskProcess.tasks // current tasks
 * taskProcess.remainingTasksCount // for badge (includes dynamic)
 * taskProcess.tasksToSync // for sync (excludes dynamic)
 * ```
 */
export function useActiveTaskProcess(
  companion: BlobbiCompanion | null,
  hatchTasks: HatchTasksResult,
  evolveTasks: EvolveTasksResult
): ActiveTaskProcessResult {
  // Determine which process is active
  const processType = useMemo((): TaskProcessType => {
    if (!companion) return null;
    if (companion.state === 'incubating') return 'hatch';
    if (companion.state === 'evolving') return 'evolve';
    return null;
  }, [companion]);
  
  // Build configuration
  const config = useMemo((): TaskProcessConfig => {
    const isActive = processType !== null;
    const interactionThreshold = processType === 'hatch' 
      ? HATCH_REQUIRED_INTERACTIONS 
      : processType === 'evolve' 
        ? EVOLVE_REQUIRED_INTERACTIONS 
        : 0;
    
    return {
      type: processType,
      isActive,
      interactionThreshold,
    };
  }, [processType]);
  
  // Get the active tasks result based on process type
  const activeResult = useMemo(() => {
    if (processType === 'hatch') return hatchTasks;
    if (processType === 'evolve') return evolveTasks;
    return null;
  }, [processType, hatchTasks, evolveTasks]);
  
  // Extract tasks and state from active result
  const tasks = activeResult?.tasks ?? [];
  const isLoading = activeResult?.isLoading ?? false;
  const allCompleted = activeResult?.allCompleted ?? false;
  const persistentTasksComplete = activeResult?.persistentTasksComplete ?? false;
  const dynamicTaskComplete = activeResult?.dynamicTaskComplete ?? false;
  const refetch = activeResult?.refetch ?? (() => {});
  
  // Compute persistent task list (dynamic tasks computed for badge count directly from tasks array)
  const persistentTasks = useMemo(() => filterPersistentTasks(tasks), [tasks]);
  
  // Compute incomplete tasks (for badge - includes BOTH persistent and dynamic)
  const remainingTasksCount = useMemo(() => {
    // Count ALL incomplete tasks - persistent AND dynamic
    // Dynamic tasks are included in badge count but NEVER synced to tags
    return tasks.filter(t => !t.completed).length;
  }, [tasks]);
  
  // Compute persistent task lists for sync
  const incompletePersistentTasks = useMemo(() => 
    persistentTasks.filter(t => !t.completed), 
    [persistentTasks]
  );
  
  const completedPersistentTasks = useMemo(() => 
    persistentTasks.filter(t => t.completed), 
    [persistentTasks]
  );
  
  // Compute stable string key for completed persistent tasks (anti-loop)
  const completedPersistentTaskIds = useMemo(() => {
    if (!completedPersistentTasks.length) return '';
    return completedPersistentTasks
      .map(t => t.id)
      .sort()
      .join(',');
  }, [completedPersistentTasks]);
  
  // Compute tasks to sync (persistent only)
  // CRITICAL: Dynamic tasks must NEVER be included here
  const tasksToSync = useMemo(() => {
    if (!persistentTasks.length) return [];
    return persistentTasks.map(t => ({
      taskId: t.id,
      completed: t.completed,
    }));
  }, [persistentTasks]);
  
  return {
    config,
    tasks,
    isLoading,
    allCompleted,
    persistentTasksComplete,
    dynamicTaskComplete,
    refetch,
    remainingTasksCount,
    incompletePersistentTasks,
    completedPersistentTasks,
    completedPersistentTaskIds,
    tasksToSync,
  };
}
