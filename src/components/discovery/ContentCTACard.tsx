import { useState } from 'react';
import { Music } from 'lucide-react';
import { KindInfoButton } from '@/components/KindInfoButton';
import type { ExtraKindDef } from '@/lib/extraKinds';
import { cn } from '@/lib/utils';

interface ContentCTACardProps {
  /** The ExtraKindDef for this content type (used for the info dialog). */
  kindDef: ExtraKindDef;
  /** Title text (e.g. "Share Your Music on Nostr"). */
  title: string;
  /** Subtitle text. */
  subtitle: string;
  /** Icon to display above the title. Defaults to Music. */
  icon?: React.ReactNode;
  /** Extra classes on the outer container. */
  className?: string;
}

/**
 * Call-to-action card for content discovery pages.
 * Displays a gradient card with icon, title, subtitle, and a "Learn More" button
 * that opens the KindInfoButton dialog showing external apps for this content type.
 *
 * Used at the bottom of music, podcast, and other discovery tabs.
 */
export function ContentCTACard({ kindDef, title, subtitle, icon, className }: ContentCTACardProps) {
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <div className={cn('mx-4 rounded-2xl overflow-hidden relative', className)}>
      <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-accent/10">
        <div className="p-6 text-center">
          <div className="flex justify-center text-primary/40">
            {icon ?? <Music className="size-10" />}
          </div>
          <h3 className="text-lg font-bold mt-3">{title}</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">{subtitle}</p>
          <button
            onClick={() => setInfoOpen(true)}
            className="mt-4 px-6 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Learn More
          </button>
        </div>
      </div>
      {/* Hidden KindInfoButton that we control programmatically */}
      <div className="hidden">
        <KindInfoButton kindDef={kindDef} open={infoOpen} onOpenChange={setInfoOpen} />
      </div>
    </div>
  );
}
