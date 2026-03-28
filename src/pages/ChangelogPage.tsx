import { useEffect, useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Bug, CalendarDays, ExternalLink, FlaskConical, Minus, Package, Plus, RefreshCw, ScrollText, ShieldAlert, Tag } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppContext } from '@/hooks/useAppContext';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { parseChangelog } from '@/lib/changelog';
import type { ChangelogCategory } from '@/lib/changelog';

const GITLAB_REPO = 'https://gitlab.com/soapbox-pub/ditto';

/** Per-category badge color + icon. */
const CATEGORY_STYLES: Record<ChangelogCategory, { icon: typeof Plus; className: string }> = {
  Added: {
    icon: Plus,
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  Changed: {
    icon: RefreshCw,
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  },
  Deprecated: {
    icon: Package,
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  },
  Removed: {
    icon: Minus,
    className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  },
  Fixed: {
    icon: Bug,
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  },
  Security: {
    icon: ShieldAlert,
    className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  },
};

/** Format "2026-03-26" as a readable date string. */
function formatDate(raw: string): string {
  const date = new Date(raw + 'T00:00:00');
  if (isNaN(date.getTime())) return raw;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

const commitSha = import.meta.env.COMMIT_SHA;
const commitTag = import.meta.env.COMMIT_TAG;
const isPreRelease = !commitTag;

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

  const entries = useMemo(() => (content ? parseChangelog(content) : []), [content]);
  const latestVersion = entries[0]?.version;

  return (
    <main className="min-h-screen pb-16 sidebar:pb-0">
      <PageHeader title="Changelog" icon={<ScrollText className="size-5" />} backTo="/settings" />

      <div className="px-4 pt-3 pb-8 space-y-4">
        {error ? (
          <p className="text-sm text-muted-foreground pt-4">Failed to load changelog.</p>
        ) : content === null ? (
          <ChangelogSkeleton />
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground pt-4">No releases yet.</p>
        ) : (
          <>
            {isPreRelease && latestVersion && <PreReleaseBanner latestVersion={latestVersion} />}

            {entries.map((entry) => (
              <div key={entry.version} className="rounded-2xl border border-border overflow-hidden">
                {/* Version header */}
                <div className="flex items-center gap-3 px-4 py-3 bg-secondary/30">
                  <Tag className="size-4 text-primary shrink-0" />
                  <span className="font-semibold text-sm">v{entry.version}</span>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground ml-auto">
                    <div className="flex items-center gap-1.5">
                      <CalendarDays className="size-3.5" />
                      <span>{formatDate(entry.date)}</span>
                    </div>
                    <a
                      href={`${GITLAB_REPO}/-/releases/v${entry.version}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-foreground transition-colors"
                      title={`View v${entry.version} on GitLab`}
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                </div>

                {/* Sections */}
                <div className="divide-y divide-border">
                  {entry.sections.map((section) => {
                    const style = CATEGORY_STYLES[section.category] ?? CATEGORY_STYLES.Changed;
                    const Icon = style.icon;

                    return (
                      <div key={section.category} className="px-4 py-3 space-y-2">
                        <Badge variant="secondary" className={`gap-1 text-[10px] px-1.5 py-0 ${style.className}`}>
                          <Icon className="size-3" />
                          {section.category}
                        </Badge>
                        <ul className="space-y-1">
                          {section.items.map((item, i) => (
                            <li key={i} className="text-sm text-foreground/90 pl-3 relative before:absolute before:left-0 before:top-[0.6em] before:size-1 before:rounded-full before:bg-muted-foreground/40">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </main>
  );
}

/** Banner shown at the top of the changelog for untagged (pre-release) builds. */
function PreReleaseBanner({ latestVersion }: { latestVersion: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <FlaskConical className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-sm font-medium text-amber-800 dark:text-amber-300">Pre-release build</span>
        {commitSha && (
          <a
            href={`${GITLAB_REPO}/-/commit/${commitSha}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-[11px] font-mono text-amber-600/70 dark:text-amber-400/70 hover:text-amber-800 dark:hover:text-amber-300 transition-colors"
          >
            {commitSha}
          </a>
        )}
      </div>
      <p className="text-xs text-amber-700/80 dark:text-amber-400/70">
        This build contains changes not yet included in a release.{' '}
        <a
          href={`${GITLAB_REPO}/-/compare/v${latestVersion}...main`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-200 transition-colors"
        >
          View unreleased changes
        </a>
      </p>
    </div>
  );
}

function ChangelogSkeleton() {
  return (
    <div className="space-y-4 pt-1">
      {[1, 2].map((i) => (
        <div key={i} className="rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 bg-secondary/30">
            <Skeleton className="size-4 rounded" />
            <Skeleton className="h-4 w-16" />
            <div className="ml-auto flex items-center gap-1.5">
              <Skeleton className="size-3.5 rounded" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="px-4 py-3 space-y-2">
            <Skeleton className="h-4 w-16 rounded-full" />
            <Skeleton className="h-4 w-full ml-3" />
            <Skeleton className="h-4 w-4/5 ml-3" />
            <Skeleton className="h-4 w-3/5 ml-3" />
          </div>
        </div>
      ))}
    </div>
  );
}
