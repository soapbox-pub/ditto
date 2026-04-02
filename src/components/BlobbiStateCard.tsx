import { useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { parseBlobbiEvent } from '@/blobbi/core/lib/blobbi';

export function BlobbiStateCard({ event }: { event: NostrEvent }) {
  const companion = useMemo(() => parseBlobbiEvent(event), [event]);

  if (!companion) return null;

  const isSleeping = companion.state === 'sleeping';

  return (
    <div className="flex flex-col items-center py-4">
      {/* Blobbi visual — same as /blobbi hero */}
      <div className="relative">
        <div className="absolute inset-0 -m-8 bg-primary/5 rounded-full blur-3xl" />
        <BlobbiStageVisual
          companion={companion}
          size="lg"
          animated={!isSleeping}
          lookMode="forward"
          className="size-48 sm:size-56"
        />
      </div>

      {/* Name */}
      <h3
        className="mt-3 text-xl font-bold text-center"
        style={{ color: companion.visualTraits.baseColor }}
      >
        {companion.name}
      </h3>
    </div>
  );
}
