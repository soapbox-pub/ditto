/**
 * FirstHatchTourCard - DEPRECATED
 *
 * This component was used for the post-mission step of the first hatch tour.
 * The simplified first-egg experience no longer requires a post mission.
 *
 * Kept for backwards compatibility but no longer exported from the tour barrel.
 * The inline tap-hint messaging is now rendered directly in BlobbiPage.
 *
 * @deprecated Use inline tap hints in BlobbiPage instead
 */

import { MousePointerClick } from 'lucide-react';

import type { FirstHatchTourStepId } from '../lib/tour-types';

interface FirstHatchTourCardProps {
  blobbiName: string;
  currentStep: FirstHatchTourStepId | null;
}

export function FirstHatchTourCard({
  blobbiName,
  currentStep,
}: FirstHatchTourCardProps) {
  const capitalizedName = blobbiName.charAt(0).toUpperCase() + blobbiName.slice(1);

  const isClickStep = currentStep === 'egg_glowing_waiting_click'
    || currentStep === 'egg_crack_stage_1'
    || currentStep === 'egg_crack_stage_2'
    || currentStep === 'egg_crack_stage_3';

  if (!isClickStep) return null;

  return (
    <div className="w-full max-w-sm mx-auto space-y-4">
      <div className="text-center space-y-1.5">
        <h3 className="text-lg font-semibold">
          Tap {capitalizedName} to hatch!
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Tap the egg to help {capitalizedName} break free.
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <MousePointerClick className="size-4" />
        <span>Tap the egg</span>
      </div>
    </div>
  );
}
