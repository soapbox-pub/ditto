/**
 * ProgressionDevPanel - DEV MODE ONLY
 *
 * Simple testing panel for manually triggering kind 11125 progression writes.
 * All actions flow through the proper centralized helpers:
 *   - updateProgressionContent() for content JSON
 *   - upsertLevelTag() for the queryable level tag
 *   - fetchFreshEvent() + prev for safe read-modify-write
 *
 * This component is temporary and can be removed when progression is
 * integrated into real gameplay.
 */

import { useState } from 'react';
import { useNostr } from '@nostrify/react';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/useToast';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';

import { KIND_BLOBBONAUT_PROFILE } from '@/blobbi/core/lib/blobbi';
import { parseProfileContent } from '@/blobbi/core/lib/blobbonaut-content';
import { updateProgressionContent, upsertLevelTag } from '@/blobbi/core/lib/progression';
import { isLocalhostDev } from './index';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProgressionDevPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful write to update the cached profile event */
  onProfileUpdated?: (event: import('@nostrify/nostrify').NostrEvent) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProgressionDevPanel({ isOpen, onClose, onProfileUpdated }: ProgressionDevPanelProps) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  // Guard: only render in localhost dev mode
  if (!isLocalhostDev()) return null;

  /**
   * Core write helper: fetch fresh event, apply progression update,
   * upsert level tag, publish. This is the pattern all future progression
   * writes should follow.
   */
  async function applyProgressionUpdate(
    label: string,
    getUpdate: (currentContent: string) => Parameters<typeof updateProgressionContent>[1],
  ) {
    if (!user?.pubkey) {
      toast({ title: 'Not logged in', variant: 'destructive' });
      return;
    }

    setBusy(true);
    setLastResult(null);

    try {
      // 1. Fetch fresh event (safe read-modify-write)
      const prev = await fetchFreshEvent(nostr, {
        kinds: [KIND_BLOBBONAUT_PROFILE],
        authors: [user.pubkey],
      });

      const existingContent = prev?.content ?? '';
      const existingTags = prev?.tags ?? [];

      // 2. Apply progression update through centralized helper
      const progressionUpdate = getUpdate(existingContent);
      const { content: updatedContent, globalLevel } = updateProgressionContent(
        existingContent,
        progressionUpdate,
      );

      // 3. Upsert level tag (queryable mirror)
      const updatedTags = upsertLevelTag(existingTags, globalLevel);

      // 4. Publish
      const event = await publishEvent({
        kind: KIND_BLOBBONAUT_PROFILE,
        content: updatedContent,
        tags: updatedTags,
        prev: prev ?? undefined,
      });

      onProfileUpdated?.(event);

      // Show result
      const parsed = parseProfileContent(updatedContent);
      const blobbi = parsed.progression?.games?.blobbi;
      setLastResult(
        `${label}: level=${blobbi?.level ?? '?'}, xp=${blobbi?.xp ?? '?'}, global=${globalLevel}`,
      );

      toast({ title: 'DEV: Progression updated', description: label });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastResult(`Error: ${msg}`);
      toast({ title: 'DEV: Write failed', description: msg, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  // ── Actions ──

  const addXp = (amount: number) =>
    applyProgressionUpdate(`+${amount} Blobbi XP`, (content) => {
      const parsed = parseProfileContent(content);
      const currentXp = parsed.progression?.games?.blobbi?.xp ?? 0;
      return { games: { blobbi: { xp: currentXp + amount } } };
    });

  const addLevel = () =>
    applyProgressionUpdate('+1 Blobbi Level', (content) => {
      const parsed = parseProfileContent(content);
      const currentLevel = parsed.progression?.games?.blobbi?.level ?? 1;
      return { games: { blobbi: { level: currentLevel + 1 } } };
    });

  const resetProgression = () =>
    applyProgressionUpdate('Reset Blobbi Progression', () => ({
      games: { blobbi: { level: 1, xp: 0, unlocks: { maxBlobbis: 1, realInventoryEnabled: false } } },
    }));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Progression Dev Panel
            <Badge variant="outline" className="text-xs">DEV</Badge>
          </DialogTitle>
          <DialogDescription>
            Test kind 11125 progression writes. All actions use the proper helpers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* XP buttons */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Blobbi XP</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => addXp(10)} disabled={busy}>
                +10 XP
              </Button>
              <Button size="sm" variant="outline" onClick={() => addXp(50)} disabled={busy}>
                +50 XP
              </Button>
              <Button size="sm" variant="outline" onClick={() => addXp(200)} disabled={busy}>
                +200 XP
              </Button>
            </div>
          </div>

          <Separator />

          {/* Level buttons */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Blobbi Level</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={addLevel} disabled={busy}>
                +1 Level
              </Button>
            </div>
          </div>

          <Separator />

          {/* Reset */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Reset</p>
            <Button size="sm" variant="destructive" onClick={resetProgression} disabled={busy}>
              Reset Blobbi Progression
            </Button>
          </div>

          {/* Last result */}
          {lastResult && (
            <>
              <Separator />
              <p className="text-xs font-mono text-muted-foreground break-all">{lastResult}</p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
