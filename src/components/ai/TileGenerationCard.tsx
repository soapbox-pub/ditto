/**
 * `TileGenerationCard` — inline preview for an AI-generated tile.
 *
 * Lives inside a chat message bubble. Reads the tile draft out of the
 * module-level draft store, registers it with the nostr-canvas runtime as
 * an ephemeral definition, and exposes three tabs:
 *
 *   • Preview — live `TileView` rendered at placement="widget".
 *   • Code    — read-only pane showing the Lua source.
 *   • Settings — declared setting fields and their types.
 *
 * The footer surfaces the actions a user might take with a generated tile:
 * install it locally (signs a kind-30207 event and adds it to
 * `AppConfig.installedTiles`), publish it (same, but via `useNostrPublish`
 * so it lands on relays — gated on the account having a verified NIP-05),
 * or jump to the full tile runner. Registration happens even before the
 * canvas runtime is mounted via a gate request; we simply render a skeleton
 * until the runtime shows up.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';
import { settingFieldToTag, TILE_SCHEMA_VERSION } from '@soapbox.pub/nostr-canvas';
import {
  Bookmark,
  Check,
  Code2,
  ExternalLink,
  Eye,
  Send,
  Settings as SettingsIcon,
  Sparkles,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TileView } from '@/components/nostr-canvas/TileView';
import { useCanvasGate } from '@/lib/nostr-canvas/canvasGate';
import { useSafeNostrCanvas } from '@/lib/nostr-canvas/useSafeNostrCanvas';
import { getTileDraft } from '@/lib/nostr-canvas/draftStore';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useInstalledTiles } from '@/hooks/useInstalledTiles';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { canPublishTile } from '@/lib/nostr-canvas/identifiers';
import { cn } from '@/lib/utils';

const TILE_KIND = 30207;

interface TileGenerationCardProps {
  draftIdentifier: string;
  className?: string;
}

export function TileGenerationCard({ draftIdentifier, className }: TileGenerationCardProps) {
  const draft = getTileDraft(draftIdentifier);
  const navigate = useNavigate();
  const { requestGate } = useCanvasGate();
  const runtime = useSafeNostrCanvas();

  // Open the gate as soon as the card mounts so the runtime spins up.
  useEffect(() => {
    requestGate();
  }, [requestGate]);

  // Register the draft with the runtime once it's available.
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

  const { installTile, isInstalledByNaddr } = useInstalledTiles();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();

  const [installing, setInstalling] = useState(false);
  const [installedNaddr, setInstalledNaddr] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const alreadyInstalled = installedNaddr
    ? isInstalledByNaddr(installedNaddr)
    : false;

  /** Build an unsigned kind-30207 template from the draft. */
  const buildUnsignedTile = useCallback(() => {
    const tags: string[][] = [
      ['d', draft.identifier],
      ['t', 'nostr-canvas-tile'],
      ['s', TILE_SCHEMA_VERSION],
      ['name', draft.name],
      ['language', 'lua'],
    ];
    if (draft.summary) tags.push(['summary', draft.summary]);
    if (draft.description) tags.push(['description', draft.description]);
    if (draft.image) tags.push(['image', draft.image]);

    for (const field of draft.settings) {
      const tag = settingFieldToTag(field);
      if (tag) tags.push(tag);
    }

    return {
      kind: TILE_KIND,
      content: draft.script,
      tags,
    };
  }, [draft]);

  const handleInstall = useCallback(async () => {
    if (!user || installing) return;
    setInstalling(true);
    try {
      const template = buildUnsignedTile();
      const created_at = Math.floor(Date.now() / 1000);
      const signed: NostrEvent = await user.signer.signEvent({
        ...template,
        created_at,
      });
      const naddr = installTile(signed);
      setInstalledNaddr(naddr);
      toast({
        title: 'Tile installed',
        description: 'The draft is now available in your tile list.',
      });
    } catch (err) {
      console.error('Install failed:', err);
      toast({
        title: 'Install failed',
        description: err instanceof Error ? err.message : 'Unknown error.',
        variant: 'destructive',
      });
    } finally {
      setInstalling(false);
    }
  }, [user, installing, buildUnsignedTile, installTile, toast]);

  const handlePublish = useCallback(async () => {
    if (!user || publishing || !canPublish) return;
    setPublishing(true);
    try {
      const template = buildUnsignedTile();
      // useNostrPublish signs + publishes for us. It'll also add the NIP-89
      // `client` tag automatically.
      await publishEvent({
        kind: template.kind,
        content: template.content,
        tags: template.tags,
      });
      toast({
        title: 'Tile published',
        description: 'Your tile is live on your relays.',
      });
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
  }, [user, publishing, canPublish, buildUnsignedTile, publishEvent, toast]);

  const openFullView = useCallback(() => {
    navigate(`/tiles/run/${encodeURIComponent(draft.identifier)}`);
  }, [navigate, draft.identifier]);

  const settingsLabel = useMemo(() => {
    if (draft.settings.length === 0) return 'Settings';
    return `Settings (${draft.settings.length})`;
  }, [draft.settings.length]);

  return (
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

      {/* Tabs
          TabsList keeps its default h-10 + p-1 so the active-state shadow
          pill isn't clipped. We keep labels short and allow them to hide
          on narrow widths (the icon carries the meaning). */}
      <Tabs defaultValue="preview" className="px-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="preview" className="gap-1.5 text-xs px-2">
            <Eye className="size-3.5 shrink-0" />
            <span className="truncate">Preview</span>
          </TabsTrigger>
          <TabsTrigger value="code" className="gap-1.5 text-xs px-2">
            <Code2 className="size-3.5 shrink-0" />
            <span className="truncate">Code</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5 text-xs px-2">
            <SettingsIcon className="size-3.5 shrink-0" />
            <span className="truncate">{settingsLabel}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="mt-3">
          <div className="rounded-xl border border-border bg-secondary/30 p-3 min-h-[160px]">
            {runtime && registered ? (
              <TileView
                identifier={draft.identifier}
                placement="widget"
              />
            ) : (
              <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">
                Spinning up runtime…
              </div>
            )}
          </div>
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
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {field.type}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <code className="text-[10px] text-muted-foreground truncate">{field.key}</code>
                    {field.default !== undefined && (
                      <span className="text-[10px] text-muted-foreground">
                        default: {String(field.default)}
                      </span>
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
          variant="secondary"
          onClick={handleInstall}
          disabled={installing || !user || alreadyInstalled}
          className="gap-1.5"
        >
          {alreadyInstalled ? (
            <>
              <Check className="size-3.5" /> Installed
            </>
          ) : (
            <>
              <Bookmark className="size-3.5" /> {installing ? 'Installing…' : 'Install'}
            </>
          )}
        </Button>

        <Button
          size="sm"
          onClick={handlePublish}
          disabled={publishing || !canPublish || !user}
          className="gap-1.5"
          title={
            canPublish
              ? undefined
              : 'Publishing requires a verified NIP-05 address on your profile.'
          }
        >
          <Send className="size-3.5" />
          {publishing ? 'Publishing…' : 'Publish'}
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={openFullView}
          className="gap-1.5 ml-auto"
        >
          <ExternalLink className="size-3.5" /> Open
        </Button>
      </div>

      {!canPublish && (
        <p className="px-4 pb-3 -mt-1 text-[11px] text-muted-foreground">
          Set a verified NIP-05 address on your profile to publish tiles.
        </p>
      )}
    </div>
  );
}
