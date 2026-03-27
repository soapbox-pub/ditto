import { useEffect, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { ScrollText } from 'lucide-react';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

import { PageHeader } from '@/components/PageHeader';
import { useAppContext } from '@/hooks/useAppContext';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { Skeleton } from '@/components/ui/skeleton';

export function ChangelogPage() {
  const { config } = useAppContext();
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useLayoutOptions({});

  useSeoMeta({
    title: `Changelog | ${config.appName}`,
    description: `What's new in ${config.appName}`,
  });

  useEffect(() => {
    fetch('/CHANGELOG.md')
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.text();
      })
      .then(setContent)
      .catch(() => setError(true));
  }, []);

  return (
    <main className="min-h-screen pb-16 sidebar:pb-0">
      <PageHeader title="Changelog" icon={<ScrollText className="size-5" />} backTo="/settings" />

      <div className="px-4 pb-8">
        {error ? (
          <p className="text-sm text-muted-foreground pt-4">Failed to load changelog.</p>
        ) : content === null ? (
          <div className="space-y-4 pt-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        ) : (
          <div className="prose prose-sm max-w-none break-words text-foreground prose-headings:text-foreground prose-headings:font-bold prose-strong:text-foreground prose-a:text-primary prose-li:marker:text-muted-foreground prose-hr:border-border">
            <Markdown rehypePlugins={[rehypeSanitize]}>
              {content.replace(/^# .+\n+/, '')}
            </Markdown>
          </div>
        )}
      </div>
    </main>
  );
}
