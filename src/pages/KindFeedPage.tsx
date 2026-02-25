import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Feed } from '@/components/Feed';
import { useLayoutOptions } from '@/contexts/LayoutContext';

interface KindFeedPageProps {
  kind: number | number[];
  title: string;
  icon?: React.ReactNode;
  emptyMessage?: string;
}

export function KindFeedPage({ kind, title, icon, emptyMessage }: KindFeedPageProps) {
  const primaryKind = Array.isArray(kind) ? kind[0] : kind;

  useSeoMeta({
    title: `${title} | Ditto`,
    description: `${title} on Nostr`,
  });

  useLayoutOptions({ showFAB: true, fabKind: primaryKind });

  const kinds = Array.isArray(kind) ? kind : [kind];

  return (
    <Feed
      kinds={kinds}
      hideCompose
      emptyMessage={emptyMessage ?? `No ${title.toLowerCase()} yet. Check back soon!`}
      header={
        <div className="flex items-center gap-4 px-4 mt-4 mb-5">
          <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex items-center gap-2">
            {icon}
            <h1 className="text-xl font-bold">{title}</h1>
          </div>
        </div>
      }
    />
  );
}
