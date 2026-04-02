import { useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Feed } from '@/components/Feed';
import { KindInfoButton } from '@/components/KindInfoButton';
import { PageHeader } from '@/components/PageHeader';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { EXTRA_KINDS, type ExtraKindDef } from '@/lib/extraKinds';

interface KindFeedPageProps {
  kind: number | number[];
  title: string;
  icon?: React.ReactNode;
  emptyMessage?: string;
  /** Override the auto-detected ExtraKindDef (useful for pages with sub-kinds like Treasures). */
  kindDef?: ExtraKindDef;
  /** Override the back button destination (defaults to "/"). */
  backTo?: string;
  /** Always show the back button, even on desktop (default: only mobile). */
  alwaysShowBack?: boolean;
  /** If set, the FAB navigates to this URL instead of opening a compose dialog. */
  fabHref?: string;
  /** Additional tag filters to apply (e.g. `{ '#m': ['application/x-webxdc'] }`). */
  tagFilters?: Record<string, string[]>;
  /** Unique feed ID for tab persistence. Defaults to lowercase title. */
  feedId?: string;
  /** Extra content rendered after the feed header (e.g. a custom compose dialog). */
  extra?: React.ReactNode;
  /** If set, overrides the default FAB click behavior. */
  onFabClick?: () => void;
  /** Whether to show the FAB (default: true). */
  showFAB?: boolean;
}

export function KindFeedPage({ kind, title, icon, emptyMessage, kindDef, backTo = '/', alwaysShowBack, fabHref, tagFilters, extra, onFabClick, showFAB = true, feedId }: KindFeedPageProps) {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const primaryKind = Array.isArray(kind) ? kind[0] : kind;

  const resolvedDef = useMemo(
    () => kindDef ?? EXTRA_KINDS.find((def) => def.kind === primaryKind),
    [kindDef, primaryKind],
  );

  const [infoOpen, setInfoOpen] = useState(false);

  useSeoMeta({
    title: `${title} | ${config.appName}`,
    description: `${title} on Nostr`,
  });

  const fabClick = onFabClick ?? (!fabHref && resolvedDef ? () => setInfoOpen(true) : undefined);
  useLayoutOptions({ showFAB, fabKind: primaryKind, fabHref, onFabClick: fabClick, hasSubHeader: !!user });

  const kinds = Array.isArray(kind) ? kind : [kind];

  return (
    <>
      <Feed
        kinds={kinds}
        tagFilters={tagFilters}
        hideCompose
        feedId={feedId ?? title.toLowerCase()}
        emptyMessage={emptyMessage ?? `No ${title.toLowerCase()} yet. Check back soon!`}
        header={
          <PageHeader title={title} icon={icon} backTo={backTo} alwaysShowBack={alwaysShowBack}>
            {resolvedDef && <KindInfoButton kindDef={resolvedDef} icon={icon} open={infoOpen} onOpenChange={setInfoOpen} />}
          </PageHeader>
        }
      />
      {extra}
    </>
  );
}
