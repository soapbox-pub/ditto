/**
 * BlobbiOnboardingFlow - Immersive hatching ceremony for every new Blobbi
 *
 * Every new egg goes through the hatching ceremony - whether it's a user's
 * first Blobbi or their tenth. The ceremony creates the egg silently in the
 * background and presents a wordless, emotional hatching experience.
 *
 * The `adoptionOnly` prop is accepted for API compatibility but no longer
 * changes the flow - every egg gets the full ceremony.
 */

import type { NostrEvent } from '@nostrify/nostrify';

import { BlobbiHatchingCeremony } from './BlobbiHatchingCeremony';

import type { BlobbonautProfile, BlobbiCompanion } from '@/blobbi/core/lib/blobbi';

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
  /** If provided, skip egg creation and use this existing egg for the ceremony. */
  existingCompanion?: BlobbiCompanion | null;
  /**
   * Accepted for API compatibility. Every new egg goes through the ceremony.
   * @deprecated No longer changes the flow.
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
  existingCompanion,
  adoptionOnly,
}: BlobbiOnboardingFlowProps) {
  return (
    <BlobbiHatchingCeremony
      profile={profile}
      updateProfileEvent={updateProfileEvent}
      updateCompanionEvent={updateCompanionEvent}
      invalidateProfile={invalidateProfile}
      invalidateCompanion={invalidateCompanion}
      setStoredSelectedD={setStoredSelectedD}
      onComplete={onComplete}
      existingCompanion={existingCompanion}
      eggOnly={adoptionOnly}
    />
  );
}
