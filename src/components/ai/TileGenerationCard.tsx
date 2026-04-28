/**
 * `TileGenerationCard` — inline preview for an AI-generated tile.
 *
 * Lives inside a chat message bubble. Reads the tile draft out of the
 * module-level draft store, registers it with the nostr-canvas runtime as
 * an ephemeral definition, and exposes three tabs:
 *
 *   • Preview — shows a Play overlay; clicking it starts the live TileView.
 *     Only one tile preview across the entire chat can be running at once —
 *     activating a second one stops the first.
 *   • Code    — read-only pane showing the Lua source.
 *   • Settings — declared setting fields and their types.
 *
 * The sole action is **Publish** — opens a review modal where the user can
 * edit name, summary, description, upload a banner image via Blossom, and
 * then publish a kind-30207 event with a proper `<nip05>:<slug>` d-tag.
 * Requires a verified NIP-05 on the account. On success the user is
 * navigated to the tile's marketplace page so they can install from there.
 *
 * Local install is intentionally removed: tiles published to relays can be
 * unpublished via kind-5 deletion; there is no equivalent undo for local-only
 * installs, and the `.local:` identifier produces confusing UX.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';
import { settingFieldToTag, TILE_SCHEMA_VERSION } from '@soapbox.pub/nostr-canvas';
import {
  Code2,
  ExternalLink,
  Eye,
  Loader2,
  Play,
  Send,
  Settings as SettingsIcon,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ImageField } from '@/components/ui/ImageField';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { TileView } from '@/components/nostr-canvas/TileView';
import { useCanvasGate } from '@/lib/nostr-canvas/canvasGate';
import { useSafeNostrCanvas } from '@/lib/nostr-canvas/useSafeNostrCanvas';
import { getTileDraft } from '@/lib/nostr-canvas/draftStore';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useInstalledTiles } from '@/hooks/useInstalledTiles';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import {
  buildPublishableIdentifier,
  canPublishTile,
  tileEventToNaddr,
} from '@/lib/nostr-canvas/identifiers';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

const TILE_KIND = 30207;

// ---------------------------------------------------------------------------
// Active-preview store — only one tile preview runs at a time across the
// whole chat. Module-level so all card instances share the same state.
// ---------------------------------------------------------------------------

type Listener = () => void;
let activePreviewId: string | null = null;
const previewListeners = new Set<Listener>();

function setActivePreview(id: string | null): void {
  activePreviewId = id;
  for (const l of previewListeners) l();
}

function subscribeActivePreview(listener: Listener): () => void {
  previewListeners.add(listener);
  return () => previewListeners.delete(listener);
}

function getActivePreview(): string | null {
  return activePreviewId;
}

function useActivePreview(id: string): [boolean, () => void, () => void] {
  const current = useSyncExternalStore(subscribeActivePreview, getActivePreview, getActivePreview);
  const isActive = current === id;
  const activate = useCallback(() => setActivePreview(id), [id]);
  const deactivate = useCallback(() => {
    if (activePreviewId === id) setActivePreview(null);
  }, [id]);
  return [isActive, activate, deactivate];
}

// ---------------------------------------------------------------------------
// Placement hint options
// ---------------------------------------------------------------------------

const PLACEMENT_OPTIONS = [
  { value: 'widget', label: 'Widget' },
  { value: 'main', label: 'Main' },
  { value: 'feed', label: 'Feed' },
] as const;

type PlacementHint = typeof PLACEMENT_OPTIONS[number]['value'];

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

interface TileGenerationCardProps {
  draftIdentifier: string;
  className?: string;
}

export function TileGenerationCard({ draftIdentifier, className }: TileGenerationCardProps) {
  const draft = getTileDraft(draftIdentifier);
  const navigate = useNavigate();
  const { requestGate } = useCanvasGate();
  const runtime = useSafeNostrCanvas();

  useEffect(() => {
    requestGate();
  }, [requestGate]);

  const [registered, setRegistered] = useState(false);
  useEffect(() => {
    if (!runtime || !draft || registered) return;
    try {
      runtime.runtime.register({
        identifier: draft.identifier,
        script: draft.script,
        language: 'lua',
      });
      setRegistered(true);
    } catch (err) {
      console.error('Failed to register tile draft:', err);
    }
  }, [runtime, draft, registered]);

  if (!draft) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-dashed border-border bg-secondary/30 px-4 py-6 text-sm text-muted-foreground',
          className,
        )}
      >
        <p className="font-medium text-foreground mb-1">Preview expired</p>
        <p>
          The tile draft for this message was cleared (page reload or tab
          switch). Ask the AI to regenerate it.
        </p>
      </div>
    );
  }

  return (
    <TileGenerationCardInner
      draft={draft}
      runtime={runtime}
      registered={registered}
      navigate={navigate}
      className={className}
    />
  );
}

// ---------------------------------------------------------------------------
// Inner component
// ---------------------------------------------------------------------------

interface TileGenerationCardInnerProps {
  draft: NonNullable<ReturnType<typeof getTileDraft>>;
  runtime: ReturnType<typeof useSafeNostrCanvas>;
  registered: boolean;
  navigate: ReturnType<typeof useNavigate>;
  className?: string;
}

function TileGenerationCardInner({
  draft,
  runtime,
  registered,
  navigate,
  className,
}: TileGenerationCardInnerProps) {
  const { user } = useCurrentUser();
  const author = useAuthor(user?.pubkey);
  const metadata = author.data?.metadata;
  const canPublish = canPublishTile(metadata);

  const [placement, setPlacement] = useState<PlacementHint>('widget');
  const [publishModalOpen, setPublishModalOpen] = useState(false);

  const previewSlotId = useMemo(() => draft.identifier, [draft.identifier]);
  const [previewActive, activatePreview, deactivatePreview] = useActivePreview(previewSlotId);

  const handleTabChange = useCallback((tab: string) => {
    if (tab !== 'preview') deactivatePreview();
  }, [deactivatePreview]);

  const draftSlug = useMemo(() => {
    const colon = draft.identifier.lastIndexOf(':');
    return colon !== -1 ? draft.identifier.slice(colon + 1) : draft.identifier;
  }, [draft.identifier]);

  const openFullView = useCallback(() => {
    navigate(`/tiles/run/${encodeURIComponent(draft.identifier)}`);
  }, [navigate, draft.identifier]);

  const settingsLabel = useMemo(
    () => draft.settings.length === 0 ? 'Settings' : `Settings (${draft.settings.length})`,
    [draft.settings.length],
  );

  return (
    <>
      <div
        className={cn(
          'rounded-2xl border border-border bg-background/60 overflow-hidden',
          className,
        )}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-4 pt-4 pb-3">
          <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Sparkles className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold truncate">{draft.name}</h3>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">
                Draft
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{draft.summary}</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="preview" className="px-4" onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="preview" className="gap-1.5 text-xs px-2">
              <Eye className="size-3.5 shrink-0" /><span className="truncate">Preview</span>
            </TabsTrigger>
            <TabsTrigger value="code" className="gap-1.5 text-xs px-2">
              <Code2 className="size-3.5 shrink-0" /><span className="truncate">Code</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5 text-xs px-2">
              <SettingsIcon className="size-3.5 shrink-0" /><span className="truncate">{settingsLabel}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="mt-3">
            <div className="flex items-center gap-1 mb-2">
              {PLACEMENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPlacement(opt.value)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
                    placement === opt.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:text-foreground',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="relative rounded-xl border border-border bg-secondary/30 min-h-[160px]">
              {previewActive && runtime && registered ? (
                <div className="p-3">
                  <TileView identifier={draft.identifier} placement={placement} />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={activatePreview}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors group"
                  aria-label="Run tile preview"
                >
                  <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    {!runtime
                      ? <Loader2 className="size-5 animate-spin" />
                      : <Play className="size-5 ml-0.5" />}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {!runtime ? 'Loading runtime…' : 'Click to run preview'}
                  </span>
                </button>
              )}
            </div>

            {previewActive && (
              <button
                type="button"
                onClick={deactivatePreview}
                className="mt-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Stop preview
              </button>
            )}
          </TabsContent>

          <TabsContent value="code" className="mt-3">
            <pre className="rounded-xl border border-border bg-secondary/30 p-3 text-[11px] font-mono leading-relaxed overflow-auto max-h-80 whitespace-pre">
              {draft.script}
            </pre>
          </TabsContent>

          <TabsContent value="settings" className="mt-3">
            {draft.settings.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-secondary/30 px-3 py-6 text-xs text-muted-foreground text-center">
                This tile declares no settings.
              </div>
            ) : (
              <ul className="rounded-xl border border-border bg-secondary/30 divide-y divide-border">
                {draft.settings.map((field) => (
                  <li key={field.key} className="px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{field.label}</span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{field.type}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <code className="text-[10px] text-muted-foreground truncate">{field.key}</code>
                      {field.default !== undefined && (
                        <span className="text-[10px] text-muted-foreground">default: {String(field.default)}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-4">
          <Button
            size="sm"
            onClick={() => setPublishModalOpen(true)}
            disabled={!user || !canPublish}
            className="gap-1.5"
            title={
              !user
                ? 'Log in to publish'
                : !canPublish
                  ? 'A verified NIP-05 address is required to publish'
                  : 'Review and publish to your relays'
            }
          >
            <Send className="size-3.5" />
            Publish
          </Button>

          <Button size="sm" variant="ghost" onClick={openFullView} className="gap-1.5 ml-auto">
            <ExternalLink className="size-3.5" /> Open
          </Button>
        </div>

        {user && !canPublish && (
          <p className="px-4 pb-3 -mt-1 text-[11px] text-muted-foreground">
            You don&apos;t have a NIP-05 configured.{' '}
            <Link to="/settings/profile" className="underline hover:text-foreground">
              Set one
            </Link>{' '}
            to publish your tile.
          </p>
        )}
      </div>

      {publishModalOpen && user && (
        <TilePublishModal
          draft={draft}
          draftSlug={draftSlug}
          nip05={metadata?.nip05}
          onClose={() => setPublishModalOpen(false)}
          onPublished={(naddr) => {
            setPublishModalOpen(false);
            navigate(`/tiles/${naddr}`);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// TilePublishModal
// ---------------------------------------------------------------------------

interface TilePublishModalProps {
  draft: NonNullable<ReturnType<typeof getTileDraft>>;
  draftSlug: string;
  nip05: string | undefined;
  onClose: () => void;
  /** Called with the naddr of the published tile so the parent can navigate. */
  onPublished: (naddr: string) => void;
}

function TilePublishModal({
  draft,
  draftSlug,
  nip05,
  onClose,
  onPublished,
}: TilePublishModalProps) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { installTile } = useInstalledTiles();
  const { toast } = useToast();

  const [name, setName] = useState(draft.name);
  const [summary, setSummary] = useState(draft.summary);
  const [description, setDescription] = useState(draft.description ?? '');
  const [imageUrl, setImageUrl] = useState(draft.image ?? '');
  const [publishing, setPublishing] = useState(false);

  const publishableId = useMemo(
    () => buildPublishableIdentifier(nip05, draftSlug),
    [nip05, draftSlug],
  );

  const handlePublish = useCallback(async () => {
    if (!user || publishing || !publishableId) return;

    const trimmedName = name.trim();
    const trimmedSummary = summary.trim();
    if (!trimmedName || !trimmedSummary) {
      toast({ title: 'Name and summary are required', variant: 'destructive' });
      return;
    }

    setPublishing(true);
    try {
      const tags: string[][] = [
        ['d', publishableId],
        ['t', 'nostr-canvas-tile'],
        ['s', TILE_SCHEMA_VERSION],
        ['name', trimmedName],
        ['language', 'lua'],
        ['summary', trimmedSummary],
      ];
      if (description.trim()) tags.push(['description', description.trim()]);
      const safeImage = sanitizeUrl(imageUrl.trim());
      if (safeImage) tags.push(['image', safeImage]);
      for (const field of draft.settings) {
        const tag = settingFieldToTag(field);
        if (tag) tags.push(tag);
      }

      const signed = await publishEvent({ kind: TILE_KIND, content: draft.script, tags });

      // Also install locally so the user can run it immediately from
      // the marketplace page they're about to land on.
      installTile(signed as unknown as NostrEvent);

      const naddr = tileEventToNaddr(signed as unknown as NostrEvent);
      toast({ title: 'Tile published', description: 'Taking you to your tile…' });
      onPublished(naddr);
    } catch (err) {
      console.error('Publish failed:', err);
      toast({
        title: 'Publish failed',
        description: err instanceof Error ? err.message : 'Unknown error.',
        variant: 'destructive',
      });
    } finally {
      setPublishing(false);
    }
  }, [
    user, publishing, publishableId, name, summary, description, imageUrl,
    draft, publishEvent, installTile, toast, onPublished,
  ]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="size-4 shrink-0" />
            Publish tile
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <ImageField label="Banner image" value={imageUrl} onChange={setImageUrl} />

          <div className="space-y-1.5">
            <Label htmlFor="tile-publish-name">Name</Label>
            <Input id="tile-publish-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weather Station" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tile-publish-summary">Summary</Label>
            <Input id="tile-publish-summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One-line description" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tile-publish-description">
              Description <span className="text-muted-foreground font-normal">(optional, Markdown)</span>
            </Label>
            <Textarea id="tile-publish-description" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your tile in more detail…" rows={3} />
          </div>

          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 space-y-0.5">
            <p className="text-xs font-medium text-muted-foreground">Tile identifier</p>
            {publishableId
              ? <code className="text-xs">{publishableId}</code>
              : <p className="text-xs text-amber-600 dark:text-amber-400">NIP-05 required to publish.</p>}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={publishing}>Cancel</Button>
          <Button onClick={handlePublish} disabled={publishing || !publishableId} className="gap-1.5">
            {publishing
              ? <><Loader2 className="size-3.5 animate-spin" /> Publishing…</>
              : <><Send className="size-3.5" /> Publish</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
