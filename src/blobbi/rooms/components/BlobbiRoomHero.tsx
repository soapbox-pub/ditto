/**
 * BlobbiRoomHero — "Out exploring" state for the room stage.
 *
 * Shown over the stage area while the Blobbi is the active floating companion.
 */

import { Footprints, Loader2 } from 'lucide-react';
import { FormattedMessage } from 'react-intl';

import { cn } from '@/lib/utils';
import type { BlobbiCompanion } from '@blobbi-kit/core/blobbi';

// ─── Props ────────────────────────────────────────────────────────────────────

interface BlobbiRoomHeroProps {
  companion: BlobbiCompanion;
  isUpdatingCompanion: boolean;
  handleSetAsCompanion: () => Promise<void>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BlobbiRoomHero({ companion, isUpdatingCompanion, handleSetAsCompanion }: BlobbiRoomHeroProps) {
  return (
    <div className="flex-1 flex items-center justify-center px-4 pointer-events-auto">
      <div className="flex flex-col items-center gap-4 text-center max-w-xs rounded-3xl bg-background/80 backdrop-blur-md border border-border/40 shadow-lg px-6 py-8">
        <Footprints className="size-10 text-muted-foreground" aria-hidden />
        <p className="text-foreground text-base">
          <FormattedMessage
            id="blobbiRoom.hero.exploring"
            defaultMessage="{name} is out exploring right now."
            values={{ name: companion.name }}
          />
        </p>
        <button
          onClick={handleSetAsCompanion}
          disabled={isUpdatingCompanion}
          className={cn(
            'flex items-center justify-center gap-2 px-6 py-3 rounded-full text-white font-semibold transition-all duration-300 ease-out text-sm',
            'hover:brightness-110 active:scale-95 motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            isUpdatingCompanion && 'opacity-50 pointer-events-none',
          )}
          style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899, #f59e0b)' }}
        >
          {isUpdatingCompanion ? <Loader2 className="size-4 animate-spin" /> : <Footprints className="size-4" />}
          <span>
            <FormattedMessage id="blobbiRoom.hero.bringHome" defaultMessage="Bring {name} home" values={{ name: companion.name }} />
          </span>
        </button>
      </div>
    </div>
  );
}
