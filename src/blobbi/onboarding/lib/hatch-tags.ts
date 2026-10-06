/**
 * The tags an egg hatches into: what the hatching ceremony publishes.
 *
 * Everything is merged onto the egg's own tags, so its identity (seed,
 * visual generation, a V3 Blobbi's colours and traits) and any extension
 * tags pass through unchanged; only the life stage, stats and progression
 * move.
 */

import { STAT_MAX, updateBlobbiTags } from '@blobbi-kit/core/blobbi';
import { validateAndRepairBlobbiTags } from '@blobbi-kit/core/blobbi-tag-schema';

export function buildHatchedBabyTags(
  eggTags: string[][],
  streakUpdates: Record<string, string>,
  now: number,
): string[][] {
  const nowStr = now.toString();

  // First merge: promote to an active baby with full stats. Preserves all
  // identity/extension tags (personality, trait, equip, etc.) via updateBlobbiTags.
  const mergedTags = updateBlobbiTags(eggTags, {
    stage: 'baby',
    state: 'active',
    hunger: STAT_MAX.toString(),
    happiness: STAT_MAX.toString(),
    health: STAT_MAX.toString(),
    hygiene: STAT_MAX.toString(),
    energy: STAT_MAX.toString(),
    ...streakUpdates,
    last_interaction: nowStr,
    last_decay_at: nowStr,
  });

  // Validate and repair: strips stale task / task_completed / state_started_at
  // and normalizes state for the new stage. Uses the original egg tags for recovery.
  const repairResult = validateAndRepairBlobbiTags(mergedTags, eggTags, { cleanupTaskTags: true });
  if (repairResult.errors.length > 0) {
    console.error('[HatchingCeremony] Tag validation errors:', repairResult.errors);
    throw new Error(`Tag validation failed: ${repairResult.errors.join(', ')}`);
  }

  // Set progression AFTER validation, since cleanupTaskTags clears it. The
  // baby auto-starts its evolution journey immediately.
  return updateBlobbiTags(repairResult.tags, {
    progression_state: 'evolving',
    progression_started_at: nowStr,
  });
}
