/**
 * Detail content for PressStr-style publications, rendered inside the shared
 * post-detail shell (so it inherits the author header, comments, replies, and
 * interaction bar):
 *
 * - Magazine Issue (kind 39731) — cover + metadata + inline PDF viewer.
 * - Ebook (kind 33953)          — cover + metadata + inline PDF viewer (PDF only;
 *                                 EPUB gets a download prompt).
 * - Magazine (kind 34609)       — masthead + description + list of issues.
 *
 * See `NIP.md` — "Publications".
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { BookOpen, Newspaper, Calendar, Globe, FileText, ExternalLink, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { PdfViewer } from '@/components/PdfViewer';
import { openUrl } from '@/lib/downloadFile';
import { cn } from '@/lib/utils';
import {
  parsePublication,
  publicationNaddr,
  formatFileSize,
  magazineIssuesFilterValue,
  MAGAZINE_KIND,
  MAGAZINE_ISSUE_KIND,
  EBOOK_KIND,
  type Publication,
} from '@/lib/publications';

interface PublicationContentProps {
  event: NostrEvent;
  className?: string;
}

export function PublicationContent({ event, className }: PublicationContentProps) {
  if (event.kind === MAGAZINE_KIND) {
    return <MagazineContent event={event} className={className} />;
  }
  return <PublicationFileContent event={event} className={className} />;
}

/** Format an original-publication timestamp. */
function formatPublishedDate(ts: number, withDay = true): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    ...(withDay ? { day: 'numeric' } : {}),
  });
}

// ── Magazine issue / ebook (file-backed) ────────────────────────────────────

function PublicationFileContent({ event, className }: PublicationContentProps) {
  const pub = useMemo(() => parsePublication(event), [event]);
  const isIssue = event.kind === MAGAZINE_ISSUE_KIND;
  const isEbook = event.kind === EBOOK_KIND;

  const isPdf = pub.format === 'PDF' && Boolean(pub.fileUrl);

  return (
    <div className={cn('mt-3 space-y-6', className)}>
      <div className="flex flex-col gap-6 sm:flex-row">
        {/* Cover */}
        <div className="mx-auto shrink-0 sm:mx-0">
          {pub.image ? (
            <img
              src={pub.image}
              alt=""
              loading="lazy"
              decoding="async"
              className="w-40 rounded-xl border object-cover shadow-md aspect-[2/3] sm:w-48"
            />
          ) : (
            <div className="flex w-40 items-center justify-center rounded-xl border bg-muted aspect-[2/3] sm:w-48">
              {isIssue ? (
                <Newspaper className="size-16 text-muted-foreground" />
              ) : (
                <BookOpen className="size-16 text-muted-foreground" />
              )}
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="min-w-0 flex-1">
          {isIssue && pub.issue && (
            <p className="mb-1 text-sm font-medium text-primary">Issue {pub.issue}</p>
          )}
          <h1 className="mb-2 text-2xl font-bold leading-tight sm:text-3xl">{pub.title}</h1>

          {isEbook && pub.authors.length > 0 && (
            <p className="mb-2 text-lg text-muted-foreground">by {pub.authors.join(', ')}</p>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
            <Badge variant="outline" className="text-xs">
              {pub.format}
            </Badge>
            {pub.publishedAt && (
              <span className="flex items-center gap-1">
                <Calendar className="size-3.5" aria-hidden="true" />
                {formatPublishedDate(pub.publishedAt, isIssue)}
              </span>
            )}
            {pub.language && (
              <span className="flex items-center gap-1">
                <Globe className="size-3.5" aria-hidden="true" />
                {pub.language.toUpperCase()}
              </span>
            )}
            {typeof pub.size === 'number' && (
              <span className="flex items-center gap-1">
                <FileText className="size-3.5" aria-hidden="true" />
                {formatFileSize(pub.size)}
              </span>
            )}
          </div>

          {isEbook && pub.isbn && (
            <p className="mb-3 text-xs text-muted-foreground">ISBN: {pub.isbn}</p>
          )}

          {pub.topics.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {pub.topics.map((t) => (
                <Badge key={t} variant="secondary">
                  #{t}
                </Badge>
              ))}
            </div>
          )}

          {pub.summary && (
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{pub.summary}</p>
          )}

          {pub.fileUrl && (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <a href={pub.fileUrl} download target="_blank" rel="noopener noreferrer">
                  <Download className="mr-2 size-4" />
                  Download {pub.format}
                </a>
              </Button>
              <Button variant="outline" onClick={() => void openUrl(pub.fileUrl!)}>
                <ExternalLink className="mr-2 size-4" />
                Open in browser
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Inline PDF viewer */}
      {isPdf && pub.fileUrl && (
        <PdfViewer url={pub.fileUrl} title={pub.title} />
      )}

      {/* Freeform description */}
      {pub.content.trim() && (
        <div className="whitespace-pre-wrap break-words border-t pt-6 text-sm leading-relaxed text-muted-foreground">
          {pub.content}
        </div>
      )}
    </div>
  );
}

// ── Magazine (parent, lists issues) ─────────────────────────────────────────

function MagazineContent({ event, className }: PublicationContentProps) {
  const { nostr } = useNostr();
  const pub = useMemo(() => parsePublication(event), [event]);

  const { data: issues, isLoading } = useQuery<NostrEvent[]>({
    queryKey: ['magazine-issues', event.pubkey, pub.identifier],
    queryFn: async (c) => {
      const events = await nostr.query(
        [
          {
            kinds: [MAGAZINE_ISSUE_KIND],
            '#a': [magazineIssuesFilterValue(event.pubkey, pub.identifier)],
            limit: 100,
          },
        ],
        { signal: c.signal },
      );
      // Only trust issues published by the magazine's own author.
      return events.filter((e) => e.pubkey === event.pubkey);
    },
  });

  const sortedIssues = useMemo(() => {
    return [...(issues ?? [])].sort((a, b) => {
      const pa = Number(a.tags.find(([n]) => n === 'published_at')?.[1]) || a.created_at;
      const pb = Number(b.tags.find(([n]) => n === 'published_at')?.[1]) || b.created_at;
      return pb - pa;
    });
  }, [issues]);

  return (
    <div className={cn('mt-3 space-y-6', className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {pub.image ? (
          <img
            src={pub.image}
            alt=""
            loading="lazy"
            decoding="async"
            className="mx-auto size-24 rounded-xl border object-cover shadow-sm sm:mx-0"
          />
        ) : (
          <div className="mx-auto flex size-24 items-center justify-center rounded-xl border bg-muted sm:mx-0">
            <Newspaper className="size-10 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Magazine
          </p>
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{pub.title}</h1>
          {pub.topics.length > 0 && (
            <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
              {pub.topics.map((t) => (
                <Badge key={t} variant="secondary">
                  #{t}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {(pub.summary || pub.content.trim()) && (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
          {pub.summary || pub.content}
        </p>
      )}

      {/* Issues */}
      <div className="border-t pt-6">
        <h2 className="mb-4 text-lg font-semibold">Issues</h2>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="w-full rounded-lg aspect-[2/3]" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        ) : sortedIssues.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {sortedIssues.map((issue) => (
              <IssueGridItem key={issue.id} event={issue} />
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="px-8 py-12 text-center">
              <p className="mx-auto max-w-sm text-muted-foreground">
                No issues published yet.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function IssueGridItem({ event }: { event: NostrEvent }) {
  const pub: Publication = useMemo(() => parsePublication(event), [event]);
  const naddr = useMemo(() => publicationNaddr(event), [event]);

  return (
    <Link to={`/${naddr}`} className="group block space-y-2">
      {pub.image ? (
        <img
          src={pub.image}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-full rounded-lg border object-cover shadow-sm transition-transform aspect-[2/3] group-hover:scale-[1.02]"
        />
      ) : (
        <div className="flex w-full items-center justify-center rounded-lg border bg-muted aspect-[2/3]">
          <Newspaper className="size-10 text-muted-foreground" />
        </div>
      )}
      <div>
        {pub.issue && (
          <p className="text-xs font-medium text-primary">Issue {pub.issue}</p>
        )}
        <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:underline">
          {pub.title}
        </p>
      </div>
    </Link>
  );
}
