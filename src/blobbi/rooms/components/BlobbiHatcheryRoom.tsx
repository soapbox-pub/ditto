// src/blobbi/rooms/components/BlobbiHatcheryRoom.tsx

/**
 * BlobbiHatcheryRoom — Incubation / evolution / progression room.
 *
 * Layout:
 * - BlobbiRoomHero (Blobbi visual + stats)
 * - Bottom center: main start/stop hatching or evolution button
 * - Bottom right: quests/tasks button
 * - Bottom left: Blobbis list/selector button
 *
 * Reuses existing hatch/evolve/missions logic from BlobbiPage.
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Loader2, Sparkles, Egg, Target, Check, ListTodo,
  Wrench, Droplets, Heart, Zap, Moon, Camera, Music, Mic,
  Pill, Utensils, Plus, Footprints, ExternalLink, Theater,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { openUrl } from '@/lib/downloadFile';
import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { isLocalhostDev } from '@/blobbi/dev';
import type { BlobbiRoomContext } from '../lib/room-types';
import { ROOM_BOTTOM_BAR_CLASS } from '../lib/room-layout';
import { BlobbiRoomHero } from './BlobbiRoomHero';
import { RoomActionButton } from './RoomActionButton';

// ─── Helper: companionNeedsCare (reused from BlobbiPage) ──────────────────────

const CARE_THRESHOLD = 40;

function companionNeedsCare(companion: { stats: { hunger?: number; happiness?: number; hygiene?: number; health?: number } }): boolean {
  const { stats } = companion;
  return (
    (stats.hunger !== undefined && stats.hunger < CARE_THRESHOLD) ||
    (stats.happiness !== undefined && stats.happiness < CARE_THRESHOLD) ||
    (stats.hygiene !== undefined && stats.hygiene < CARE_THRESHOLD) ||
    (stats.health !== undefined && stats.health < CARE_THRESHOLD)
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface BlobbiHatcheryRoomProps {
  ctx: BlobbiRoomContext;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BlobbiHatcheryRoom({ ctx }: BlobbiHatcheryRoomProps) {
  const {
    companion,
    companions,
    selectedD,
    profile,
    isEgg,
    isBaby,
    isIncubating,
    isEvolvingState,
    canStartIncubation,
    canStartEvolution,
    isStartingIncubation,
    isStartingEvolution,
    isStoppingIncubation,
    isStoppingEvolution,
    isHatching,
    isEvolving,
    hatchTasks,
    evolveTasks,
    onStartIncubation,
    onStartEvolution,
    onStopIncubation,
    onStopEvolution,
    onEvolve,
    setShowPostModal,
    setShowHatchCeremony,
    isActiveFloatingCompanion,
    // Blobbi selector
    onSelectBlobbi,
    blobbiNaddr,
    // Adoption
    setShowAdoptionFlow,
    // Daily missions
    dailyMissions,
    onClaimReward,
    isClaimingReward,
    // DEV
    setShowDevEditor,
    setShowEmotionPanel,
  } = ctx;

  const navigate = useNavigate();

  // Side panels
  const [showQuestsPanel, setShowQuestsPanel] = useState(false);
  const [showBlobbisPanel, setShowBlobbisPanel] = useState(false);

  const hasActiveProcess = (isIncubating && isEgg) || (isEvolvingState && isBaby);
  const isProcessBusy = isHatching || isEvolving || isStoppingIncubation || isStoppingEvolution;

  const tasks = isIncubating ? hatchTasks.tasks : evolveTasks.tasks;
  const allCompleted = isIncubating ? hatchTasks.allCompleted : evolveTasks.allCompleted;
  const isTasksLoading = isIncubating ? hatchTasks.isLoading : evolveTasks.isLoading;

  const completedCount = tasks.filter(t => t.completed).length;
  const totalCount = tasks.length;

  const { missions } = dailyMissions;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Hero ── */}
      <BlobbiRoomHero ctx={ctx} className="flex-1 min-h-0" />

      {/* ── Bottom Action Bar ── */}
      {!isActiveFloatingCompanion && (
        <div className={ROOM_BOTTOM_BAR_CLASS}>
          <div className="flex items-center justify-between gap-1 sm:gap-3">
            {/* Left — Blobbis selector */}
            <RoomActionButton
              icon={<Egg className="size-7 sm:size-9" />}
              label="Blobbis"
              color="text-primary"
              glowHex="var(--primary)"
              onClick={() => setShowBlobbisPanel(true)}
              badge={companions.length > 1 ? (
                <span className="size-4 sm:size-5 rounded-full bg-primary text-[9px] sm:text-[10px] text-primary-foreground font-bold flex items-center justify-center">
                  {companions.length}
                </span>
              ) : undefined}
            />

            {/* Center — Main hatch/evolve action */}
            <div className="flex-1 flex flex-col items-center justify-center gap-1.5">
              {/* Active process: Hatch/Evolve CTA or progress */}
              {hasActiveProcess && allCompleted && !isTasksLoading && (
                <button
                  onClick={isIncubating ? () => setShowHatchCeremony(true) : onEvolve}
                  disabled={isProcessBusy}
                  className={cn(
                    'flex items-center justify-center gap-2 px-8 py-3 rounded-full text-white font-semibold transition-all duration-300',
                    'hover:-translate-y-0.5 hover:scale-105 hover:brightness-110 active:scale-95',
                    isProcessBusy && 'opacity-50 pointer-events-none',
                  )}
                  style={{
                    background: isIncubating
                      ? 'linear-gradient(135deg, #0ea5e9, #8b5cf6)'
                      : 'linear-gradient(135deg, #8b5cf6, #ec4899)',
                  }}
                >
                  {(isHatching || isEvolving) ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <span className="text-lg">{isIncubating ? '\uD83D\uDC23' : '\u2728'}</span>
                  )}
                  <span>{(isHatching || isEvolving) ? (isIncubating ? 'Hatching...' : 'Evolving...') : (isIncubating ? 'Hatch!' : 'Evolve!')}</span>
                </button>
              )}

              {hasActiveProcess && !allCompleted && !isTasksLoading && (
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Sparkles className="size-4 text-primary" />
                    <span className="font-medium">{isIncubating ? 'Hatching' : 'Evolving'}</span>
                    <span className="text-xs tabular-nums">{completedCount}/{totalCount}</span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-40 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%`,
                        background: isIncubating
                          ? 'linear-gradient(90deg, #0ea5e9, #8b5cf6)'
                          : 'linear-gradient(90deg, #8b5cf6, #ec4899)',
                      }}
                    />
                  </div>
                </div>
              )}

              {hasActiveProcess && isTasksLoading && (
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              )}

              {/* No active process — show start button */}
              {!hasActiveProcess && (canStartIncubation || canStartEvolution) && (
                <button
                  onClick={() => canStartIncubation ? onStartIncubation('start') : onStartEvolution()}
                  disabled={isStartingIncubation || isStartingEvolution}
                  className={cn(
                    'flex items-center justify-center gap-2 px-8 py-3 rounded-full text-white font-semibold transition-all duration-300',
                    'hover:-translate-y-0.5 hover:scale-105 hover:brightness-110 active:scale-95',
                    (isStartingIncubation || isStartingEvolution) && 'opacity-50 pointer-events-none',
                  )}
                  style={{
                    background: canStartIncubation
                      ? 'linear-gradient(135deg, #0ea5e9, #8b5cf6)'
                      : 'linear-gradient(135deg, #8b5cf6, #ec4899)',
                  }}
                >
                  {(isStartingIncubation || isStartingEvolution) ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <Sparkles className="size-5" />
                  )}
                  <span>{canStartIncubation ? 'Begin Hatching' : 'Begin Evolution'}</span>
                </button>
              )}

              {!hasActiveProcess && !canStartIncubation && !canStartEvolution && (
                <p className="text-xs text-muted-foreground/50">No journey available</p>
              )}

              {/* Stop process link */}
              {hasActiveProcess && !isTasksLoading && (
                <button
                  onClick={isIncubating ? onStopIncubation : onStopEvolution}
                  disabled={isProcessBusy}
                  className="text-[11px] text-muted-foreground/40 hover:text-destructive/60 transition-colors"
                >
                  {(isStoppingIncubation || isStoppingEvolution) ? 'Stopping...' : `Stop ${isIncubating ? 'incubation' : 'evolution'}`}
                </button>
              )}
            </div>

            {/* Right — Quests/Tasks */}
            <RoomActionButton
              icon={<ListTodo className="size-7 sm:size-9" />}
              label="Quests"
              color="text-amber-500"
              glowHex="#f59e0b"
              onClick={() => setShowQuestsPanel(true)}
              badge={hasActiveProcess && totalCount - completedCount > 0 ? (
                <span className="size-4 sm:size-5 rounded-full bg-amber-500 text-[9px] sm:text-[10px] text-white font-bold flex items-center justify-center">
                  {totalCount - completedCount}
                </span>
              ) : undefined}
            />
          </div>
        </div>
      )}

      {/* ── Quests Sheet ── */}
      <Sheet open={showQuestsPanel} onOpenChange={setShowQuestsPanel}>
        <SheetContent side="right" className="w-80 sm:w-96 p-0">
          <SheetHeader className="px-4 pt-4 pb-3 border-b">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Target className="size-4" />
              Quests
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-4rem)]">
            <div className="p-4 space-y-4">
              {/* Journey tasks */}
              {hasActiveProcess && (
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {isIncubating ? 'Hatching Journey' : 'Evolution Journey'}
                  </h3>
                  {isTasksLoading && (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {!isTasksLoading && tasks.map(task => {
                    const handleAction = () => {
                      if (!task.action || !task.actionTarget) return;
                      switch (task.action) {
                        case 'navigate': navigate(task.actionTarget); setShowQuestsPanel(false); break;
                        case 'external_link': openUrl(task.actionTarget); break;
                        case 'open_modal': if (task.actionTarget === 'blobbi_post') { setShowPostModal(true); setShowQuestsPanel(false); } break;
                      }
                    };
                    const isActionable = !task.completed && !!task.action && !!task.actionTarget;
                    return (
                      <button
                        key={task.id}
                        onClick={isActionable ? handleAction : undefined}
                        disabled={!isActionable}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all text-left',
                          isActionable && 'hover:bg-accent/50 active:scale-[0.98] cursor-pointer',
                          !isActionable && 'cursor-default',
                        )}
                      >
                        <QuestTaskIcon taskId={task.id} completed={task.completed} />
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-sm font-medium leading-tight', task.completed && 'text-muted-foreground line-through')}>{task.name}</p>
                          <p className="text-[10px] text-muted-foreground leading-snug mt-0.5 line-clamp-1">{task.description}</p>
                        </div>
                        {task.required > 1 && !task.completed && (
                          <span className="text-[10px] tabular-nums font-medium text-muted-foreground shrink-0">{task.current}/{task.required}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {!hasActiveProcess && (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <Sparkles className="size-6 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">Start a journey to unlock tasks</p>
                </div>
              )}

              {/* Daily Bounties */}
              <div className="space-y-1">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Daily Bounties
                </h3>
                {dailyMissions.noMissionsAvailable && (
                  <div className="flex flex-col items-center gap-2 py-4 text-center">
                    <Egg className="size-5 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">Hatch your Blobbi to unlock bounties</p>
                  </div>
                )}
                {!dailyMissions.noMissionsAvailable && missions.map(mission => {
                  const canClaim = mission.completed && !mission.claimed;
                  return (
                    <div
                      key={mission.id}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all',
                        canClaim && 'bg-amber-500/[0.06]',
                      )}
                    >
                      <DailyMissionIcon action={mission.action} claimed={mission.claimed} canClaim={canClaim} />
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-medium leading-tight', mission.claimed && 'text-muted-foreground line-through')}>{mission.title}</p>
                        <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{mission.description}</p>
                      </div>
                      {!mission.claimed && (
                        <span className="text-[10px] tabular-nums font-medium text-muted-foreground shrink-0">{mission.currentCount}/{mission.requiredCount}</span>
                      )}
                      {canClaim && (
                        <button
                          onClick={() => onClaimReward(mission.id)}
                          disabled={isClaimingReward}
                          className="shrink-0 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                        >
                          Claim
                        </button>
                      )}
                    </div>
                  );
                })}
                {/* Bonus row */}
                {!dailyMissions.noMissionsAvailable && dailyMissions.bonusAvailable && !dailyMissions.bonusClaimed && (
                  <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-amber-500/[0.06]">
                    <div className="size-8 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
                      <Sparkles className="size-4 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight">Daily Champion</p>
                      <p className="text-[10px] text-muted-foreground">All missions complete!</p>
                    </div>
                    <button
                      onClick={() => onClaimReward('bonus_daily_complete')}
                      disabled={isClaimingReward}
                      className="shrink-0 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                    >
                      Claim
                    </button>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* ── Blobbis Sheet ── */}
      <Sheet open={showBlobbisPanel} onOpenChange={setShowBlobbisPanel}>
        <SheetContent side="left" className="w-80 sm:w-96 p-0">
          <SheetHeader className="px-4 pt-4 pb-3 border-b">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Egg className="size-4" />
              Your Blobbis
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-4rem)]">
            <div className="p-4">
              {/* Blobbi grid */}
              <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 py-3">
                {companions.map((c) => {
                  const isSelected = c.d === selectedD;
                  const isCompanion = c.d === profile?.currentCompanion;
                  return (
                    <button
                      key={c.d}
                      onClick={() => { onSelectBlobbi(c.d); setShowBlobbisPanel(false); }}
                      className={cn(
                        'flex flex-col items-center gap-1 transition-all duration-200',
                        'hover:-translate-y-1 hover:scale-105 active:scale-95',
                      )}
                    >
                      <div className="relative">
                        <div className={cn(
                          'rounded-full p-1 transition-all',
                          isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : '',
                        )}>
                          <BlobbiStageVisual companion={c} size="sm" />
                        </div>
                        {isCompanion && (
                          <div className="absolute -bottom-0.5 -right-0.5 size-5 rounded-full bg-background ring-2 ring-background flex items-center justify-center">
                            <Footprints className="size-3 text-emerald-500" />
                          </div>
                        )}
                        {companionNeedsCare(c) && !isCompanion && (
                          <div className="absolute -top-0.5 -right-0.5 size-4 rounded-full bg-amber-500 flex items-center justify-center">
                            <span className="text-[8px] text-white font-bold">!</span>
                          </div>
                        )}
                      </div>
                      {c.stage !== 'egg' && (
                        <span className={cn(
                          'text-[11px] font-medium max-w-[4.5rem] truncate',
                          isSelected ? 'text-foreground' : 'text-muted-foreground',
                        )}>
                          {c.name}
                        </span>
                      )}
                    </button>
                  );
                })}

                {/* Adopt + button */}
                <button
                  onClick={() => { setShowBlobbisPanel(false); setShowAdoptionFlow(true); }}
                  className="flex flex-col items-center gap-1 transition-all duration-200 hover:-translate-y-1 hover:scale-105 active:scale-95"
                >
                  <div className="size-14 rounded-full flex items-center justify-center" style={{
                    background: 'radial-gradient(circle at 40% 35%, color-mix(in srgb, currentColor 10%, transparent), color-mix(in srgb, currentColor 3%, transparent) 70%)',
                  }}>
                    <Plus className="size-6 text-muted-foreground/60" />
                  </div>
                  <span className="text-[11px] font-medium text-muted-foreground/60">Adopt</span>
                </button>
              </div>

              {/* Quick actions row */}
              <div className="flex items-center justify-center gap-6 pt-3 border-t mt-3">
                <Link
                  to={`/${blobbiNaddr}`}
                  onClick={() => setShowBlobbisPanel(false)}
                  className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="size-5" />
                  <span className="text-[10px]">View</span>
                </Link>
                {/* DEV tools */}
                {isLocalhostDev() && (
                  <>
                    {companion.stage !== 'adult' && (
                      <button
                        onClick={() => { setShowBlobbisPanel(false); if (isEgg) { setShowHatchCeremony(true); } else { onEvolve(); } }}
                        disabled={isHatching || isEvolving}
                        className="flex flex-col items-center gap-1 text-amber-500 hover:text-amber-400 transition-colors disabled:opacity-40"
                      >
                        <Sparkles className="size-5" />
                        <span className="text-[10px]">{companion.stage === 'egg' ? 'Hatch' : 'Evolve'}</span>
                      </button>
                    )}
                    <button onClick={() => { setShowBlobbisPanel(false); setShowDevEditor(true); }} className="flex flex-col items-center gap-1 text-amber-500 hover:text-amber-400 transition-colors">
                      <Wrench className="size-5" />
                      <span className="text-[10px]">Editor</span>
                    </button>
                    <button onClick={() => { setShowBlobbisPanel(false); setShowEmotionPanel(true); }} className="flex flex-col items-center gap-1 text-amber-500 hover:text-amber-400 transition-colors">
                      <Theater className="size-5" />
                      <span className="text-[10px]">Emote</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Quest task icon (reused from BlobbiPage) ─────────────────────────────────

function QuestTaskIcon({ taskId, completed }: { taskId: string; completed: boolean }) {
  const iconClass = 'size-4';
  const icon = (() => {
    switch (taskId) {
      case 'create_themes': return <Sparkles className={iconClass} />;
      case 'color_moments': return <Droplets className={iconClass} />;
      case 'create_posts': return <Target className={iconClass} />;
      case 'interactions': return <Heart className={iconClass} />;
      case 'edit_profile': return <Wrench className={iconClass} />;
      case 'maintain_stats': return <Zap className={iconClass} />;
      default: return <Target className={iconClass} />;
    }
  })();
  return (
    <div className={cn(
      'size-8 rounded-full flex items-center justify-center shrink-0',
      completed ? 'bg-emerald-500/15 text-emerald-500' : 'bg-muted/60 text-muted-foreground',
    )}>
      {completed ? <Check className="size-4" /> : icon}
    </div>
  );
}

// ─── Daily mission icon (reused from BlobbiPage) ──────────────────────────────

function DailyMissionIcon({ action, claimed, canClaim }: { action: string; claimed: boolean; canClaim: boolean }) {
  const iconClass = 'size-4';
  const icon = (() => {
    switch (action) {
      case 'interact': return <Heart className={iconClass} />;
      case 'feed': return <Utensils className={iconClass} />;
      case 'clean': return <Droplets className={iconClass} />;
      case 'sleep': return <Moon className={iconClass} />;
      case 'take_photo': return <Camera className={iconClass} />;
      case 'sing': return <Mic className={iconClass} />;
      case 'play_music': return <Music className={iconClass} />;
      case 'medicine': return <Pill className={iconClass} />;
      default: return <Target className={iconClass} />;
    }
  })();
  return (
    <div className={cn(
      'size-8 rounded-full flex items-center justify-center shrink-0',
      claimed ? 'bg-emerald-500/15 text-emerald-500' : canClaim ? 'bg-amber-500/15 text-amber-500' : 'bg-muted/60 text-muted-foreground',
    )}>
      {claimed ? <Check className="size-4" /> : icon}
    </div>
  );
}
