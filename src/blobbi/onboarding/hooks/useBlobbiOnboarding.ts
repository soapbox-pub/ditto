/**
 * useBlobbiOnboarding - Hook to manage Blobbi onboarding flow
 * 
 * This hook orchestrates the entire onboarding process:
 * 1. Auto profile creation (using kind 0 name, no user input needed)
 * 2. Adoption question (if profile exists but no pets)
 * 3. Egg preview with reroll/adopt
 * 
 * CRITICAL: The initial step is derived from the profile state, not hardcoded.
 * This ensures correct behavior on page refresh.
 * 
 * Profile creation is automatic - when the user enters Blobbi for the first time,
 * the profile is created using their kind 0 display_name/name, falling back to
 * "Blobbonaut" if no name is available. This eliminates the need for a manual
 * name entry step.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';

import {
  KIND_BLOBBI_STATE,
  KIND_BLOBBONAUT_PROFILE,
  INITIAL_BLOBBONAUT_COINS,
  BLOBBI_PREVIEW_REROLL_COST,
  BLOBBI_ADOPTION_COST,
  buildBlobbonautTags,
  updateBlobbonautTags,
  type BlobbonautProfile,
} from '@/blobbi/core/lib/blobbi';

import {
  generateEggPreview,
  updatePreviewName,
  previewToEventTags,
  type BlobbiEggPreview,
} from '../lib/blobbi-preview';

// ─── Types ────────────────────────────────────────────────────────────────────

/** 
 * Onboarding steps:
 * - 'creating-profile': Auto-creating profile (no user input needed)
 * - 'adoption-question': Ask if user wants to adopt a Blobbi
 * - 'preview': Show egg preview with reroll/adopt options
 */
export type OnboardingStep = 'creating-profile' | 'adoption-question' | 'preview';

export interface OnboardingState {
  /** Current step in the onboarding flow */
  step: OnboardingStep;
  /** Whether an action is in progress */
  isProcessing: boolean;
  /** Which specific action is processing */
  actionInProgress: 'create-profile' | 'reroll' | 'adopt' | null;
  /** Current preview (null until preview step) */
  preview: BlobbiEggPreview | null;
  /** Whether the current preview is the first (free) one */
  isFirstPreview: boolean;
  /** Temporary coins for preview phase (before profile exists) */
  previewCoins: number;
  /** Name set during profile creation (for adoption step display) */
  blobbonautName: string | undefined;
}

export interface OnboardingActions {
  /** Start the adoption preview flow */
  startAdoptionPreview: () => void;
  /** Generate a new preview (reroll) */
  rerollPreview: () => Promise<void>;
  /** Update the name in the current preview */
  setPreviewName: (name: string) => void;
  /** Adopt the current preview */
  adoptPreview: () => Promise<void>;
}

export interface UseBlobbiOnboardingResult {
  /** Current onboarding state */
  state: OnboardingState;
  /** Actions to control onboarding */
  actions: OnboardingActions;
  /** Suggested name from kind 0 metadata */
  suggestedName: string | undefined;
  /** Current coin balance (from profile or preview state) */
  coins: number;
}

// ─── Helper: Derive Initial Step ──────────────────────────────────────────────

/**
 * Derive the correct initial onboarding step based on profile state and mode.
 * 
 * Normal mode:
 * - No profile → 'creating-profile' (auto-create using kind 0 name)
 * - Profile exists, no pets → 'adoption-question'
 * - Profile exists with pets → should not be in onboarding at all
 * 
 * Adoption-only mode (for "Adopt another Blobbi"):
 * - Profile must exist → 'preview' (skip straight to egg preview)
 * - No profile → error case, should not happen
 */
function deriveInitialStep(
  profile: BlobbonautProfile | null, 
  adoptionOnly: boolean
): OnboardingStep {
  // Adoption-only mode: skip to preview if profile exists
  if (adoptionOnly && profile) {
    return 'preview';
  }
  
  if (!profile) {
    return 'creating-profile';
  }
  
  // Profile exists but no pets (normal onboarding)
  return 'adoption-question';
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseBlobbiOnboardingOptions {
  /** Current profile (null if doesn't exist) */
  profile: BlobbonautProfile | null;
  /** Called to update profile event in cache after publishing */
  updateProfileEvent: (event: import('@nostrify/nostrify').NostrEvent) => void;
  /** Called to update companion event in cache after publishing */
  updateCompanionEvent: (event: import('@nostrify/nostrify').NostrEvent) => void;
  /** Called to invalidate profile query */
  invalidateProfile: () => void;
  /** Called to invalidate companion query */
  invalidateCompanion: () => void;
  /** Called to update localStorage selection */
  setStoredSelectedD: (d: string) => void;
  /** Called when onboarding is complete */
  onComplete?: () => void;
  /** 
   * If true, skip profile creation and adoption question, go directly to preview.
   * Use this for "Adopt another Blobbi" flow for existing users.
   * Requires profile to be non-null.
   */
  adoptionOnly?: boolean;
}

export function useBlobbiOnboarding({
  profile,
  updateProfileEvent,
  updateCompanionEvent,
  invalidateProfile,
  invalidateCompanion,
  setStoredSelectedD,
  onComplete,
  adoptionOnly = false,
}: UseBlobbiOnboardingOptions): UseBlobbiOnboardingResult {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  
  // Get kind 0 metadata for name suggestion
  const { data: authorData } = useAuthor(user?.pubkey);
  
  // Suggested name from kind 0: display_name > name > undefined
  const suggestedName = useMemo(() => {
    if (!authorData?.metadata) return undefined;
    return authorData.metadata.display_name || authorData.metadata.name || undefined;
  }, [authorData?.metadata]);
  
  // ─── State ────────────────────────────────────────────────────────────────────
  
  // Derive initial step from profile and adoptionOnly mode
  const initialStep = deriveInitialStep(profile, adoptionOnly);
  
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<'create-profile' | 'reroll' | 'adopt' | null>(null);
  
  // For adoption-only mode, generate preview immediately
  const [preview, setPreview] = useState<BlobbiEggPreview | null>(() => {
    if (adoptionOnly && profile && user?.pubkey) {
      // Generate initial preview for adoption-only mode
      return generateEggPreview(user.pubkey, 'Egg');
    }
    return null;
  });
  const [isFirstPreview, setIsFirstPreview] = useState(true);
  const [previewCoins] = useState(INITIAL_BLOBBONAUT_COINS);
  const [blobbonautName, setBlobbonautName] = useState<string | undefined>(profile?.name);
  
  // ─── Sync step with profile changes ─────────────────────────────────────────
  // Ensure step is ALWAYS correct based on profile state.
  // This handles all cases: initial mount, cache load, relay fetch, profile creation.
  // NOTE: In adoptionOnly mode, we don't auto-transition based on profile state changes.
  useEffect(() => {
    // Skip sync logic in adoptionOnly mode - step is explicitly controlled
    if (adoptionOnly) {
      console.log('[useBlobbiOnboarding] adoptionOnly mode - skipping auto-sync');
      return;
    }
    
    const correctStep = deriveInitialStep(profile, false);
    
    // Debug log
    console.log('[useBlobbiOnboarding] State sync check:', {
      hasProfile: !!profile,
      profileName: profile?.name,
      profileHasLength: profile?.has?.length ?? 0,
      currentStep: step,
      derivedStep: correctStep,
    });
    
    // Case 1: Step is 'creating-profile' but profile exists → move to 'adoption-question'
    // This handles profile loading from cache/relay after initial render
    if (step === 'creating-profile' && profile) {
      console.log('[useBlobbiOnboarding] Profile loaded, moving to adoption-question');
      setStep('adoption-question');
      setBlobbonautName(profile.name);
      return;
    }
    
    // Case 2: Step is 'adoption-question' but no profile → move back to 'creating-profile'
    // This handles edge cases where profile becomes null (shouldn't happen normally)
    if (step === 'adoption-question' && !profile) {
      console.log('[useBlobbiOnboarding] Profile lost, moving back to creating-profile');
      setStep('creating-profile');
      setBlobbonautName(undefined);
      return;
    }
    
    // Case 3: Step is 'preview' but no profile → move back to 'creating-profile'
    // User somehow got to preview without a profile (shouldn't happen)
    if (step === 'preview' && !profile) {
      console.log('[useBlobbiOnboarding] No profile in preview step, moving back to creating-profile');
      setStep('creating-profile');
      setPreview(null);
      setBlobbonautName(undefined);
      return;
    }
  }, [profile, step, adoptionOnly]);
  
  // ─── Derived State ──────────────────────────────────────────────────────────
  
  // Coins: from profile if exists, otherwise from preview state
  const coins = profile?.coins ?? previewCoins;
  
  // ─── Auto Profile Creation ────────────────────────────────────────────────────
  
  // Track if we've already attempted to create profile (to avoid duplicates)
  const profileCreationAttempted = useRef(false);
  
  /**
   * Auto-create profile when step is 'creating-profile'.
   * Uses the user's kind 0 name, falling back to "Blobbonaut" if not available.
   */
  useEffect(() => {
    // Only run when step is 'creating-profile'
    if (step !== 'creating-profile') {
      profileCreationAttempted.current = false; // Reset when leaving this step
      return;
    }
    
    // Skip if already attempting or no user
    if (profileCreationAttempted.current || !user?.pubkey) return;
    
    // Skip if profile already exists (loading from cache/relay)
    if (profile) return;
    
    // Skip if already processing
    if (isProcessing) return;
    
    // Mark as attempted to prevent duplicate calls
    profileCreationAttempted.current = true;
    
    // Determine the name to use: kind 0 name or fallback
    const name = suggestedName || 'Blobbonaut';
    
    console.log('[useBlobbiOnboarding] Auto-creating profile with name:', name);
    
    const createProfileAsync = async () => {
      setIsProcessing(true);
      setActionInProgress('create-profile');
      
      try {
        // Build tags with name and initial coins
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
        setBlobbonautName(name);
        invalidateProfile();
        
        toast({
          title: 'Welcome to Blobbi!',
          description: `Your profile has been created, ${name}!`,
        });
        
        // Move to adoption question step
        setStep('adoption-question');
      } catch (error) {
        console.error('Failed to create profile:', error);
        toast({
          title: 'Failed to create profile',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
        // Reset so user can retry
        profileCreationAttempted.current = false;
      } finally {
        setIsProcessing(false);
        setActionInProgress(null);
      }
    };
    
    createProfileAsync();
  }, [step, user?.pubkey, profile, isProcessing, suggestedName, publishEvent, updateProfileEvent, invalidateProfile]);
  
  // ─── Actions ──────────────────────────────────────────────────────────────────
  
  /**
   * Start the adoption preview flow
   */
  const startAdoptionPreview = useCallback(() => {
    if (!user?.pubkey) return;
    
    // Generate first free preview with a default name
    const newPreview = generateEggPreview(user.pubkey, 'Egg');
    setPreview(newPreview);
    setIsFirstPreview(true);
    setStep('preview');
  }, [user?.pubkey]);
  
  /**
   * Update the name in the current preview
   */
  const setPreviewName = useCallback((name: string) => {
    if (!preview) return;
    setPreview(updatePreviewName(preview, name));
  }, [preview]);
  
  /**
   * Generate a new preview (reroll) - costs coins
   */
  const rerollPreview = useCallback(async () => {
    if (!user?.pubkey || !profile) return;
    
    // Check if can afford
    if (coins < BLOBBI_PREVIEW_REROLL_COST) {
      toast({
        title: 'Not enough coins',
        description: `You need ${BLOBBI_PREVIEW_REROLL_COST} coins to try another.`,
        variant: 'destructive',
      });
      return;
    }
    
    setIsProcessing(true);
    setActionInProgress('reroll');
    
    try {
      // First, deduct coins from profile
      const newCoins = coins - BLOBBI_PREVIEW_REROLL_COST;
      const updatedTags = updateBlobbonautTags(profile.allTags, {
        coins: newCoins.toString(),
      });
      
      const profileEvent = await publishEvent({
        kind: KIND_BLOBBONAUT_PROFILE,
        content: '',
        tags: updatedTags,
      });
      
      updateProfileEvent(profileEvent);
      
      // Preserve the current name when rerolling
      const currentName = preview?.name ?? 'Egg';
      
      // Debug: log previous preview identity
      console.log('[Reroll] Previous preview:', {
        d: preview?.d,
        seed: preview?.seed?.slice(0, 16) + '...',
        petId: preview?.petId,
      });
      
      // Then generate new preview with the same name
      const newPreview = generateEggPreview(user.pubkey, currentName);
      
      // Debug: log new preview identity
      console.log('[Reroll] New preview:', {
        d: newPreview.d,
        seed: newPreview.seed.slice(0, 16) + '...',
        petId: newPreview.petId,
        visualTraits: {
          baseColor: newPreview.visualTraits.baseColor,
          pattern: newPreview.visualTraits.pattern,
        },
      });
      
      setPreview(newPreview);
      setIsFirstPreview(false);
      
      invalidateProfile();
    } catch (error) {
      console.error('Failed to reroll preview:', error);
      toast({
        title: 'Failed to generate preview',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
      setActionInProgress(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- preview identity (d/seed/petId) only used for debug logs
  }, [user?.pubkey, profile, coins, preview?.name, publishEvent, updateProfileEvent, invalidateProfile]);
  
  /**
   * Adopt the current preview - costs coins and creates the Blobbi event
   */
  const adoptPreview = useCallback(async () => {
    if (!user?.pubkey || !profile || !preview) return;
    
    // Check if can afford
    if (coins < BLOBBI_ADOPTION_COST) {
      toast({
        title: 'Not enough coins',
        description: `You need ${BLOBBI_ADOPTION_COST} coins to adopt.`,
        variant: 'destructive',
      });
      return;
    }
    
    setIsProcessing(true);
    setActionInProgress('adopt');
    
    try {
      // 1. Publish the Blobbi egg event using exact preview data
      const eggTags = previewToEventTags(preview);
      
      const eggEvent = await publishEvent({
        kind: KIND_BLOBBI_STATE,
        content: 'A new Blobbi egg!',
        tags: eggTags,
        created_at: preview.createdAt,
      });
      
      updateCompanionEvent(eggEvent);
      
      // 2. Update profile: deduct coins, add to has, mark onboarding done
      // NOTE: We do NOT set current_companion here because the adopted Blobbi
      // is still an egg. The companion mechanic only becomes available after hatching.
      // Eggs should never be auto-assigned as the floating companion.
      const newCoins = coins - BLOBBI_ADOPTION_COST;
      const newHas = [...profile.has, preview.d];
      
      const profileUpdates: Record<string, string | string[]> = {
        coins: newCoins.toString(),
        has: newHas,
        blobbi_onboarding_done: 'true',
      };
      
      const updatedProfileTags = updateBlobbonautTags(profile.allTags, profileUpdates);
      
      const profileEvent = await publishEvent({
        kind: KIND_BLOBBONAUT_PROFILE,
        content: '',
        tags: updatedProfileTags,
      });
      
      updateProfileEvent(profileEvent);
      
      // 3. Set localStorage selection to the new Blobbi
      setStoredSelectedD(preview.d);
      
      // 4. Invalidate queries
      invalidateProfile();
      invalidateCompanion();
      
      toast({
        title: 'Congratulations!',
        description: `You adopted ${preview.name}!`,
      });
      
      // 5. Complete onboarding
      onComplete?.();
    } catch (error) {
      console.error('Failed to adopt Blobbi:', error);
      toast({
        title: 'Failed to adopt',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
      setActionInProgress(null);
    }
  }, [user?.pubkey, profile, preview, coins, publishEvent, updateCompanionEvent, updateProfileEvent, setStoredSelectedD, invalidateProfile, invalidateCompanion, onComplete]);
  
  // ─── Return ─────────────────────────────────────────────────────────────────
  
  return {
    state: {
      step,
      isProcessing,
      actionInProgress,
      preview,
      isFirstPreview,
      previewCoins,
      blobbonautName,
    },
    actions: {
      startAdoptionPreview,
      rerollPreview,
      setPreviewName,
      adoptPreview,
    },
    suggestedName,
    coins,
  };
}
