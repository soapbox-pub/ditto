/**
 * BlobbiHatchingCeremony - Immersive hatching experience for every new egg
 *
 * Flow:
 *   1. Dark screen, egg silently created in background
 *   2. Huge breathing egg appears. No text. No UI.
 *   3. Click egg 4 times through crack stages with intensifying shakes
 *   4. Final click -> egg bursts into light, actual hatch mutation fires
 *   5. Flash clears -> hatched baby blobbi revealed center screen with glow/sparkles
 *   6. Typewriter dialog appears below blobbi (click to complete line / advance)
 *   7. Naming prompt, then ceremony complete
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
  STAT_MAX,
  buildBlobbonautTags,
  updateBlobbonautTags,
  updateBlobbiTags,
  type BlobbonautProfile,
  type BlobbiCompanion,
} from '@/blobbi/core/lib/blobbi';

import {
  generateEggPreview,
  previewToEventTags,
  previewToBlobbiCompanion,
  type BlobbiEggPreview,
} from '../lib/blobbi-preview';

// ─── Dialog Lines ─────────────────────────────────────────────────────────────

const BIRTH_DIALOG: string[] = [
  'Something stirs...',
  'A tiny life has chosen you. It knows only warmth, and your presence.',
];

const NAMING_DIALOG = 'Every life deserves a name.\nWhat will you call this one?';

// ─── Phase Machine ────────────────────────────────────────────────────────────

type CeremonyPhase =
  | 'loading'
  | 'egg'
  | 'crack_1'
  | 'crack_2'
  | 'crack_3'
  | 'hatching'    // egg burst + hatch mutation
  | 'reveal'      // flash clearing, baby blobbi fading in with glow
  | 'dialog'      // typewriter dialog lines
  | 'naming'
  | 'complete';

// ─── Typewriter Hook ──────────────────────────────────────────────────────────

function useTypewriter(fullText: string, active: boolean, speed = 35) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const indexRef = useRef(0);

  // Reset when text changes
  useEffect(() => {
    setDisplayed('');
    setDone(false);
    indexRef.current = 0;
  }, [fullText]);

  // Run typewriter
  useEffect(() => {
    if (!active || done) return;

    intervalRef.current = setInterval(() => {
      indexRef.current++;
      const next = fullText.slice(0, indexRef.current);
      setDisplayed(next);
      if (indexRef.current >= fullText.length) {
        setDone(true);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, speed);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active, done, fullText, speed]);

  const complete = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setDisplayed(fullText);
    setDone(true);
  }, [fullText]);

  return { displayed, done, complete };
}

// Module-level guard: prevents duplicate egg creation if the component remounts
// (e.g. React strict mode, parent re-render causing unmount/remount).
// Tracks pubkeys that have already started setup in this browser session.
const setupInFlightFor = new Set<string>();

// ─── Props ────────────────────────────────────────────────────────────────────

interface BlobbiHatchingCeremonyProps {
  profile: BlobbonautProfile | null;
  updateProfileEvent: (event: NostrEvent) => void;
  updateCompanionEvent: (event: NostrEvent) => void;
  invalidateProfile: () => void;
  invalidateCompanion: () => void;
  setStoredSelectedD: (d: string) => void;
  onComplete?: () => void;
  /** If provided, skip egg creation and start from the cracking phase with this existing egg. */
  existingCompanion?: BlobbiCompanion | null;
  /** If true, only create the egg and skip the hatching ceremony. The egg stays an egg. */
  eggOnly?: boolean;
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
  existingCompanion,
  eggOnly = false,
}: BlobbiHatchingCeremonyProps) {
  const isExistingEgg = !!existingCompanion;
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { data: authorData } = useAuthor(user?.pubkey);

  // ── Core state ──
  const [phase, setPhase] = useState<CeremonyPhase>('loading');
  const [preview, setPreview] = useState<BlobbiEggPreview | null>(null);
  const [name, setName] = useState(existingCompanion?.name ?? '');
  const [isNaming, setIsNaming] = useState(false);
  const [eggVisible, setEggVisible] = useState(false);

  // Reveal phase state
  const [blobbiVisible, setBlobbiVisible] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [showRevealGlow, setShowRevealGlow] = useState(false);

  // Dialog state
  const [dialogLineIndex, setDialogLineIndex] = useState(0);
  const [dialogActive, setDialogActive] = useState(false);
  const [namingVisible, setNamingVisible] = useState(false);

  // Refs
  const setupAttempted = useRef(false);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const nameInputRef = useRef<HTMLInputElement>(null);
  const eggContainerRef = useRef<HTMLDivElement>(null);
  const entrancePlayed = useRef(false);
  const eggTagsRef = useRef<string[][] | null>(null);

  // ── Companion visuals ──
  const eggCompanion = useMemo(
    () => preview ? previewToBlobbiCompanion(preview) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preview?.d],
  );

  // Baby companion (same visual data but stage=baby)
  const babyCompanion = useMemo((): BlobbiCompanion | null => {
    if (!eggCompanion) return null;
    return { ...eggCompanion, stage: 'baby', state: 'active' };
  }, [eggCompanion]);

  const eggColor = preview?.visualTraits.baseColor ?? '#f59e0b';

  // ── Typewriter for current dialog line ──
  const currentDialogText = phase === 'dialog' ? (BIRTH_DIALOG[dialogLineIndex] ?? '') : '';
  const dialogTypewriter = useTypewriter(currentDialogText, dialogActive);

  const namingTypewriter = useTypewriter(NAMING_DIALOG, namingVisible);

  // ── Fast-path setup for existing eggs (no publishing needed) ──
  useEffect(() => {
    if (!isExistingEgg || setupAttempted.current || !existingCompanion) return;
    setupAttempted.current = true;

    // Build a minimal preview from the existing companion
    const fakePreview: BlobbiEggPreview = {
      d: existingCompanion.d,
      petId: existingCompanion.d,
      ownerPubkey: user?.pubkey ?? '',
      name: existingCompanion.name,
      stage: 'egg',
      state: 'active',
      seed: existingCompanion.seed ?? '',
      stats: {
        hunger: existingCompanion.stats.hunger ?? STAT_MAX,
        happiness: existingCompanion.stats.happiness ?? STAT_MAX,
        health: existingCompanion.stats.health ?? STAT_MAX,
        hygiene: existingCompanion.stats.hygiene ?? STAT_MAX,
        energy: existingCompanion.stats.energy ?? STAT_MAX,
      },
      visualTraits: existingCompanion.visualTraits,
      createdAt: Math.floor(Date.now() / 1000),
    };
    setPreview(fakePreview);
    previewRef.current = fakePreview;
    eggTagsRef.current = existingCompanion.allTags;

    setPhase('egg');
    setTimeout(() => setEggVisible(true), 200);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExistingEgg, existingCompanion?.d]);

  // ── Silent setup: create profile + egg (new egg flow only) ──
  useEffect(() => {
    if (isExistingEgg) return; // Skip for existing eggs
    if (setupAttempted.current || !user?.pubkey) return;
    // Module-level guard: if another mount already started setup for this pubkey, skip
    if (setupInFlightFor.has(user.pubkey)) return;
    setupAttempted.current = true;
    setupInFlightFor.add(user.pubkey);

    const setup = async () => {
      try {
        const currentProfile = profileRef.current;
        let latestProfileTags: string[][] | null = currentProfile?.allTags ?? null;

        // 1. Create profile if needed
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

        // 2. Generate and publish egg
        const eggPreview = generateEggPreview(user.pubkey, 'Egg');
        setPreview(eggPreview);
        previewRef.current = eggPreview;

        const eggTags = previewToEventTags(eggPreview);
        eggTagsRef.current = eggTags;

        const eggEvent = await publishEvent({
          kind: KIND_BLOBBI_STATE,
          content: 'A new Blobbi egg!',
          tags: eggTags,
          created_at: eggPreview.createdAt,
        });

        updateCompanionEvent(eggEvent);

        // 3. Update profile with has[] entry
        if (latestProfileTags) {
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

        setPhase('egg');
        setTimeout(() => setEggVisible(true), 200);
      } catch (error) {
        console.error('[HatchingCeremony] Setup failed:', error);
        toast({
          title: 'Something went wrong',
          description: 'Failed to set up your Blobbi. Please try again.',
          variant: 'destructive',
        });
      } finally {
        // Clear module-level guard so future adoptions can create new eggs
        if (user?.pubkey) setupInFlightFor.delete(user.pubkey);
      }
    };

    const timer = setTimeout(setup, 600);
    return () => {
      clearTimeout(timer);
      // If the timer was cleared before setup ran, release the guard
      if (user?.pubkey) setupInFlightFor.delete(user.pubkey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.pubkey]);

  useEffect(() => {
    if (profile) profileRef.current = profile;
  }, [profile]);

  // eggOnly mode: auto-complete after the egg is shown (skip hatching)
  useEffect(() => {
    if (!eggOnly || !eggVisible) return;
    const timer = setTimeout(() => {
      setPhase('complete');
      onComplete?.();
    }, 1500);
    return () => clearTimeout(timer);
  }, [eggOnly, eggVisible, onComplete]);

  // Play entrance animation once
  useEffect(() => {
    if (eggVisible && !entrancePlayed.current && eggContainerRef.current) {
      entrancePlayed.current = true;
      const el = eggContainerRef.current;
      el.classList.add('animate-egg-onboard-entrance');
      const onEnd = () => {
        el.classList.remove('animate-egg-onboard-entrance');
        el.removeEventListener('animationend', onEnd);
      };
      el.addEventListener('animationend', onEnd);
    }
  }, [eggVisible]);

  // ── Shake (DOM-only, no re-render) ──
  const triggerShake = useCallback((cls: string) => {
    const el = eggContainerRef.current;
    if (!el) return;
    el.classList.remove(
      'animate-egg-onboard-shake-light',
      'animate-egg-onboard-shake-medium',
      'animate-egg-onboard-shake-heavy',
    );
    void el.offsetWidth;
    el.classList.add(cls);
  }, []);

  // ── Execute the actual hatch: egg -> baby ──
  const executeHatch = useCallback(async () => {
    const tags = eggTagsRef.current;
    if (!tags) return;

    const now = Math.floor(Date.now() / 1000);
    const nowStr = now.toString();

    const babyTags = updateBlobbiTags(tags, {
      stage: 'baby',
      state: 'active',
      hunger: STAT_MAX.toString(),
      happiness: STAT_MAX.toString(),
      health: STAT_MAX.toString(),
      hygiene: STAT_MAX.toString(),
      energy: STAT_MAX.toString(),
      last_interaction: nowStr,
      last_decay_at: nowStr,
    });

    const babyName = previewRef.current?.name ?? 'Egg';
    const event = await publishEvent({
      kind: KIND_BLOBBI_STATE,
      content: `${babyName} is a baby Blobbi.`,
      tags: babyTags,
    });

    eggTagsRef.current = babyTags;
    updateCompanionEvent(event);
    invalidateCompanion();
  }, [publishEvent, updateCompanionEvent, invalidateCompanion]);

  // ── Egg click ──
  const handleEggClick = useCallback(() => {
    if (phase === 'egg') {
      triggerShake('animate-egg-onboard-shake-light');
      setPhase('crack_1');
    } else if (phase === 'crack_1') {
      triggerShake('animate-egg-onboard-shake-medium');
      setPhase('crack_2');
    } else if (phase === 'crack_2') {
      triggerShake('animate-egg-onboard-shake-heavy');
      setPhase('crack_3');
    } else if (phase === 'crack_3') {
      // Final click -> hatch!
      setPhase('hatching');
      setShowFlash(true);

      // Fire the actual hatch mutation
      executeHatch().catch(console.error);

      // After flash, reveal the baby
      setTimeout(() => {
        setShowFlash(false);
        setShowRevealGlow(true);
        setPhase('reveal');

        // Fade in blobbi
        setTimeout(() => setBlobbiVisible(true), 400);

        // After blobbi settles, start dialog
        setTimeout(() => {
          setPhase('dialog');
          setDialogLineIndex(0);
          setDialogActive(true);
        }, 2200);
      }, 1400);
    }
  }, [phase, triggerShake, executeHatch]);

  // ── Dialog click: complete line or advance ──
  const handleDialogClick = useCallback(() => {
    if (phase !== 'dialog') return;

    if (!dialogTypewriter.done) {
      // Complete the current line instantly
      dialogTypewriter.complete();
      return;
    }

    // Advance to next line
    const nextIndex = dialogLineIndex + 1;
    if (nextIndex < BIRTH_DIALOG.length) {
      setDialogActive(false);
      setDialogLineIndex(nextIndex);
      // Small pause before next line starts
      setTimeout(() => setDialogActive(true), 150);
    } else {
      // All lines done -> naming
      setDialogActive(false);
      setTimeout(() => {
        setPhase('naming');
        setTimeout(() => {
          setNamingVisible(true);
          setTimeout(() => nameInputRef.current?.focus(), 600);
        }, 200);
      }, 400);
    }
  }, [phase, dialogTypewriter, dialogLineIndex]);

  // ── Complete ceremony ──
  const completeCeremony = useCallback(async (finalName: string) => {
    try {
      // Update egg/baby name if changed
      const currentTags = eggTagsRef.current;
      if (currentTags && finalName !== (previewRef.current?.name ?? 'Egg')) {
        const namedTags = updateBlobbiTags(currentTags, { name: finalName });
        const event = await publishEvent({
          kind: KIND_BLOBBI_STATE,
          content: `${finalName} is a baby Blobbi.`,
          tags: namedTags,
        });
        updateCompanionEvent(event);
      }

      // Mark onboarding done
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
    }
  }, [publishEvent, updateCompanionEvent, updateProfileEvent, invalidateProfile, invalidateCompanion]);

  // ── Naming submit ──
  const handleNameSubmit = useCallback(async () => {
    if (isNaming || !name.trim()) return;
    setIsNaming(true);

    try {
      await completeCeremony(name.trim());
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
      setPhase('complete');
      onComplete?.();
    } finally {
      setIsNaming(false);
    }
  }, [name, isNaming, completeCeremony, onComplete]);

  // ── Tour visual state for EggGraphic crack rendering ──
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

  const isEggPhase = phase === 'egg' || phase === 'crack_1' || phase === 'crack_2' || phase === 'crack_3';
  const isHatching = phase === 'hatching';
  const showBaby = phase === 'reveal' || phase === 'dialog' || phase === 'naming';

  if (phase === 'loading') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: 'radial-gradient(ellipse at center, #0a1a2a 0%, #081520 50%, #060f18 100%)' }}
      >
        <div
          className="absolute size-32 rounded-full opacity-20 animate-pulse"
          style={{ background: `radial-gradient(circle, ${eggColor}40 0%, transparent 70%)` }}
        />
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden select-none"
      style={{
        background: showBaby
          ? 'radial-gradient(ellipse at 50% 45%, rgb(60,140,180) 0%, rgb(70,160,195) 25%, rgb(85,175,205) 50%, rgb(100,190,210) 75%, rgb(115,195,195) 100%)'
          : 'radial-gradient(ellipse at center, #0a1a2a 0%, #081520 50%, #060f18 100%)',
        transition: 'background 2s ease-out',
      }}
      onClick={phase === 'dialog' ? handleDialogClick : undefined}
    >
      {/* ── Ambient background glow (egg phase only) ── */}
      {!showBaby && (
        <div
          className="absolute inset-0 transition-opacity"
          style={{
            transitionDuration: '3000ms',
            background: `radial-gradient(ellipse at 50% 50%, ${eggColor}30 0%, transparent 60%)`,
            opacity: (isEggPhase || isHatching) ? 0.07 : 0.05,
          }}
        />
      )}

      {/* ── Floating particles (egg phase) ── */}
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
      {(isEggPhase || isHatching) && eggCompanion && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            ref={eggContainerRef}
            className={cn(
              'cursor-pointer relative',
              eggVisible ? '' : 'opacity-0',
              eggVisible && isEggPhase && 'animate-egg-onboard-breathe',
              isHatching && 'animate-egg-onboard-burst',
            )}
            onClick={isEggPhase ? handleEggClick : undefined}
          >
            <div
              className="absolute -inset-12 rounded-full blur-2xl transition-opacity duration-1000"
              style={{
                background: `radial-gradient(circle, ${eggColor}50 0%, transparent 70%)`,
                opacity: phase === 'crack_3' ? 0.5 : phase === 'crack_2' ? 0.35 : phase === 'crack_1' ? 0.25 : 0.15,
              }}
            />
            <BlobbiStageVisual
              companion={eggCompanion}
              size="lg"
              animated
              className="size-56 sm:size-64 md:size-72"
              tourVisualState={tourVisualState}
            />
          </div>
        </div>
      )}

      {/* ── Screen flash ── */}
      {showFlash && (
        <div
          className="absolute inset-0 bg-white animate-onboard-screen-flash pointer-events-none"
          style={{ zIndex: 60 }}
        />
      )}

      {/* ── Hatched baby blobbi with golden incandescence ── */}
      {showBaby && babyCompanion && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ paddingBottom: '18%' }}
        >
          {/* Rotating golden incandescence */}
          <div className={cn(
            'absolute animate-onboard-golden-fadein',
            blobbiVisible ? '' : 'opacity-0',
          )}>
            <div
              className="animate-onboard-golden-rotate"
              style={{
                width: 900,
                height: 900,
                background: `conic-gradient(
                  from 0deg,
                  rgba(255, 250, 230, 0.18) 0deg,
                  rgba(255, 245, 210, 0.50) 50deg,
                  rgba(255, 250, 235, 0.22) 100deg,
                  rgba(255, 248, 220, 0.15) 150deg,
                  rgba(255, 245, 210, 0.48) 210deg,
                  rgba(255, 250, 230, 0.20) 270deg,
                  rgba(255, 248, 220, 0.15) 320deg,
                  rgba(255, 250, 230, 0.18) 360deg
                )`,
                borderRadius: '50%',
                filter: 'blur(30px)',
              }}
            />
          </div>

          {/* Bright white-gold shine directly behind blobbi */}
          <div
            className={cn(
              'absolute rounded-full transition-opacity duration-1000',
              blobbiVisible ? 'opacity-100' : 'opacity-0',
            )}
            style={{
              width: 320,
              height: 320,
              background: 'radial-gradient(circle, rgba(255,255,245,0.70) 0%, rgba(255,250,225,0.30) 40%, transparent 70%)',
            }}
          />

          {/* Wider golden halo */}
          <div
            className={cn(
              'absolute rounded-full transition-opacity duration-[2000ms]',
              blobbiVisible ? 'opacity-100' : 'opacity-0',
            )}
            style={{
              width: 700,
              height: 700,
              background: 'radial-gradient(circle, rgba(255, 248, 210, 0.40) 0%, rgba(255, 240, 190, 0.18) 40%, transparent 65%)',
              filter: 'blur(15px)',
            }}
          />

          {/* ── Sparkles everywhere ── */}

          {/* Inner ring - bright twinkling sparkles */}
          {Array.from({ length: 20 }).map((_, i) => {
            const angle = (i / 20) * Math.PI * 2;
            const r = 80 + (i % 4) * 35;
            const size = 4 + (i % 3) * 3;
            return (
              <div
                key={`inner-${i}`}
                className="absolute"
                style={{
                  width: size,
                  height: size,
                  left: `calc(50% + ${Math.cos(angle) * r}px - ${size / 2}px)`,
                  top: `calc(50% + ${Math.sin(angle) * r}px - ${size / 2}px)`,
                  borderRadius: '50%',
                  background: i % 2 === 0
                    ? 'radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,255,255,0.4) 40%, transparent 70%)'
                    : 'radial-gradient(circle, rgba(255,240,130,1) 0%, rgba(255,220,80,0.3) 50%, transparent 70%)',
                  animation: `onboard-sparkle-twinkle ${1.5 + (i % 6) * 0.5}s ease-in-out ${i * 0.15}s infinite`,
                }}
              />
            );
          })}

          {/* Outer ring - larger, slower sparkles */}
          {Array.from({ length: 16 }).map((_, i) => {
            const angle = (i / 16) * Math.PI * 2 + 0.3;
            const r = 170 + (i % 3) * 50;
            const size = 5 + (i % 4) * 3;
            return (
              <div
                key={`outer-${i}`}
                className="absolute"
                style={{
                  width: size,
                  height: size,
                  left: `calc(50% + ${Math.cos(angle) * r}px - ${size / 2}px)`,
                  top: `calc(50% + ${Math.sin(angle) * r}px - ${size / 2}px)`,
                  borderRadius: '50%',
                  background: i % 3 === 0
                    ? 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, transparent 60%)'
                    : 'radial-gradient(circle, rgba(255,235,120,0.85) 0%, transparent 60%)',
                  animation: `onboard-sparkle-twinkle ${2.5 + (i % 5) * 0.7}s ease-in-out ${i * 0.25}s infinite`,
                }}
              />
            );
          })}

          {/* Scattered wide-field sparkles */}
          {Array.from({ length: 24 }).map((_, i) => {
            const x = (Math.sin(i * 2.7 + 1.3) * 0.5 + 0.5) * 80 + 10;
            const y = (Math.cos(i * 3.1 + 0.7) * 0.5 + 0.5) * 70 + 10;
            const size = 3 + (i % 3) * 2;
            return (
              <div
                key={`field-${i}`}
                className="absolute"
                style={{
                  width: size,
                  height: size,
                  left: `${x}%`,
                  top: `${y}%`,
                  borderRadius: '50%',
                  background: i % 4 === 0
                    ? 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, transparent 70%)'
                    : 'radial-gradient(circle, rgba(255,240,160,0.8) 0%, transparent 70%)',
                  animation: `onboard-sparkle-twinkle ${2 + (i % 7) * 0.6}s ease-in-out ${i * 0.18}s infinite`,
                }}
              />
            );
          })}

          {/* Drifting light motes rising from below */}
          {Array.from({ length: 10 }).map((_, i) => {
            const x = (Math.sin(i * 1.9) * 0.5 + 0.5) * 70 + 15;
            return (
              <div
                key={`drift-${i}`}
                className="absolute"
                style={{
                  width: 5 + (i % 3) * 3,
                  height: 5 + (i % 3) * 3,
                  left: `${x}%`,
                  bottom: '20%',
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(255,250,200,0.9) 0%, rgba(255,230,120,0.3) 50%, transparent 100%)',
                  animation: `onboard-sparkle-drift ${4 + i * 0.5}s ease-out ${i * 0.5}s infinite`,
                }}
              />
            );
          })}

          {/* The baby blobbi */}
          <div className={cn(
            'relative transition-opacity duration-1000',
            blobbiVisible ? 'opacity-100' : 'opacity-0',
          )}>
            <BlobbiStageVisual
              companion={babyCompanion}
              size="lg"
              animated
              className="size-[30rem] sm:size-[36rem] md:size-[44rem]"
            />
          </div>
        </div>
      )}

      {/* ── Dialog text (no box, blur behind) ── */}
      {phase === 'dialog' && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center pb-28 sm:pb-36 px-8">
          <div className="relative max-w-md w-full text-center">
            {/* Soft feathered backdrop with shadow */}
            <div
              className="absolute -inset-32"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(0,30,50,0.40) 0%, rgba(0,30,50,0.18) 35%, transparent 65%)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                mask: 'radial-gradient(ellipse at center, black 25%, transparent 65%)',
                WebkitMask: 'radial-gradient(ellipse at center, black 25%, transparent 65%)',
              }}
            />

            {/* Speaker */}
            <div className="relative">
              <p className="text-[11px] text-white/50 tracking-[0.2em] uppercase mb-3">
                ???
              </p>

              {/* Typewriter text */}
              <p className="text-base sm:text-lg text-white leading-relaxed font-light min-h-[3em]">
                {dialogTypewriter.displayed}
                {!dialogTypewriter.done && (
                  <span className="inline-block w-[2px] h-[1em] bg-white/50 ml-0.5 animate-pulse align-text-bottom" />
                )}
              </p>

              {/* Advance indicator */}
              {dialogTypewriter.done && (
                <div className="mt-4 animate-onboard-continue-pulse">
                  <span className="text-xs text-white/30">&#9660;</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Naming ── */}
      {phase === 'naming' && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center pb-28 sm:pb-36 px-8">
          <div className={cn(
            'relative max-w-md w-full text-center',
            namingVisible ? 'animate-onboard-soft-fade-in' : 'opacity-0',
          )}>
            {/* Soft feathered backdrop with shadow */}
            <div
              className="absolute -inset-32"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(0,30,50,0.40) 0%, rgba(0,30,50,0.18) 35%, transparent 65%)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                mask: 'radial-gradient(ellipse at center, black 25%, transparent 65%)',
                WebkitMask: 'radial-gradient(ellipse at center, black 25%, transparent 65%)',
              }}
            />

            <div className="relative">
              {/* Speaker */}
              <p className="text-[11px] text-white/50 tracking-[0.2em] uppercase mb-3">
                ???
              </p>

              {/* Typewriter question */}
              <p className="text-base sm:text-lg text-white/85 leading-relaxed font-light mb-6 min-h-[1.5em] whitespace-pre-line">
                {namingTypewriter.displayed}
                {!namingTypewriter.done && (
                  <span className="inline-block w-[2px] h-[1em] bg-white/50 ml-0.5 animate-pulse align-text-bottom" />
                )}
              </p>

              {/* Input + confirm (appear after typewriter done) */}
              {namingTypewriter.done && (
                <div className="space-y-3 animate-onboard-soft-fade-in">
                  <Input
                    ref={nameInputRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="..."
                    maxLength={32}
                    autoFocus
                    className={cn(
                      'text-center text-lg font-light h-12',
                      'bg-white/10 border-transparent text-white placeholder:text-white/30',
                      'focus:bg-white/[0.25] focus:border-transparent focus:ring-0 focus:outline-none',
                      'focus-visible:ring-0 focus-visible:ring-offset-0',
                      'focus:shadow-[0_0_15px_rgba(255,255,255,0.15),0_0_40px_rgba(255,250,230,0.08)]',
                      'transition-all duration-300',
                      'rounded-full transition-shadow duration-500',
                    )}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && name.trim()) handleNameSubmit();
                    }}
                  />

                  {name.trim() && (
                    <Button
                      onClick={handleNameSubmit}
                      disabled={isNaming}
                      className={cn(
                        'max-w-[12rem] mx-auto h-10 px-8 text-sm font-light tracking-wide',
                        'bg-white/15 hover:bg-white/22 text-white/80 border-transparent',
                        'rounded-full transition-all duration-300',
                        'focus-visible:ring-0 focus-visible:ring-offset-0',
                      )}
                      variant="ghost"
                    >
                      That&apos;s the one.
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
