import { useMemo, useState } from 'react';
import { useIntl, type MessageDescriptor } from 'react-intl';
import { useSeoMeta } from '@/hooks/useSeoMeta';
import { Feed, type FeedLeadingTab } from '@/components/Feed';
import { KindInfoButton } from '@/components/KindInfoButton';
import { PageHeader } from '@/components/PageHeader';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { EXTRA_KINDS, type ExtraKindDef } from '@/lib/extraKinds';

interface KindFeedPageProps {
  kind: number | number[];
  /** Page title. A descriptor is formatted in the current locale. */
  title: string | MessageDescriptor;
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
  /** Unique feed ID for tab persistence. Defaults to the lowercase (English) title. */
  feedId?: string;
  /** Extra content rendered after the feed header (e.g. a custom compose dialog). */
  extra?: React.ReactNode;
  /** If set, overrides the default FAB click behavior. */
  onFabClick?: () => void;
  /** Whether to show the FAB (default: true). */
  showFAB?: boolean;
  /**
   * Apply `sort:hot` to the Global tab to keep spam and low-quality events out
   * of easy view (e.g. Articles, Highlights).
   */
  hotGlobal?: boolean;
  /** Logged-in-only tab shown before Follows/Global with custom content (e.g. "My Articles"). */
  leadingTab?: FeedLeadingTab;
}

export function KindFeedPage({ kind, title: titleProp, icon, emptyMessage, kindDef, backTo = '/', alwaysShowBack, fabHref, tagFilters, extra, onFabClick, showFAB = true, feedId, hotGlobal, leadingTab }: KindFeedPageProps) {
  const intl = useIntl();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const title = typeof titleProp === 'string' ? titleProp : intl.formatMessage(titleProp);
  // Key tab persistence off the English title so it doesn't change with the locale.
  const defaultFeedId = (typeof titleProp === 'string' ? titleProp : String(titleProp.defaultMessage ?? titleProp.id)).toLowerCase();
  // English reads "No color moments yet"; other languages keep their own capitalization.
  const titleNoun = intl.locale.startsWith('en') ? title.toLowerCase() : title;
  const primaryKind = Array.isArray(kind) ? kind[0] : kind;

  const resolvedDef = useMemo(
    () => kindDef ?? EXTRA_KINDS.find((def) => def.kind === primaryKind),
    [kindDef, primaryKind],
  );

  const [infoOpen, setInfoOpen] = useState(false);

  useSeoMeta({
    title: `${title} | ${config.appName}`,
    description: intl.formatMessage({ id: 'kindFeed.seoDescription', defaultMessage: '{title} on Nostr' }, { title }),
  });

  const fabClick = onFabClick ?? (!fabHref && resolvedDef ? () => setInfoOpen(true) : undefined);
  useLayoutOptions({ showFAB, fabKind: primaryKind, fabHref, onFabClick: fabClick, hasSubHeader: !!user });

  const kinds = Array.isArray(kind) ? kind : [kind];

  // A kind can declare `hotGlobal` on its definition; an explicit prop overrides it.
  const effectiveHotGlobal = hotGlobal ?? resolvedDef?.hotGlobal;

  return (
    <>
      <Feed
        kinds={kinds}
        tagFilters={tagFilters}
        hotGlobal={effectiveHotGlobal}
        leadingTab={leadingTab}
        hideCompose
        feedId={feedId ?? defaultFeedId}
        emptyMessage={emptyMessage ?? intl.formatMessage({ id: 'kindFeed.empty', defaultMessage: 'No {title} yet. Check back soon!' }, { title: titleNoun })}
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
