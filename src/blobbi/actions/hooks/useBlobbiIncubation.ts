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
import { useIntl } from 'react-intl';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';

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
  const intl = useIntl();

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
          title: intl.formatMessage({ id: 'blobbiIncubation.switched.title', defaultMessage: 'Switched incubation!' }),
          description: intl.formatMessage(
            { id: 'blobbiIncubation.switched.description', defaultMessage: 'Stopped {stoppedOtherName}, now incubating {name}.' },
            { stoppedOtherName, name },
          ),
        });
      } else if (mode === 'restart') {
        toast({
          title: intl.formatMessage({ id: 'blobbiIncubation.restarted.title', defaultMessage: 'Incubation restarted!' }),
          description: intl.formatMessage(
            { id: 'blobbiIncubation.restarted.description', defaultMessage: "{name}'s task progress has been reset." },
            { name },
          ),
        });
      } else {
        toast({
          title: intl.formatMessage({ id: 'blobbiIncubation.started.title', defaultMessage: 'Incubation started!' }),
          description: intl.formatMessage(
            { id: 'blobbiIncubation.started.description', defaultMessage: '{name} is now incubating. Complete the tasks to hatch!' },
            { name },
          ),
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: intl.formatMessage({ id: 'blobbiIncubation.startFailed', defaultMessage: 'Failed to start incubation' }),
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
  const intl = useIntl();

  return useStartEvolutionBase({
    companion,
    pubkey: user?.pubkey,
    publish,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
    onSuccess: ({ name }) => {
      toast({
        title: intl.formatMessage({ id: 'blobbiEvolution.started.title', defaultMessage: 'Evolution started!' }),
        description: intl.formatMessage(
          { id: 'blobbiEvolution.started.description', defaultMessage: '{name} is now working towards evolution. Complete the tasks to evolve!' },
          { name },
        ),
      });
    },
    onError: (error: Error) => {
      toast({
        title: intl.formatMessage({ id: 'blobbiEvolution.startFailed', defaultMessage: 'Failed to start evolution' }),
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
  const intl = useIntl();

  return useStopEvolutionBase({
    companion,
    pubkey: user?.pubkey,
    publish,
    ensureCanonicalBeforeAction,
    updateCompanionEvent,
    onSuccess: ({ name }) => {
      toast({
        title: intl.formatMessage({ id: 'blobbiEvolution.stopped.title', defaultMessage: 'Evolution stopped' }),
        description: intl.formatMessage(
          { id: 'blobbiEvolution.stopped.description', defaultMessage: '{name} is no longer evolving. Task progress has been reset.' },
          { name },
        ),
      });
    },
    onError: (error: Error) => {
      toast({
        title: intl.formatMessage({ id: 'blobbiEvolution.stopFailed', defaultMessage: 'Failed to stop evolution' }),
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
