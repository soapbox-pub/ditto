import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Bug, FlaskConical, Minus, Package, Plus, RefreshCw, ScrollText, ShieldAlert } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppContext } from '@/hooks/useAppContext';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { parseChangelog } from '@/lib/changelog';
import type { ChangelogCategory, ChangelogEntry } from '@/lib/changelog';

const GITLAB_REPO = 'https://gitlab.com/soapbox-pub/ditto';

/** Per-category icon + color used as inline list bullets. */
const CATEGORY_STYLES: Record<ChangelogCategory, { icon: typeof Plus; colorClass: string }> = {
  Added:      { icon: Plus,        colorClass: 'text-emerald-600 dark:text-emerald-400' },
  Changed:    { icon: RefreshCw,   colorClass: 'text-blue-600 dark:text-blue-400' },
  Deprecated: { icon: Package,     colorClass: 'text-orange-600 dark:text-orange-400' },
  Removed:    { icon: Minus,       colorClass: 'text-red-600 dark:text-red-400' },
  Fixed:      { icon: Bug,         colorClass: 'text-amber-600 dark:text-amber-400' },
  Security:   { icon: ShieldAlert, colorClass: 'text-purple-600 dark:text-purple-400' },
};

/** Format "2026-03-26" as a readable date string. */
function formatDate(raw: string): string {
  const date = new Date(raw + 'T00:00:00');
  if (isNaN(date.getTime())) return raw;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

const commitSha = import.meta.env.COMMIT_SHA;
const commitTag = import.meta.env.COMMIT_TAG;
const buildDate = import.meta.env.BUILD_DATE;
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

            <LatestRelease entry={entries[0]} />

            {entries.length > 1 && (
              <>
                <div className="flex items-center gap-3 pt-4 pb-1">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Past releases</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                {entries.slice(1).map((entry) => (
                  <ChangelogEntryCard key={entry.version} entry={entry} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

/** Hero treatment for the most recent release — no card, centered version + date. */
function LatestRelease({ entry }: { entry: ChangelogEntry }) {
  const contentRef = useRef<HTMLUListElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const measure = useCallback(() => {
    const el = contentRef.current;
    if (el) setOverflows(el.scrollHeight > ENTRY_MAX_HEIGHT);
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return (
    <div className="pt-2 pb-1 px-4">
      {/* Big centered version + date */}
      <a
        href={`${GITLAB_REPO}/-/releases/v${entry.version}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-center text-2xl font-bold tracking-tight hover:underline"
      >
        v{entry.version}
      </a>
      <a
        href={`${GITLAB_REPO}/-/releases/v${entry.version}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
      >
        {formatDate(entry.date)}
      </a>

      {/* Items */}
      <div className="relative mt-4">
        <ul
          ref={contentRef}
          style={!expanded && overflows ? { maxHeight: ENTRY_MAX_HEIGHT, overflow: 'hidden' } : undefined}
          className="space-y-2.5"
        >
          {entry.sections.flatMap((section) => {
            const style = CATEGORY_STYLES[section.category] ?? CATEGORY_STYLES.Changed;
            const Icon = style.icon;

            return section.items.map((item, i) => (
              <li key={`${section.category}-${i}`} className="flex gap-2 text-base text-foreground/90">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Icon className={`size-4 shrink-0 mt-1 cursor-default ${style.colorClass}`} />
                  </TooltipTrigger>
                  <TooltipContent side="left">{section.category}</TooltipContent>
                </Tooltip>
                <span>{item}</span>
              </li>
            ));
          })}
        </ul>
        {!expanded && overflows && (
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        )}
      </div>

      {overflows && (
        <button
          className="w-full text-sm text-primary hover:underline mt-1"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}

    </div>
  );
}

const ENTRY_MAX_HEIGHT = 240; // px — entries taller than this get a "Read more" button

/** A single changelog release card with truncation for long entries. */
function ChangelogEntryCard({ entry }: { entry: ChangelogEntry }) {
  const contentRef = useRef<HTMLUListElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const measure = useCallback(() => {
    const el = contentRef.current;
    if (el) setOverflows(el.scrollHeight > ENTRY_MAX_HEIGHT);
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      {/* Version header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <a
          href={`${GITLAB_REPO}/-/releases/v${entry.version}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-sm hover:underline"
        >
          v{entry.version}
        </a>
        <a
          href={`${GITLAB_REPO}/-/releases/v${entry.version}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
        >
          <span>{formatDate(entry.date)}</span>
        </a>
      </div>

      {/* Items */}
      <div className="relative">
        <ul
          ref={contentRef}
          style={!expanded && overflows ? { maxHeight: ENTRY_MAX_HEIGHT, overflow: 'hidden' } : undefined}
          className="px-4 py-3 space-y-2.5"
        >
          {entry.sections.flatMap((section) => {
            const style = CATEGORY_STYLES[section.category] ?? CATEGORY_STYLES.Changed;
            const Icon = style.icon;

            return section.items.map((item, i) => (
              <li key={`${section.category}-${i}`} className="flex gap-2 text-sm text-foreground/90">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Icon className={`size-3.5 shrink-0 mt-[3px] cursor-default ${style.colorClass}`} />
                  </TooltipTrigger>
                  <TooltipContent side="left">{section.category}</TooltipContent>
                </Tooltip>
                <span>{item}</span>
              </li>
            ));
          })}
        </ul>
        {!expanded && overflows && (
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        )}
      </div>

      {overflows && (
        <button
           className="w-full text-sm text-primary hover:underline py-2"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

/** Banner shown at the top of the changelog for untagged (pre-release) builds. */
function PreReleaseBanner({ latestVersion }: { latestVersion: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <FlaskConical className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-sm font-medium text-amber-800 dark:text-amber-300">Pre-release build</span>
        {commitSha && buildDate && (
          <a
            href={`${GITLAB_REPO}/-/commit/${commitSha}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-[11px] text-amber-600/70 dark:text-amber-400/70 hover:text-amber-800 dark:hover:text-amber-300 transition-colors"
          >
            {formatDate(buildDate.split('T')[0])}
          </a>
        )}
      </div>
      <p className="text-xs text-amber-700/80 dark:text-amber-400/70">
        This build contains changes not yet included in a release.{' '}
        <a
          href={`${GITLAB_REPO}/-/compare/v${latestVersion}...${commitSha || 'main'}`}
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
      <div className="flex items-center gap-3 px-4 py-3">
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
