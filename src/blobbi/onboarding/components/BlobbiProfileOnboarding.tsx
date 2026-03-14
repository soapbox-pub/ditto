/**
 * BlobbiProfileOnboarding - Profile creation step of onboarding
 * 
 * Shows a friendly welcome screen where users can set their Blobbonaut name.
 * The name is pre-filled from their Nostr kind 0 profile if available.
 */

import { useState, useEffect } from 'react';
import { Loader2, Sparkles, User } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface BlobbiProfileOnboardingProps {
  /** Suggested name from kind 0 metadata */
  suggestedName: string | undefined;
  /** Whether the profile is being created */
  isCreating: boolean;
  /** Called when user confirms profile creation */
  onCreateProfile: (name: string) => void;
}

export function BlobbiProfileOnboarding({
  suggestedName,
  isCreating,
  onCreateProfile,
}: BlobbiProfileOnboardingProps) {
  const [name, setName] = useState('');
  const [hasSetInitialValue, setHasSetInitialValue] = useState(false);
  
  // Pre-fill name from kind 0 metadata once available
  useEffect(() => {
    if (suggestedName && !hasSetInitialValue) {
      setName(suggestedName);
      setHasSetInitialValue(true);
    }
  }, [suggestedName, hasSetInitialValue]);
  
  const trimmedName = name.trim();
  const isValidName = trimmedName.length > 0;
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValidName && !isCreating) {
      onCreateProfile(trimmedName);
    }
  };
  
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
      <div className="flex flex-col items-center gap-6 text-center max-w-md w-full">
        {/* Hero Icon */}
        <div className="size-24 rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 flex items-center justify-center shadow-lg">
          <Sparkles className="size-12 text-primary" />
        </div>
        
        {/* Title & Description */}
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold">
            Welcome to Blobbi!
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Create your Blobbonaut profile to start caring for virtual pets on Nostr.
            Your journey begins with a name!
          </p>
        </div>
        
        {/* Profile Creation Form */}
        <form onSubmit={handleSubmit} className="w-full space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="blobbonaut-name" className="text-left block">
              Your Blobbonaut Name
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                id="blobbonaut-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name..."
                disabled={isCreating}
                className="pl-10"
                autoFocus
              />
            </div>
            {suggestedName && !hasSetInitialValue && (
              <p className="text-xs text-muted-foreground text-left">
                Suggested from your Nostr profile
              </p>
            )}
          </div>
          
          <Button
            type="submit"
            size="lg"
            disabled={!isValidName || isCreating}
            className="w-full"
          >
            {isCreating ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Creating Profile...
              </>
            ) : (
              <>
                <Sparkles className="size-4 mr-2" />
                Create My Profile
              </>
            )}
          </Button>
        </form>
        
        {/* Info Note */}
        <p className="text-xs text-muted-foreground mt-2">
          You can change your name later in settings.
        </p>
      </div>
    </div>
  );
}
