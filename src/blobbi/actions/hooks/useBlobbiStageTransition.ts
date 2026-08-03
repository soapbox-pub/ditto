// src/blobbi/actions/hooks/useBlobbiStageTransition.ts

/**
 * Blobbi stage-transition hooks — Ditto wrapper around the headless
 * @blobbi-kit/react hook.
 *
 * The evolve transition logic lives in `@blobbi-kit/react/hooks/useBlobbiEvolve`
 * (app-agnostic, UI-free). This wrapper injects the current user's pubkey and
 * the host `publish` function, and re-adds Ditto's user-facing toast feedback —
 * preserving the previous public API (`useBlobbiEvolve({ companion, profile,
 * ensureCanonicalBeforeAction, updateCompanionEvent })`).
 *
 * NOTE: hatching is published inline by `BlobbiHatchingCeremony.executeHatch`;
 * there is no hatch hook here. The `useBlobbiHatch` hook was removed as dead
 * code (see commit 762f7ecf).
 */

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';

import type { NostrEvent } from '@nostrify/nostrify';
import type { BlobbiCompanion, BlobbonautProfile } from '@blobbi-kit/core/blobbi';

import {
  useBlobbiEvolve as useBlobbiEvolveBase,
  type CanonicalActionResult,
  type StageTransitionResult,
} from '@blobbi-kit/react/hooks/useBlobbiEvolve';

// ─── Re-exported Types (preserve existing import paths) ─────────────────────────

export type {
  CanonicalActionResult,
  StageTransitionResult,
};

/**
 * Parameters for stage transition hooks (Ditto public API).
 */
export interface UseBlobbiStageTransitionParams {
  companion: BlobbiCompanion | null;
  profile: BlobbonautProfile | null;
  /** Called to fetch fresh companion + profile data before acting */
  ensureCanonicalBeforeAction: () => Promise<CanonicalActionResult | null>;
  /** Update companion event in local cache */
  updateCompanionEvent: (event: NostrEvent) => void;
}

// ─── Evolve Hook ──────────────────────────────────────────────────────────────

/**
 * Hook to evolve a baby Blobbi into an adult.
 *
 * Injects the current user's pubkey and the host publish function, and adds
 * Ditto's error toast. Matches the original behavior: error toast only (no
 * success toast).
 */
export function useBlobbiEvolve({
  companion,
  profile,
  ensureCanonicalBeforeAction,
  updateCompanionEvent,
}: UseBlobbiStageTransitionParams) {
  const { user } = useCurrentUser();
  const { mutateAsync: publish } = useNostrPublish();

  return useBlobbiEvolveBase({
    companion,
    profile,
    pubkey: user?.pubkey,
    publish,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
    onError: (error: Error) => {
      toast({
        title: 'Failed to evolve',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
