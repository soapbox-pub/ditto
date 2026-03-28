/**
 * BlobbiOnboardingFlow - Main component that orchestrates the onboarding steps
 * 
 * This component renders the appropriate onboarding step based on the user's
 * actual profile state. The initial step is derived from whether the profile
 * exists - not hardcoded.
 * 
 * MODES:
 * 1. Full onboarding (default): Auto profile creation → Adoption question → Preview
 * 2. Adoption only (adoptionOnly=true): Skip directly to Preview for existing profiles
 * 
 * IMPORTANT: This component should only be rendered when:
 * - User has no profile (auto-creates profile using kind 0 name)
 * - User has profile but no pets (shows adoption)
 * - User wants to adopt another Blobbi (adoptionOnly mode)
 * 
 * Profile creation is now automatic - no manual name entry step is needed.
 */

import { useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useBlobbiOnboarding } from '../hooks/useBlobbiOnboarding';
import { BlobbiAdoptionStep } from './BlobbiAdoptionStep';
import { BlobbiEggPreviewCard } from './BlobbiEggPreviewCard';
import { BlobbiAdoptionConfirmDialog } from './BlobbiAdoptionConfirmDialog';
import { Loader2 } from 'lucide-react';

import type { BlobbonautProfile } from '@/blobbi/core/lib/blobbi';

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
  /** 
   * If true, skip profile creation and adoption question, go directly to preview.
   * Use this for "Adopt another Blobbi" flow for existing users.
   */
  adoptionOnly?: boolean;
}

export function BlobbiOnboardingFlow({
  profile,
  updateProfileEvent,
  updateCompanionEvent,
  invalidateProfile,
  invalidateCompanion,
  setStoredSelectedD,
  onComplete,
  adoptionOnly = false,
}: BlobbiOnboardingFlowProps) {
  const [showAdoptConfirmDialog, setShowAdoptConfirmDialog] = useState(false);
  
  const {
    state,
    actions,
    coins,
  } = useBlobbiOnboarding({
    profile,
    updateProfileEvent,
    updateCompanionEvent,
    invalidateProfile,
    invalidateCompanion,
    setStoredSelectedD,
    onComplete,
    adoptionOnly,
  });
  
  // Debug logging
  console.log('[BlobbiOnboardingFlow] Rendering:', {
    hasProfile: !!profile,
    profileName: profile?.name,
    step: state.step,
    hasPreview: !!state.preview,
    adoptionOnly,
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
  
  // ─── Step: Auto Profile Creation ──────────────────────────────────────────────
  // Shows a loading state while profile is being auto-created
  if (state.step === 'creating-profile') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 p-8">
        <Loader2 className="size-10 text-primary animate-spin" />
        <p className="text-muted-foreground text-center">
          Setting up your profile...
        </p>
      </div>
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
