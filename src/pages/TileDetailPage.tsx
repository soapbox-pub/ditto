/**
 * `/tiles/:naddr` — tile detail page.
 *
 * Shows a tile's metadata, screenshot, markdown description, declared
 * settings schema, full Lua source (in a collapsible), install / uninstall /
 * open affordances, and a NIP-22 (kind 1111) comment section so users can
 * leave feedback and reactions.
 */

import { useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { parseTileDefEvent } from '@soapbox.pub/nostr-canvas';
import {
  ArrowLeft,
  Download,
  ExternalLink,
  LayoutGrid,
  MessageSquare,
  ShieldCheck,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ComposeBox } from '@/components/ComposeBox';
import { FlatThreadedReplyList, type ThreadedReply } from '@/components/ThreadedReplyList';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useComments } from '@/hooks/useComments';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useInstalledTiles } from '@/hooks/useInstalledTiles';
import { useCanvasGate } from '@/lib/nostr-canvas/canvasGate';
import {
  decodeTileNaddr,
  tileVerificationState,
} from '@/lib/nostr-canvas/identifiers';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export function TileDetailPage() {
  const { naddr = '' } = useParams<{ naddr: string }>();
  const { config } = useAppContext();
  const navigate = useNavigate();
  const { requestGate } = useCanvasGate();
  const {
    installTile,
    uninstallTile,
    isInstalledByNaddr,
  } = useInstalledTiles();

  const decoded = useMemo(() => decodeTileNaddr(naddr), [naddr]);
  const { nostr } = useNostr();

  const { data: event, isLoading } = useQuery<NostrEvent | null>({
    queryKey: ['tile-event', naddr],
    enabled: !!decoded,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      if (!decoded) return null;
      const results = await nostr.query(
        [{
          kinds: [decoded.kind],
          authors: [decoded.pubkey],
          '#d': [decoded.identifier],
          limit: 1,
        }],
        { signal },
      );
      return results[0] ?? null;
    },
  });

  const parsed = useMemo(() => {
    if (!event) return null;
    return parseTileDefEvent({
      id: event.id,
      pubkey: event.pubkey,
      created_at: event.created_at,
      kind: event.kind,
      content: event.content,
      tags: event.tags,
    });
  }, [event]);

  const author = useAuthor(event?.pubkey);
  const metadata = author.data?.metadata;

  useSeoMeta({
    title: parsed
      ? `${parsed.name} | Tiles | ${config.appName}`
      : `Tile | ${config.appName}`,
    description: parsed?.summary,
  });

  if (!decoded) {
    return (
      <MessagePage
        title="Invalid tile identifier"
        body="That link isn't a valid NIP-19 addressable-event pointer."
        navigate={navigate}
      />
    );
  }

  if (isLoading) return <DetailSkeleton />;

  if (!event || !parsed) {
    return (
      <MessagePage
        title="Tile not found"
        body="No tile matching this identifier was found on your current relays."
        navigate={navigate}
      />
    );
  }

  const installed = isInstalledByNaddr(naddr);
  const image = sanitizeUrl(parsed.image);

  const handleInstall = () => {
    installTile(event);
    requestGate();
  };

  const handleUninstall = () => {
    uninstallTile(naddr);
  };

  const verification = author.isLoading
    ? null
    : tileVerificationState(event, metadata);

  return (
    <main className="pb-16 sidebar:pb-0">
      <div className="flex items-center gap-2 px-4 pt-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </div>

      {/* Banner + identity */}
      <section className="px-4 pt-4">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="relative aspect-[16/9] bg-gradient-to-br from-primary/10 to-muted/20">
            {image ? (
              <img
                src={image}
                alt=""
                className="absolute inset-0 size-full object-cover"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30">
                <LayoutGrid className="size-14" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3 p-4">
            <div className="flex items-start gap-3">
              <Avatar className="size-10">
                <AvatarImage src={sanitizeUrl(metadata?.picture)} />
                <AvatarFallback>
                  {(metadata?.name ?? parsed.identifier).slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-bold leading-tight">{parsed.name}</h1>
                <div className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                  <span className="truncate">
                    by {metadata?.display_name ?? metadata?.name ?? parsed.identifier.split(':')[0]}
                  </span>
                  {verification === 'verified' && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <ShieldCheck className="size-3.5 shrink-0 text-emerald-500" aria-label="NIP-05 verified" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        The tile's identifier matches the author's NIP-05.
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {verification === 'unverified' && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          role="img"
                          aria-label="Unverified author"
                          className="flex size-4 shrink-0 items-center justify-center rounded-full bg-yellow-400/90 text-yellow-950"
                        >
                          <AlertTriangle className="size-2.5" strokeWidth={2.5} />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        The author hasn't published a NIP-05 identifier that matches this tile's namespace.
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <code className="rounded bg-muted px-1.5 py-0.5">{parsed.identifier}</code>
                  <Badge variant="secondary">v{parsed.version}</Badge>
                  <Badge variant="outline">Lua</Badge>
                </div>
              </div>
            </div>

            {parsed.summary && (
              <p className="text-sm text-muted-foreground">{parsed.summary}</p>
            )}

            <div className="flex flex-wrap gap-2">
              {installed ? (
                <>
                  <Button asChild>
                    <Link to={`/tiles/run/${encodeURIComponent(parsed.identifier)}`}>
                      <ExternalLink className="size-4" />
                      Open
                    </Link>
                  </Button>
                  <Button variant="outline" onClick={handleUninstall}>
                    <Trash2 className="size-4" />
                    Uninstall
                  </Button>
                </>
              ) : (
                <Button onClick={handleInstall}>
                  <Download className="size-4" />
                  Install
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Description */}
      {parsed.description && (
        <section className="px-4 pt-5">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">About</h2>
          <Card>
            <CardContent className="prose prose-sm dark:prose-invert max-w-none p-4">
              <Markdown rehypePlugins={[rehypeSanitize]}>{parsed.description}</Markdown>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Settings schema */}
      {parsed.settings.length > 0 && (
        <section className="px-4 pt-5">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Settings</h2>
          <Card>
            <CardContent className="space-y-2 p-4 text-sm">
              {parsed.settings.map((field) => (
                <div key={field.key} className="flex items-center gap-2">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{field.key}</code>
                  <span className="flex-1">{field.label}</span>
                  <Badge variant="outline">{field.type}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Source code */}
      <section className="px-4 pt-5">
        <Collapsible>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left text-sm font-medium hover:bg-accent">
            <span>View source ({parsed.script.length.toLocaleString()} chars)</span>
            <span className="text-xs text-muted-foreground">Lua 5.4</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-2 max-h-[50vh] overflow-auto rounded-lg bg-muted p-4 text-xs">
              <code>{parsed.script}</code>
            </pre>
          </CollapsibleContent>
        </Collapsible>
      </section>

      {/* Comments */}
      <section className="px-4 pt-5 pb-2">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-muted-foreground">Comments</h2>
        </div>
        <TileComments event={event} />
      </section>

      <Separator className="mx-4 mt-4" />
      <p className="px-4 pt-3 pb-4 text-center text-xs text-muted-foreground">
        Event id: <code>{event.id.slice(0, 16)}…</code>
        {event.tags.some(([n]) => n === 'client') && ' · published via Ditto'}
      </p>

      {nip19 && null}
    </main>
  );
}

// ---------------------------------------------------------------------------
// TileComments — NIP-22 comment thread for the tile event
// ---------------------------------------------------------------------------

function TileComments({ event }: { event: NostrEvent }) {
  const { user } = useCurrentUser();
  const { data: commentsData, isLoading } = useComments(event, 200);

  const orderedReplies: ThreadedReply[] = useMemo(() => {
    if (!commentsData) return [];
    return commentsData.topLevelComments
      .sort((a, b) => a.created_at - b.created_at)
      .map((reply) => ({
        reply,
        firstSubReply: commentsData.getDirectReplies(reply.id)[0],
      }));
  }, [commentsData]);

  return (
    <div className="space-y-4">
      {user && (
        <ComposeBox compact replyTo={event} />
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5 pt-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : orderedReplies.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No comments yet.{user ? ' Be the first!' : ''}
          </CardContent>
        </Card>
      ) : (
        <FlatThreadedReplyList replies={orderedReplies} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function DetailSkeleton() {
  return (
    <main className="pb-16 sidebar:pb-0">
      <div className="px-4 pt-4">
        <Skeleton className="h-8 w-20" />
      </div>
      <section className="px-4 pt-4">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Skeleton className="aspect-[16/9] w-full" />
          <div className="space-y-3 p-4">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      </section>
    </main>
  );
}

function MessagePage({
  title,
  body,
  navigate,
}: {
  title: string;
  body: string;
  navigate: ReturnType<typeof useNavigate>;
}) {
  return (
    <main className="pb-16 sidebar:pb-0">
      <div className="flex items-center gap-2 px-4 pt-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </div>
      <Card className="mx-4 mt-6 border-dashed">
        <CardContent className="py-12 px-8 text-center">
          <h1 className="text-base font-semibold">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        </CardContent>
      </Card>
    </main>
  );
}
