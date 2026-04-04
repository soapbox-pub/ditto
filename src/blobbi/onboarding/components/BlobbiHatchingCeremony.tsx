/**
 * BlobbiHatchingCeremony - Immersive hatching experience for every new egg
 *
 * Used for BOTH first-time onboarding AND adopt-another flows.
 * The entire experience is distilled into a single, wordless, emotional moment:
 *
 *   1. A huge egg appears on a dark ambient screen. No text. No UI.
 *   2. Clicking the egg advances through crack stages with intensifying shakes.
 *   3. On the final click the egg bursts into blinding light - the hatch.
 *   4. A sentimental birth message fades in over a lingering glow.
 *   5. Tapping anywhere proceeds to a simple naming prompt.
 *   6. After naming, the ceremony completes and the Blobbi is born.
 *
 * Profile creation + egg event publishing happen silently in the background
 * as soon as the component mounts. No purchase required - no coins deducted.
 *
 * On completion, this component:
 * - Sets `blobbi_onboarding_done: 'true'` on the profile event
 * - Marks the first-hatch tour as completed in localStorage
 * This prevents the legacy first-hatch tour from ever activating.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

import {
  KIND_BLOBBI_STATE,
  KIND_BLOBBONAUT_PROFILE,
  INITIAL_BLOBBONAUT_COINS,
  buildBlobbonautTags,
  updateBlobbonautTags,
  type BlobbonautProfile,
} from '@/blobbi/core/lib/blobbi';

import {
  generateEggPreview,
  previewToEventTags,
  previewToBlobbiCompanion,
  type BlobbiEggPreview,
} from '../lib/blobbi-preview';

// ─── Phase Machine ────────────────────────────────────────────────────────────

type CeremonyPhase =
  | 'loading'       // Auto-creating profile + egg silently
  | 'egg'           // Huge egg, waiting for clicks
  | 'crack_1'       // First crack - light shake
  | 'crack_2'       // Second crack - medium shake
  | 'crack_3'       // Third crack - heavy shake
  | 'hatching'      // Egg bursts into light
  | 'birth'         // Sentimental text over lingering glow
  | 'naming'        // "Would you like to give your Blobbi a name?"
  | 'complete';     // Done - hand off to parent

// ─── Props ────────────────────────────────────────────────────────────────────

interface BlobbiHatchingCeremonyProps {
  /** Current profile (null if doesn't exist yet) */
  profile: BlobbonautProfile | null;
  /** Called to update profile event in cache */
  updateProfileEvent: (event: NostrEvent) => void;
  /** Called to update companion event in cache */
  updateCompanionEvent: (event: NostrEvent) => void;
  /** Called to invalidate profile query */
  invalidateProfile: () => void;
  /** Called to invalidate companion query */
  invalidateCompanion: () => void;
  /** Called to update localStorage selection */
  setStoredSelectedD: (d: string) => void;
  /** Called when the ceremony is complete */
  onComplete?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BlobbiHatchingCeremony({
  profile,
  updateProfileEvent,
  updateCompanionEvent,
  invalidateProfile,
  invalidateCompanion,
  setStoredSelectedD,
  onComplete,
}: BlobbiHatchingCeremonyProps) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { data: authorData } = useAuthor(user?.pubkey);

  // ── State ──
  const [phase, setPhase] = useState<CeremonyPhase>('loading');
  const [preview, setPreview] = useState<BlobbiEggPreview | null>(null);
  const [shakeClass, setShakeClass] = useState('');
  const [name, setName] = useState('');
  const [isNaming, setIsNaming] = useState(false);
  const [showGlow, setShowGlow] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [showLingerGlow, setShowLingerGlow] = useState(false);
  const [birthTextVisible, setBirthTextVisible] = useState(false);
  const [continuePromptVisible, setContinuePromptVisible] = useState(false);
  const [namingVisible, setNamingVisible] = useState(false);
  const [eggVisible, setEggVisible] = useState(false);

  const setupAttempted = useRef(false);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Companion for visual rendering
  const companionForVisual = useMemo(
    () => preview ? previewToBlobbiCompanion(preview) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preview?.d],
  );

  // Derive the egg's base color for accent tinting
  const eggColor = preview?.visualTraits.baseColor ?? '#f59e0b';

  // ── Silent setup: create profile (if needed) + egg in background ──
  useEffect(() => {
    if (setupAttempted.current || !user?.pubkey) return;
    setupAttempted.current = true;

    const setup = async () => {
      try {
        const currentProfile = profileRef.current;

        // 1. Create profile if it doesn't exist (first-time onboarding)
        // We track the latest tags separately so we can update them without
        // needing a fully-parsed BlobbonautProfile object.
        let latestProfileTags: string[][] | null = currentProfile?.allTags ?? null;

        if (!currentProfile) {
          const suggestedName =
            authorData?.metadata?.display_name ||
            authorData?.metadata?.name ||
            'Blobbonaut';

          const baseTags = buildBlobbonautTags(user.pubkey);
          const tagsWithName = [
            ...baseTags,
            ['name', suggestedName],
            ['coins', INITIAL_BLOBBONAUT_COINS.toString()],
          ];

          const profileEvent = await publishEvent({
            kind: KIND_BLOBBONAUT_PROFILE,
            content: '',
            tags: tagsWithName,
          });

          updateProfileEvent(profileEvent);
          invalidateProfile();
          latestProfileTags = tagsWithName;
        }

        // 2. Generate and publish egg (no coins deducted)
        const eggPreview = generateEggPreview(user.pubkey, 'Egg');
        setPreview(eggPreview);
        previewRef.current = eggPreview;

        const eggTags = previewToEventTags(eggPreview);
        const eggEvent = await publishEvent({
          kind: KIND_BLOBBI_STATE,
          content: 'A new Blobbi egg!',
          tags: eggTags,
          created_at: eggPreview.createdAt,
        });

        updateCompanionEvent(eggEvent);

        // 3. Update profile with has[] entry
        if (latestProfileTags) {
          // Extract existing has[] entries from tags
          const existingHas = latestProfileTags
            .filter(([k]) => k === 'has')
            .map(([, v]) => v);
          const newHas = [...existingHas, eggPreview.d];

          const updatedTags = updateBlobbonautTags(latestProfileTags, {
            has: newHas,
          });

          const updatedProfileEvent = await publishEvent({
            kind: KIND_BLOBBONAUT_PROFILE,
            content: '',
            tags: updatedTags,
          });

          updateProfileEvent(updatedProfileEvent);
        }

        setStoredSelectedD(eggPreview.d);
        invalidateProfile();
        invalidateCompanion();

        // Transition to egg phase
        setPhase('egg');

        // Animate egg entrance after a brief pause
        setTimeout(() => setEggVisible(true), 200);
      } catch (error) {
        console.error('[HatchingCeremony] Setup failed:', error);
        toast({
          title: 'Something went wrong',
          description: 'Failed to set up your Blobbi. Please try again.',
          variant: 'destructive',
        });
      }
    };

    // Small delay so the dark screen settles first
    const timer = setTimeout(setup, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.pubkey]);

  // Keep profileRef in sync with prop updates
  useEffect(() => {
    if (profile) {
      profileRef.current = profile;
    }
  }, [profile]);

  // ── Egg click handler ──
  const handleEggClick = useCallback(() => {
    if (phase === 'egg') {
      setShakeClass('animate-egg-onboard-shake-light');
      setTimeout(() => setShakeClass(''), 500);
      setPhase('crack_1');
    } else if (phase === 'crack_1') {
      setShakeClass('animate-egg-onboard-shake-medium');
      setTimeout(() => setShakeClass(''), 600);
      setPhase('crack_2');
    } else if (phase === 'crack_2') {
      setShakeClass('animate-egg-onboard-shake-heavy');
      setTimeout(() => setShakeClass(''), 700);
      setPhase('crack_3');
    } else if (phase === 'crack_3') {
      // Final click -> hatch!
      setPhase('hatching');
      setShowGlow(true);
      setShowFlash(true);

      // After burst animation, transition to birth phase
      setTimeout(() => {
        setShowFlash(false);
        setShowLingerGlow(true);
        setPhase('birth');

        // Fade in birth text
        setTimeout(() => setBirthTextVisible(true), 600);

        // Show continue prompt
        setTimeout(() => setContinuePromptVisible(true), 3500);
      }, 1400);
    }
  }, [phase]);

  // ── Birth screen click -> naming ──
  const handleBirthClick = useCallback(() => {
    if (phase !== 'birth' || !continuePromptVisible) return;

    // Fade out birth text, then show naming
    setBirthTextVisible(false);
    setContinuePromptVisible(false);

    setTimeout(() => {
      setPhase('naming');
      setTimeout(() => {
        setNamingVisible(true);
        // Focus the input after animation
        setTimeout(() => nameInputRef.current?.focus(), 400);
      }, 200);
    }, 800);
  }, [phase, continuePromptVisible]);

  // ── Complete ceremony: persist state so legacy tour never triggers ──
  const completeCeremony = useCallback(async (finalName: string) => {
    try {
      const currentPreview = previewRef.current;

      // 1. Update the egg event with the final name (if changed)
      if (currentPreview && finalName !== currentPreview.name) {
        const updatedTags = previewToEventTags({
          ...currentPreview,
          name: finalName,
        });

        const eggEvent = await publishEvent({
          kind: KIND_BLOBBI_STATE,
          content: 'A new Blobbi egg!',
          tags: updatedTags,
          created_at: currentPreview.createdAt,
        });

        updateCompanionEvent(eggEvent);
      }

      // 2. Mark onboarding done on the profile
      const currentProfile = profileRef.current;
      if (currentProfile) {
        const updatedTags = updateBlobbonautTags(currentProfile.allTags, {
          blobbi_onboarding_done: 'true',
        });

        const profileEvent = await publishEvent({
          kind: KIND_BLOBBONAUT_PROFILE,
          content: '',
          tags: updatedTags,
        });

        updateProfileEvent(profileEvent);
      }

      invalidateProfile();
      invalidateCompanion();
    } catch (error) {
      console.error('[HatchingCeremony] Failed to persist completion:', error);
      // Non-fatal - the egg was already created successfully
    }
  }, [publishEvent, updateCompanionEvent, updateProfileEvent, invalidateProfile, invalidateCompanion]);

  // ── Naming submit ──
  const handleNameSubmit = useCallback(async () => {
    if (isNaming) return;
    setIsNaming(true);

    const finalName = name.trim() || previewRef.current?.name || 'Egg';

    try {
      await completeCeremony(finalName);

      // Fade out naming, then complete
      setNamingVisible(false);
      setTimeout(() => {
        setPhase('complete');
        onComplete?.();
      }, 1000);
    } catch (error) {
      console.error('[HatchingCeremony] Naming failed:', error);
      toast({
        title: 'Failed to save name',
        description: 'Your Blobbi was created, but the name could not be saved.',
        variant: 'destructive',
      });
      // Complete anyway - the egg exists
      setPhase('complete');
      onComplete?.();
    } finally {
      setIsNaming(false);
    }
  }, [name, isNaming, completeCeremony, onComplete]);

  // Skip naming
  const handleSkipName = useCallback(async () => {
    const finalName = previewRef.current?.name || 'Egg';
    await completeCeremony(finalName);

    setNamingVisible(false);
    setTimeout(() => {
      setPhase('complete');
      onComplete?.();
    }, 1000);
  }, [completeCeremony, onComplete]);

  // ── Derive tour visual state for EggGraphic ──
  const tourVisualState = useMemo(() => {
    switch (phase) {
      case 'crack_1': return 'crack_stage_1' as const;
      case 'crack_2': return 'crack_stage_2' as const;
      case 'crack_3': return 'crack_stage_3' as const;
      case 'hatching': return 'opening' as const;
      default: return 'idle' as const;
    }
  }, [phase]);

  // ── Render ──

  // Loading phase - just a dark screen with subtle ambient glow
  if (phase === 'loading') {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div
          className="absolute size-32 rounded-full opacity-20 animate-pulse"
          style={{
            background: `radial-gradient(circle, ${eggColor}40 0%, transparent 70%)`,
          }}
        />
      </div>
    );
  }

  // Egg + Crack + Hatching phases
  const isEggPhase = phase === 'egg' || phase === 'crack_1' || phase === 'crack_2' || phase === 'crack_3';
  const isHatching = phase === 'hatching';
  const isBirth = phase === 'birth';
  const isNamingPhase = phase === 'naming';

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden select-none"
      style={{ background: 'radial-gradient(ellipse at center, #0a0a0f 0%, #000000 100%)' }}
      onClick={isBirth ? handleBirthClick : undefined}
    >
      {/* ── Ambient background glow (tinted to egg color) ── */}
      <div
        className="absolute inset-0 transition-opacity"
        style={{
          transitionDuration: '3000ms',
          background: `radial-gradient(ellipse at 50% 50%, ${eggColor}30 0%, transparent 60%)`,
          opacity: (isEggPhase || isHatching) ? 0.07 : isBirth ? 0.12 : 0.05,
        }}
      />

      {/* ── Floating particles (subtle, during egg phase) ── */}
      {isEggPhase && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: 2 + (i % 3),
                height: 2 + (i % 3),
                left: `${20 + (i * 12) % 60}%`,
                bottom: '40%',
                backgroundColor: `${eggColor}40`,
                animation: `onboard-particle-rise ${4 + i * 0.7}s ease-out ${i * 0.8}s infinite`,
              }}
            />
          ))}
        </div>
      )}

      {/* ── The Egg ── */}
      {(isEggPhase || isHatching) && companionForVisual && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={cn(
              'cursor-pointer transition-transform relative',
              eggVisible ? 'animate-egg-onboard-entrance' : 'opacity-0',
              isEggPhase && !shakeClass && 'animate-egg-onboard-breathe',
              shakeClass,
              isHatching && 'animate-egg-onboard-burst',
            )}
            onClick={isEggPhase ? handleEggClick : undefined}
          >
            {/* Glow ring behind egg */}
            <div
              className="absolute -inset-12 rounded-full blur-2xl transition-opacity duration-1000"
              style={{
                background: `radial-gradient(circle, ${eggColor}50 0%, transparent 70%)`,
                opacity: phase === 'crack_3' ? 0.5 : phase === 'crack_2' ? 0.35 : phase === 'crack_1' ? 0.25 : 0.15,
              }}
            />

            {/* The actual egg visual */}
            <BlobbiStageVisual
              companion={companionForVisual}
              size="lg"
              animated
              className="size-56 sm:size-64 md:size-72"
              tourVisualState={tourVisualState}
            />
          </div>
        </div>
      )}

      {/* ── Screen flash on hatch ── */}
      {showFlash && (
        <div
          className="absolute inset-0 bg-white animate-onboard-screen-flash pointer-events-none"
          style={{ zIndex: 60 }}
        />
      )}

      {/* ── Expanding glow on hatch ── */}
      {showGlow && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="size-64 rounded-full animate-onboard-glow-expand"
            style={{
              background: `radial-gradient(circle, ${eggColor}80 0%, ${eggColor}30 40%, transparent 70%)`,
            }}
          />
        </div>
      )}

      {/* ── Lingering glow (birth phase background) ── */}
      {showLingerGlow && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="size-[600px] rounded-full animate-onboard-glow-linger"
            style={{
              background: `radial-gradient(circle, ${eggColor}25 0%, ${eggColor}10 30%, transparent 60%)`,
            }}
          />
        </div>
      )}

      {/* ── Birth phase: sentimental text ── */}
      {isBirth && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-8">
          <div className={cn(
            'max-w-sm text-center space-y-6',
            birthTextVisible ? 'animate-onboard-text-reveal' : 'opacity-0',
          )}>
            <p className="text-2xl sm:text-3xl font-light text-white/90 leading-relaxed tracking-wide">
              Something extraordinary
              <br />
              just happened.
            </p>

            <div className={cn(
              birthTextVisible ? 'animate-onboard-text-reveal-delay' : 'opacity-0',
            )}>
              <p className="text-base sm:text-lg text-white/60 leading-relaxed font-light">
                A tiny life stirs in the warmth of your care.
                <br />
                <span className="text-white/40">
                  It knows only you.
                </span>
              </p>
            </div>
          </div>

          {continuePromptVisible && (
            <div className="absolute bottom-16 sm:bottom-24 animate-onboard-continue-pulse">
              <p className="text-xs text-white/30 tracking-widest uppercase">
                tap anywhere
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Naming phase ── */}
      {isNamingPhase && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-8">
          <div className={cn(
            'max-w-sm w-full text-center space-y-8',
            namingVisible ? 'animate-onboard-soft-fade-in' : 'opacity-0',
          )}>
            <div className="space-y-3">
              <p className="text-xl sm:text-2xl font-light text-white/85 leading-relaxed">
                Would you like to give
                <br />
                your Blobbi a name?
              </p>
            </div>

            <div className="space-y-4">
              <Input
                ref={nameInputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="A name, just for them..."
                maxLength={32}
                className={cn(
                  'text-center text-lg font-light h-12',
                  'bg-white/5 border-white/10 text-white placeholder:text-white/25',
                  'focus:border-white/30 focus:ring-white/10',
                )}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNameSubmit();
                }}
              />

              <div className="flex flex-col gap-3">
                <Button
                  onClick={handleNameSubmit}
                  disabled={isNaming}
                  className={cn(
                    'w-full h-11 text-base font-light tracking-wide',
                    'bg-white/10 hover:bg-white/15 text-white border border-white/10',
                  )}
                  variant="ghost"
                >
                  {name.trim() ? 'That\'s perfect' : 'Keep it as Egg'}
                </Button>

                {name.trim() === '' && (
                  <button
                    onClick={handleSkipName}
                    className="text-xs text-white/25 hover:text-white/40 transition-colors"
                  >
                    skip for now
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
