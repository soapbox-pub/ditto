/**
 * useFirstEggExperience - State machine for the first-time Blobbi experience.
 *
 * This hook orchestrates the full first-egg journey:
 * 1. Auto-create Blobbonaut profile (if missing)
 * 2. Auto-generate & publish the first egg (no confirmation, no cost)
 * 3. Immediately enter the hatch interaction flow
 * 4. Show a reveal overlay after hatching for naming
 *
 * The hook is designed to be consumed by a single orchestrating component.
 * It manages state transitions but does NOT render anything.
 *
 * ────────────────────────────────────────────────────────────────
 * This flow is ONLY for the user's first Blobbi.
 * Subsequent Blobbis use the standard adoption flow.
 * ────────────────────────────────────────────────────────────────
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';

import {
  KIND_BLOBBI_STATE,
  KIND_BLOBBONAUT_PROFILE,
  INITIAL_BLOBBONAUT_COINS,
  buildBlobbonautTags,
  type BlobbonautProfile,
  type BlobbiCompanion,
} from '@/blobbi/core/lib/blobbi';

import {
  generateEggPreview,
  previewToEventTags,
} from '@/blobbi/onboarding/lib/blobbi-preview';

import { updateBlobbonautTags } from '@/blobbi/core/lib/blobbi';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Steps of the first egg experience:
 *
 * - 'idle': Not yet active (preconditions not met or already completed)
 * - 'creating_profile': Auto-creating the Blobbonaut profile
 * - 'creating_egg': Auto-generating and publishing the first egg
 * - 'ready': Egg created, waiting for hatch tour to run (handed off to tour system)
 * - 'done': Experience is fully complete
 */
export type FirstEggStep =
  | 'idle'
  | 'creating_profile'
  | 'creating_egg'
  | 'ready'
  | 'done';

export interface FirstEggExperienceState {
  /** Current step */
  step: FirstEggStep;
  /** Whether auto-creation is in progress */
  isProcessing: boolean;
  /** Whether the experience is active (not idle or done) */
  isActive: boolean;
}

export interface UseFirstEggExperienceOptions {
  /** Current profile (null if doesn't exist yet) */
  profile: BlobbonautProfile | null;
  /** Whether the profile is still loading */
  profileLoading: boolean;
  /** All resolved companions */
  companions: BlobbiCompanion[];
  /** Whether companions are still loading */
  companionsLoading: boolean;
  /** Cache update callbacks */
  updateProfileEvent: (event: NostrEvent) => void;
  updateCompanionEvent: (event: NostrEvent) => void;
  invalidateProfile: () => void;
  invalidateCompanion: () => void;
  setStoredSelectedD: (d: string) => void;
}

export interface UseFirstEggExperienceResult {
  state: FirstEggExperienceState;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFirstEggExperience({
  profile,
  profileLoading,
  companions,
  companionsLoading,
  updateProfileEvent,
  updateCompanionEvent,
  invalidateProfile,
  invalidateCompanion,
  setStoredSelectedD,
}: UseFirstEggExperienceOptions): UseFirstEggExperienceResult {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { data: authorData } = useAuthor(user?.pubkey);

  const [step, setStep] = useState<FirstEggStep>('idle');
  const [isProcessing, setIsProcessing] = useState(false);

  // Prevent double-execution with refs
  const profileCreationAttempted = useRef(false);
  const eggCreationAttempted = useRef(false);

  // Suggested name from kind 0 metadata
  const suggestedName = useMemo(() => {
    if (!authorData?.metadata) return undefined;
    return authorData.metadata.display_name || authorData.metadata.name || undefined;
  }, [authorData?.metadata]);

  // ─── Determine if the experience should be active ──────────────────────────

  // Case A: No profile → need to create profile + egg
  // Case B: Profile exists, no companions loaded yet, but profile.has is empty → need to create egg
  // Case C: Profile + companions loaded, exactly 1 egg → hatch tour handles it, we're 'ready'
  // Otherwise: idle (user already has Blobbis, or has baby/adult)

  useEffect(() => {
    // Still loading? Don't decide yet.
    if (profileLoading) return;

    // If we're already processing, don't re-evaluate
    if (isProcessing) return;

    // If already done or in an active step, don't re-evaluate
    if (step === 'done') return;
    if (step === 'creating_profile' || step === 'creating_egg') return;

    // Case A: No profile at all
    if (!profile && !profileCreationAttempted.current) {
      setStep('creating_profile');
      return;
    }

    // Profile exists, check companion state
    if (profile) {
      // If profile has no companions listed at all → create egg
      if (profile.has.length === 0 && !profile.currentCompanion && !eggCreationAttempted.current) {
        setStep('creating_egg');
        return;
      }

      // If companions are still loading, wait
      if (companionsLoading) return;

      // If companions loaded but none found and profile.has is empty → create egg
      if (companions.length === 0 && profile.has.length === 0 && !eggCreationAttempted.current) {
        setStep('creating_egg');
        return;
      }

      // If exactly 1 companion that is an egg → flow is ready (tour takes over)
      if (companions.length === 1 && companions[0].stage === 'egg') {
        const noBabyOrAdult = !companions.some(c => c.stage === 'baby' || c.stage === 'adult');
        if (noBabyOrAdult && !profile.firstHatchTourDone) {
          setStep('ready');
          return;
        }
      }

      // Otherwise: user has existing Blobbis, not a first-egg scenario
      setStep('idle');
    }
  }, [profileLoading, profile, companionsLoading, companions, isProcessing, step]);

  // ─── Auto Profile Creation ────────────────────────────────────────────────

  useEffect(() => {
    if (step !== 'creating_profile') {
      profileCreationAttempted.current = false;
      return;
    }
    if (profileCreationAttempted.current || !user?.pubkey || profile) return;
    if (isProcessing) return;

    profileCreationAttempted.current = true;

    const createProfile = async () => {
      setIsProcessing(true);
      try {
        const name = suggestedName || 'Blobbonaut';
        const baseTags = buildBlobbonautTags(user.pubkey);
        const tagsWithName = [
          ...baseTags,
          ['name', name],
          ['coins', INITIAL_BLOBBONAUT_COINS.toString()],
        ];

        const event = await publishEvent({
          kind: KIND_BLOBBONAUT_PROFILE,
          content: '',
          tags: tagsWithName,
        });

        updateProfileEvent(event);
        invalidateProfile();

        // Profile created → next step is egg creation
        setStep('creating_egg');
      } catch (error) {
        console.error('[FirstEggExperience] Failed to create profile:', error);
        toast({
          title: 'Failed to create profile',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
        profileCreationAttempted.current = false;
        setStep('idle');
      } finally {
        setIsProcessing(false);
      }
    };

    createProfile();
  }, [step, user?.pubkey, profile, isProcessing, suggestedName, publishEvent, updateProfileEvent, invalidateProfile]);

  // ─── Auto Egg Creation ────────────────────────────────────────────────────

  useEffect(() => {
    if (step !== 'creating_egg') {
      eggCreationAttempted.current = false;
      return;
    }
    if (eggCreationAttempted.current || !user?.pubkey) return;
    if (isProcessing) return;

    // We need a profile to exist before creating an egg.
    // It may not be in the cache yet if we just created it.
    // Wait for next render cycle when profile is available.
    // If profileLoading, also wait.
    if (profileLoading) return;

    eggCreationAttempted.current = true;

    const createFirstEgg = async () => {
      setIsProcessing(true);
      try {
        // Generate the egg
        const preview = generateEggPreview(user.pubkey, 'Egg');
        const eggTags = previewToEventTags(preview);

        // Publish the egg event
        const eggEvent = await publishEvent({
          kind: KIND_BLOBBI_STATE,
          content: 'A new Blobbi egg!',
          tags: eggTags,
          created_at: preview.createdAt,
        });

        updateCompanionEvent(eggEvent);

        // Update profile: add to has[], NO coin deduction for first egg
        // Use profile from latest state or build minimal tags
        const currentProfile = profile;
        if (currentProfile) {
          const newHas = [...currentProfile.has, preview.d];
          const updatedProfileTags = updateBlobbonautTags(currentProfile.allTags, {
            has: newHas,
          });

          const profileEvent = await publishEvent({
            kind: KIND_BLOBBONAUT_PROFILE,
            content: '',
            tags: updatedProfileTags,
          });

          updateProfileEvent(profileEvent);
        } else {
          // Profile was just created but not yet in cache: build fresh tags
          const baseTags = buildBlobbonautTags(user.pubkey);
          const name = suggestedName || 'Blobbonaut';
          const freshTags = [
            ...baseTags,
            ['name', name],
            ['coins', INITIAL_BLOBBONAUT_COINS.toString()],
            ['has', preview.d],
          ];

          const profileEvent = await publishEvent({
            kind: KIND_BLOBBONAUT_PROFILE,
            content: '',
            tags: freshTags,
          });

          updateProfileEvent(profileEvent);
        }

        // Set localStorage selection
        setStoredSelectedD(preview.d);

        // Invalidate queries
        invalidateProfile();
        invalidateCompanion();

        // Egg created, flow is ready for hatch tour
        setStep('ready');
      } catch (error) {
        console.error('[FirstEggExperience] Failed to create first egg:', error);
        toast({
          title: 'Failed to create egg',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
        eggCreationAttempted.current = false;
        setStep('idle');
      } finally {
        setIsProcessing(false);
      }
    };

    createFirstEgg();
  }, [step, user?.pubkey, profile, profileLoading, isProcessing, suggestedName, publishEvent, updateProfileEvent, updateCompanionEvent, invalidateProfile, invalidateCompanion, setStoredSelectedD]);

  // ─── Derived State ──────────────────────────────────────────────────────────

  const isActive = step !== 'idle' && step !== 'done';

  const state: FirstEggExperienceState = useMemo(() => ({
    step,
    isProcessing,
    isActive,
  }), [step, isProcessing, isActive]);

  return { state };
}
