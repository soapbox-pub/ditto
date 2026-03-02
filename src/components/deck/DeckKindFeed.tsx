import { useMemo } from 'react';
import { Feed } from '@/components/Feed';
import { getExtraKindDef, getPageKinds } from '@/lib/extraKinds';
import { useAppContext } from '@/hooks/useAppContext';

interface DeckKindFeedProps {
  type: string;
}

/** Generic deck column for any extra-kind content type. */
export function DeckKindFeed({ type }: DeckKindFeedProps) {
  const { config } = useAppContext();
  const def = getExtraKindDef(type);

  const kinds = useMemo(() => {
    if (!def) return undefined;
    return getPageKinds(def, config.feedSettings);
  }, [def, config.feedSettings]);

  if (!def || !kinds || kinds.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        No content available for this column type.
      </div>
    );
  }

  return <Feed kinds={kinds} hideCompose />;
}
