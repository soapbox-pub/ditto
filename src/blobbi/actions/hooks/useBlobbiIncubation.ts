/**
 * Blobbi incubation hooks - Ditto wrappers around the headless @blobbi-kit/react hooks.
 *
 * The incubation/evolution progression logic lives in
 * `@blobbi-kit/react/hooks/useBlobbiIncubation` (app-agnostic, UI-free). These
 * wrappers inject the current user's pubkey and the host `publish` function, and
 * re-add Ditto's user-facing toast feedback — preserving the previous public API
 * (`useStartIncubation({ companion, profile, ensureCanonicalBeforeAction,
 * updateCompanionEvent })`, etc.).
 */

import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';

import type { StorageItem } from '@blobbi-kit/core/blobbi';
import {
  useStartIncubation as useStartIncubationBase,
  useStopIncubation as useStopIncubationBase,
  useStartEvolution as useStartEvolutionBase,
  useStopEvolution as useStopEvolutionBase,
  type StartIncubationMode,
  type StartIncubationRequest,
  type StartIncubationResult,
  type StopIncubationResult,
  type StartEvolutionResult,
  type StopEvolutionResult,
} from '@blobbi-kit/react/hooks/useBlobbiIncubation';

// ─── Re-exported Types (preserve existing import paths) ─────────────────────────

export type {
  StartIncubationMode,
  StartIncubationRequest,
  StartIncubationResult,
  StopIncubationResult,
  StartEvolutionResult,
  StopEvolutionResult,
};

/** Shared canonical-result shape returned by `ensureCanonicalBeforeAction`. */
interface CanonicalActionResult {
  companion: import('@blobbi-kit/core/blobbi').BlobbiCompanion;
  content: string;
  allTags: string[][];
  profileAllTags: string[][];
  profileStorage: StorageItem[];
}

/** Parameters for start incubation hook (Ditto public API). */
export interface UseStartIncubationParams {
  companion: import('@blobbi-kit/core/blobbi').BlobbiCompanion | null;
  profile: import('@blobbi-kit/core/blobbi').BlobbonautProfile | null;
  /** Called to fetch fresh companion + profile data before acting */
  ensureCanonicalBeforeAction: () => Promise<CanonicalActionResult | null>;
  /** Update companion event in local cache */
  updateCompanionEvent: (event: NostrEvent) => void;
}

/** Parameters for stop incubation hook (Ditto public API). */
export interface UseStopIncubationParams {
  companion: import('@blobbi-kit/core/blobbi').BlobbiCompanion | null;
  /** Called to fetch fresh companion + profile data before acting */
  ensureCanonicalBeforeAction: () => Promise<CanonicalActionResult | null>;
  /** Update companion event in local cache */
  updateCompanionEvent: (event: NostrEvent) => void;
}

/** Parameters for start evolution hook (Ditto public API). */
export interface UseStartEvolutionParams {
  companion: import('@blobbi-kit/core/blobbi').BlobbiCompanion | null;
  /** Called to fetch fresh companion + profile data before acting */
  ensureCanonicalBeforeAction: () => Promise<CanonicalActionResult | null>;
  /** Update companion event in local cache */
  updateCompanionEvent: (event: NostrEvent) => void;
}

/** Parameters for stop evolution hook (Ditto public API). */
export interface UseStopEvolutionParams {
  companion: import('@blobbi-kit/core/blobbi').BlobbiCompanion | null;
  /** Called to fetch fresh companion + profile data before acting */
  ensureCanonicalBeforeAction: () => Promise<CanonicalActionResult | null>;
  /** Update companion event in local cache */
  updateCompanionEvent: (event: NostrEvent) => void;
}

// ─── Start Incubation ───────────────────────────────────────────────────────

export function useStartIncubation({
  companion,
  profile,
  ensureCanonicalBeforeAction,
  updateCompanionEvent,
}: UseStartIncubationParams) {
  const { user } = useCurrentUser();
  const { mutateAsync: publish } = useNostrPublish();

  return useStartIncubationBase({
    companion,
    profile,
    pubkey: user?.pubkey,
    publish,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
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

// ─── Stop Incubation (no toast, matching original behavior) ─────────────────

export function useStopIncubation({
  companion,
  ensureCanonicalBeforeAction,
  updateCompanionEvent,
}: UseStopIncubationParams) {
  const { user } = useCurrentUser();
  const { mutateAsync: publish } = useNostrPublish();

  return useStopIncubationBase({
    companion,
    pubkey: user?.pubkey,
    publish,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
  });
}

// ─── Start Evolution ────────────────────────────────────────────────────────

export function useStartEvolution({
  companion,
  ensureCanonicalBeforeAction,
  updateCompanionEvent,
}: UseStartEvolutionParams) {
  const { user } = useCurrentUser();
  const { mutateAsync: publish } = useNostrPublish();

  return useStartEvolutionBase({
    companion,
    pubkey: user?.pubkey,
    publish,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
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

// ─── Stop Evolution ─────────────────────────────────────────────────────────

export function useStopEvolution({
  companion,
  ensureCanonicalBeforeAction,
  updateCompanionEvent,
}: UseStopEvolutionParams) {
  const { user } = useCurrentUser();
  const { mutateAsync: publish } = useNostrPublish();

  return useStopEvolutionBase({
    companion,
    pubkey: user?.pubkey,
    publish,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
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
