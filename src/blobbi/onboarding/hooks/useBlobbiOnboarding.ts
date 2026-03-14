/**
 * useBlobbiOnboarding - Hook to manage Blobbi onboarding flow
 * 
 * This hook orchestrates the entire onboarding process:
 * 1. Profile creation with name
 * 2. Adoption question
 * 3. Egg preview with reroll/adopt
 * 
 * It manages:
 * - Onboarding step state
 * - Preview data (source of truth for adoption)
 * - Coins (from profile)
 * - Publishing profile and egg events
 */

import { useState, useCallback, useMemo } from 'react';

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
} from '@/lib/blobbi';

import {
  generateEggPreview,
  previewToEventTags,
  type BlobbiEggPreview,
} from '../lib/blobbi-preview';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OnboardingStep = 'profile' | 'adoption-question' | 'preview';

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
  /** Create profile with the given name */
  createProfile: (name: string) => Promise<void>;
  /** Start the adoption preview flow */
  startAdoptionPreview: () => void;
  /** Skip adoption for now */
  skipAdoption: () => void;
  /** Generate a new preview (reroll) */
  rerollPreview: () => Promise<void>;
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
}

export function useBlobbiOnboarding({
  profile,
  updateProfileEvent,
  updateCompanionEvent,
  invalidateProfile,
  invalidateCompanion,
  setStoredSelectedD,
  onComplete,
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
  
  const [step, setStep] = useState<OnboardingStep>('profile');
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<'create-profile' | 'reroll' | 'adopt' | null>(null);
  const [preview, setPreview] = useState<BlobbiEggPreview | null>(null);
  const [isFirstPreview, setIsFirstPreview] = useState(true);
  const [previewCoins] = useState(INITIAL_BLOBBONAUT_COINS);
  const [blobbonautName, setBlobbonautName] = useState<string | undefined>(undefined);
  
  // ─── Derived State ──────────────────────────────────────────────────────────
  
  // Coins: from profile if exists, otherwise from preview state
  const coins = profile?.coins ?? previewCoins;
  
  // ─── Actions ──────────────────────────────────────────────────────────────────
  
  /**
   * Create profile with name and initial coins
   */
  const createProfile = useCallback(async (name: string) => {
    if (!user?.pubkey) return;
    
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
        title: 'Profile created!',
        description: `Welcome to Blobbi, ${name}!`,
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
    } finally {
      setIsProcessing(false);
      setActionInProgress(null);
    }
  }, [user?.pubkey, publishEvent, updateProfileEvent, invalidateProfile]);
  
  /**
   * Start the adoption preview flow
   */
  const startAdoptionPreview = useCallback(() => {
    if (!user?.pubkey) return;
    
    // Generate first free preview
    const newPreview = generateEggPreview(user.pubkey);
    setPreview(newPreview);
    setIsFirstPreview(true);
    setStep('preview');
  }, [user?.pubkey]);
  
  /**
   * Skip adoption for now
   */
  const skipAdoption = useCallback(() => {
    onComplete?.();
  }, [onComplete]);
  
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
      
      // Then generate new preview
      const newPreview = generateEggPreview(user.pubkey);
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
  }, [user?.pubkey, profile, coins, publishEvent, updateProfileEvent, invalidateProfile]);
  
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
      
      // 2. Update profile: deduct coins, add to has, set current_companion
      const newCoins = coins - BLOBBI_ADOPTION_COST;
      const newHas = [...profile.has, preview.d];
      
      const profileUpdates: Record<string, string | string[]> = {
        coins: newCoins.toString(),
        has: newHas,
        current_companion: preview.d,
        onboarding_done: 'true',
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
        description: 'You adopted your first Blobbi!',
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
      createProfile,
      startAdoptionPreview,
      skipAdoption,
      rerollPreview,
      adoptPreview,
    },
    suggestedName,
    coins,
  };
}
