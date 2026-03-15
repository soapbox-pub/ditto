/**
 * BlobbiAdoptionStep - "Ready to adopt?" step of onboarding
 * 
 * Shows after profile creation, asking if the user wants to adopt their first Blobbi.
 * This is shown when the user has a profile but no pets yet.
 */

import { Egg, ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface BlobbiAdoptionStepProps {
  /** User's Blobbonaut name */
  blobbonautName: string | undefined;
  /** Called when user wants to start the adoption preview */
  onStartAdoption: () => void;
}

export function BlobbiAdoptionStep({
  blobbonautName,
  onStartAdoption,
}: BlobbiAdoptionStepProps) {
  const displayName = blobbonautName || 'Blobbonaut';
  
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
      <div className="flex flex-col items-center gap-6 text-center max-w-md w-full">
        {/* Hero Icon - Egg */}
        <div className="size-28 rounded-3xl bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-yellow-500/5 flex items-center justify-center shadow-lg animate-pulse">
          <Egg className="size-14 text-amber-500" />
        </div>
        
        {/* Title & Description */}
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold">
            Welcome, {displayName}!
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Your Blobbonaut profile is ready. Now it's time for the exciting part - 
            adopting your very first Blobbi!
          </p>
        </div>
        
        {/* Call to Action */}
        <div className="space-y-3 w-full mt-4">
          <p className="text-lg font-medium">
            Ready to adopt your first Blobbi?
          </p>
          
          <Button
            size="lg"
            onClick={onStartAdoption}
            className="w-full"
          >
            <Egg className="size-4 mr-2" />
            Let's Go!
            <ArrowRight className="size-4 ml-2" />
          </Button>
        </div>
        
        {/* Info Note */}
        <p className="text-xs text-muted-foreground mt-2">
          You'll be able to preview your egg and choose its name before adopting.
        </p>
      </div>
    </div>
  );
}
