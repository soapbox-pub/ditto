import { useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Feed } from '@/components/Feed';
import { KindInfoButton } from '@/components/KindInfoButton';
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
}

export function KindFeedPage({ kind, title, icon, emptyMessage, kindDef, backTo = '/', alwaysShowBack }: KindFeedPageProps) {
  const primaryKind = Array.isArray(kind) ? kind[0] : kind;

  const resolvedDef = useMemo(
    () => kindDef ?? EXTRA_KINDS.find((def) => def.kind === primaryKind),
    [kindDef, primaryKind],
  );

  useSeoMeta({
    title: `${title} | Ditto`,
    description: `${title} on Nostr`,
  });

  const kinds = Array.isArray(kind) ? kind : [kind];

  return (
    <Feed
      kinds={kinds}
      hideCompose
      emptyMessage={emptyMessage ?? `No ${title.toLowerCase()} yet. Check back soon!`}
      header={
        <div className="flex items-center gap-4 px-4 mt-4 mb-5">
          <Link to={backTo} className={`p-2 -ml-2 rounded-full hover:bg-secondary transition-colors ${alwaysShowBack ? '' : 'sidebar:hidden'}`}>
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {icon}
            <h1 className="text-xl font-bold">{title}</h1>
          </div>
          {resolvedDef && <KindInfoButton kindDef={resolvedDef} icon={icon} />}
        </div>
      }
    />
  );
}
