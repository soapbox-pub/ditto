/**
 * BlobbiOnboardingFlow - Main component that orchestrates the onboarding steps
 * 
 * This component renders the appropriate onboarding step based on the user's
 * actual profile state. The initial step is derived from whether the profile
 * exists - not hardcoded.
 * 
 * IMPORTANT: This component should only be rendered when:
 * - User has no profile (shows profile creation)
 * - User has profile but no pets (shows adoption)
 * 
 * If user has profile AND pets, the dashboard should be shown instead.
 */

import { useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useBlobbiOnboarding } from '../hooks/useBlobbiOnboarding';
import { BlobbiProfileOnboarding } from './BlobbiProfileOnboarding';
import { BlobbiAdoptionStep } from './BlobbiAdoptionStep';
import { BlobbiEggPreviewCard } from './BlobbiEggPreviewCard';
import { BlobbiAdoptionConfirmDialog } from './BlobbiAdoptionConfirmDialog';

import type { BlobbonautProfile } from '@/lib/blobbi';

interface BlobbiOnboardingFlowProps {
  /** Current profile (null if doesn't exist) */
  profile: BlobbonautProfile | null;
  /** Called to update profile event in cache after publishing */
  updateProfileEvent: (event: NostrEvent) => void;
  /** Called to update companion event in cache after publishing */
  updateCompanionEvent: (event: NostrEvent) => void;
  /** Called to invalidate profile query */
  invalidateProfile: () => void;
  /** Called to invalidate companion query */
  invalidateCompanion: () => void;
  /** Called to update localStorage selection */
  setStoredSelectedD: (d: string) => void;
  /** Called when onboarding is complete */
  onComplete?: () => void;
}

export function BlobbiOnboardingFlow({
  profile,
  updateProfileEvent,
  updateCompanionEvent,
  invalidateProfile,
  invalidateCompanion,
  setStoredSelectedD,
  onComplete,
}: BlobbiOnboardingFlowProps) {
  const [showAdoptConfirmDialog, setShowAdoptConfirmDialog] = useState(false);
  
  const {
    state,
    actions,
    suggestedName,
    coins,
  } = useBlobbiOnboarding({
    profile,
    updateProfileEvent,
    updateCompanionEvent,
    invalidateProfile,
    invalidateCompanion,
    setStoredSelectedD,
    onComplete,
  });
  
  // Debug logging
  console.log('[BlobbiOnboardingFlow] Rendering:', {
    hasProfile: !!profile,
    profileName: profile?.name,
    step: state.step,
    hasPreview: !!state.preview,
  });
  
  // Handle adopt button click - show confirmation dialog
  const handleAdoptClick = () => {
    setShowAdoptConfirmDialog(true);
  };
  
  // Handle confirm adoption
  const handleConfirmAdopt = async () => {
    await actions.adoptPreview();
    setShowAdoptConfirmDialog(false);
  };
  
  // ─── Step: Profile Creation ───────────────────────────────────────────────────
  // Only shown when user has no profile at all
  if (state.step === 'profile') {
    return (
      <BlobbiProfileOnboarding
        suggestedName={suggestedName}
        isCreating={state.isProcessing && state.actionInProgress === 'create-profile'}
        onCreateProfile={actions.createProfile}
      />
    );
  }
  
  // ─── Step: Adoption Question ──────────────────────────────────────────────────
  // Shown when profile exists but user has no pets yet
  if (state.step === 'adoption-question') {
    return (
      <BlobbiAdoptionStep
        blobbonautName={state.blobbonautName || profile?.name}
        onStartAdoption={actions.startAdoptionPreview}
      />
    );
  }
  
  // ─── Step: Egg Preview ────────────────────────────────────────────────────────
  // Shown when user is previewing/choosing an egg to adopt
  if (state.step === 'preview' && state.preview) {
    return (
      <>
        <BlobbiEggPreviewCard
          preview={state.preview}
          coins={coins}
          isFirstPreview={state.isFirstPreview}
          isProcessing={state.isProcessing}
          actionInProgress={state.actionInProgress === 'reroll' ? 'reroll' : state.actionInProgress === 'adopt' ? 'adopt' : null}
          onReroll={actions.rerollPreview}
          onAdopt={handleAdoptClick}
          onNameChange={actions.setPreviewName}
        />
        
        <BlobbiAdoptionConfirmDialog
          open={showAdoptConfirmDialog}
          onOpenChange={setShowAdoptConfirmDialog}
          preview={state.preview}
          coins={coins}
          isAdopting={state.isProcessing && state.actionInProgress === 'adopt'}
          onConfirm={handleConfirmAdopt}
        />
      </>
    );
  }
  
  // Fallback (shouldn't happen if parent logic is correct)
  console.warn('[BlobbiOnboardingFlow] Unexpected state - no matching step');
  return null;
}
