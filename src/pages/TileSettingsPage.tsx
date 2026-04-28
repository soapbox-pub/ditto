/**
 * `/settings/tiles` — "My Tiles"
 *
 * Two sections:
 *
 *   1. **Published** — kind-30207 tiles the current user has published to
 *      their relays. Displayed in a horizontal scroll strip. Each card has an
 *      "Unpublish" button that issues a kind-5 deletion event and an `a`-tag
 *      coordinate so both e-tag and a-tag aware relays honour it.
 *
 *   2. **Installed** — tiles in `AppConfig.installedTiles`, with settings,
 *      permission management, and an uninstall action. Merged settings fields
 *      from event tags + live runtime state (runtime wins on key collision).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import {
  LayoutGrid,
  Loader2,
  Rss,
  Trash2,
  Trash,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type {
  Capability,
  PermissionDecision,
  SettingsField,
} from '@soapbox.pub/nostr-canvas';
import { parseTileDefEvent } from '@soapbox.pub/nostr-canvas';
import type { NostrEvent } from '@nostrify/nostrify';

import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useInstalledTiles } from '@/hooks/useInstalledTiles';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCanvasGate } from '@/lib/nostr-canvas/canvasGate';
import { useSafeNostrCanvas } from '@/lib/nostr-canvas/useSafeNostrCanvas';
import {
  forgetTilePermissions,
  listScopedPermissions,
  revokeScopedPermission,
  type PermissionEntry,
} from '@/lib/nostr-canvas/capabilityCache';
import { getDTag, tileEventToNaddr } from '@/lib/nostr-canvas/identifiers';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { useToast } from '@/hooks/useToast';

const TILE_KIND = 30207;
const TILE_SCHEMA = '1';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fieldDefault(field: SettingsField): string {
  if (field.type === 'boolean') return field.default !== undefined ? String(field.default) : 'false';
  if (field.type === 'text') return field.default ?? '';
  return field.default ?? (field.options[0]?.value ?? '');
}

function groupPermissions(entries: PermissionEntry[]): Record<string, PermissionEntry[]> {
  const out: Record<string, PermissionEntry[]> = {};
  for (const e of entries) (out[e.identifier] ??= []).push(e);
  return out;
}

function tagValue(event: NostrEvent, name: string) {
  return event.tags.find(([t]) => t === name)?.[1];
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function TileSettingsPage() {
  const { config, updateConfig } = useAppContext();
  const { user } = useCurrentUser();
  const { gateOpen, requestGate } = useCanvasGate();
  const canvas = useSafeNostrCanvas();
  const { installedTiles, uninstallTile } = useInstalledTiles();
  const { toast } = useToast();
  const { nostr } = useNostr();
  const { mutateAsync: publishEvent } = useNostrPublish();

  useSeoMeta({
    title: `My Tiles | ${config.appName}`,
    description: 'Manage your published and installed nostr-canvas tiles.',
  });

  useEffect(() => {
    if (!gateOpen) requestGate();
  }, [gateOpen, requestGate]);

  const runtime = canvas?.runtime;
  const settingsFields = canvas?.settingsFields ?? {};
  // Identifiers of tiles that have registered at least one include_in_feed event.
  const feedCapableIdentifiers = useMemo(
    () => new Set(
      (canvas?.registrations ?? [])
        .filter((r) => r.include_in_feed)
        .map((r) => r.identifier),
    ),
    [canvas?.registrations],
  );

  // ── Published tiles query ─────────────────────────────────────────────────

  const { data: publishedEvents, isLoading: publishedLoading, refetch: refetchPublished } = useQuery<NostrEvent[]>({
    queryKey: ['tiles-published', user?.pubkey ?? ''],
    enabled: !!user?.pubkey,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      if (!user?.pubkey) return [];
      const results = await nostr.query(
        [{ kinds: [TILE_KIND], authors: [user.pubkey], '#t': ['nostr-canvas-tile'], limit: 100 }],
        { signal },
      );
      return [...results]
        .filter((e) => tagValue(e, 's') === TILE_SCHEMA)
        .sort((a, b) => b.created_at - a.created_at);
    },
  });

  // Track which event ids are being unpublished to show loading state.
  const [unpublishing, setUnpublishing] = useState<Set<string>>(new Set());

  // Single pending-confirmation slot. When set, the AlertDialog renders and
  // calls `pendingConfirm.action()` if the user clicks the confirm button.
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    action: () => void;
  } | null>(null);

  const confirm = useCallback(
    (opts: { title: string; description: string; confirmLabel: string; action: () => void }) => {
      setPendingConfirm(opts);
    },
    [],
  );

  const doUnpublish = useCallback(async (event: NostrEvent) => {
    if (!user) return;
    const identifier = getDTag(event) ?? '';
    const name = tagValue(event, 'name') ?? identifier;

    setUnpublishing((s) => new Set(s).add(event.id));
    try {
      // Publish kind-5 with both 'e' and 'a' tags for maximum relay compatibility.
      const coordTag = `${TILE_KIND}:${user.pubkey}:${identifier}`;
      await publishEvent({
        kind: 5,
        content: 'Tile unpublished',
        tags: [
          ['e', event.id],
          ['a', coordTag],
          ['k', String(TILE_KIND)],
        ],
      });
      toast({ description: `"${name}" unpublished.` });
      refetchPublished();
    } catch (err) {
      toast({
        title: 'Unpublish failed',
        description: err instanceof Error ? err.message : 'Unknown error.',
        variant: 'destructive',
      });
    } finally {
      setUnpublishing((s) => { const n = new Set(s); n.delete(event.id); return n; });
    }
  }, [user, publishEvent, toast, refetchPublished]);

  const handleUnpublish = useCallback((event: NostrEvent) => {
    const name = tagValue(event, 'name') ?? getDTag(event) ?? event.id.slice(0, 8);
    confirm({
      title: `Unpublish "${name}"?`,
      description:
        'This issues a deletion request to your relays. Relays that honour kind-5 deletions will remove it from the marketplace.',
      confirmLabel: 'Unpublish',
      action: () => doUnpublish(event),
    });
  }, [confirm, doUnpublish]);

  // ── Installed tiles ───────────────────────────────────────────────────────

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});

  const [permissions, setPermissions] = useState<Record<string, PermissionEntry[]>>(
    () => groupPermissions(listScopedPermissions(user?.pubkey ?? null)),
  );
  useEffect(() => {
    setPermissions(groupPermissions(listScopedPermissions(user?.pubkey ?? null)));
  }, [user?.pubkey]);

  const draftValue = useCallback(
    (identifier: string, field: SettingsField) => {
      const key = `${identifier}::${field.key}`;
      if (key in drafts) return drafts[key];
      if (!runtime) return fieldDefault(field);
      return runtime.getSetting(identifier, field.key) ?? fieldDefault(field);
    },
    [drafts, runtime],
  );

  const setDraft = useCallback((identifier: string, key: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [`${identifier}::${key}`]: value }));
  }, []);

  const saveTile = useCallback(
    (identifier: string, fields: SettingsField[]) => {
      if (!runtime) return;
      const values: Record<string, string> = {};
      for (const field of fields) values[field.key] = draftValue(identifier, field);
      runtime.saveSettings(identifier, values);
      setSavedIds((s) => ({ ...s, [identifier]: true }));
      toast({ description: 'Settings saved.' });
      setTimeout(() => setSavedIds((s) => ({ ...s, [identifier]: false })), 1500);
    },
    [runtime, draftValue, toast],
  );

  const handleRevoke = useCallback(
    (identifier: string, capability: Capability) => {
      revokeScopedPermission(user?.pubkey ?? null, identifier, capability);
      setPermissions(groupPermissions(listScopedPermissions(user?.pubkey ?? null)));
    },
    [user?.pubkey],
  );

  const isFeedEnabled = useCallback(
    (identifier: string) => !(config.tilesFeedDisabled ?? []).includes(identifier),
    [config.tilesFeedDisabled],
  );

  const toggleFeed = useCallback(
    (identifier: string, enabled: boolean) => {
      updateConfig((c) => {
        const current = c.tilesFeedDisabled ?? [];
        return {
          ...c,
          tilesFeedDisabled: enabled
            ? current.filter((id) => id !== identifier)
            : [...current.filter((id) => id !== identifier), identifier],
        };
      });
    },
    [updateConfig],
  );

  const handleUninstall = useCallback(
    (naddr: string, identifier: string, name: string) => {
      confirm({
        title: `Uninstall "${name}"?`,
        description: 'This removes the tile, its stored data, and all its permissions.',
        confirmLabel: 'Uninstall',
        action: () => {
          uninstallTile(naddr);
          try { runtime?.uninstallTile(identifier); } catch { /* already gone */ }
          forgetTilePermissions(user?.pubkey ?? null, identifier);
          setPermissions(groupPermissions(listScopedPermissions(user?.pubkey ?? null)));
        },
      });
    },
    [confirm, runtime, uninstallTile, user?.pubkey],
  );

  const installedRows = useMemo(() => {
    const byIdent: Record<string, { naddr?: string; name: string; image?: string; identifier: string; event?: NostrEvent }> = {};
    for (const { naddr, event } of installedTiles) {
      const identifier = getDTag(event);
      if (!identifier) continue;
      byIdent[identifier] = {
        naddr, identifier,
        name: event.tags.find(([t]) => t === 'name')?.[1] ?? identifier,
        image: sanitizeUrl(event.tags.find(([t]) => t === 'image')?.[1]),
        event,
      };
    }
    for (const identifier of Object.keys(permissions)) {
      if (!byIdent[identifier]) byIdent[identifier] = { identifier, name: identifier };
    }
    return Object.values(byIdent);
  }, [installedTiles, permissions]);

  return (
    <main className="pb-16 sidebar:pb-0">
      <PageHeader
        title="My Tiles"
        icon={<LayoutGrid className="size-5" />}
        backTo="/tiles"
      />

      <div className="px-4 pt-4 space-y-8 max-w-2xl mx-auto">

        {/* ── Published ─────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Published
            </h2>
            <Link to="/tiles" className="text-xs text-muted-foreground hover:text-foreground underline">
              Browse marketplace →
            </Link>
          </div>

          {!user ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Log in to see your published tiles.
              </CardContent>
            </Card>
          ) : publishedLoading ? (
            <div className="flex gap-3 overflow-hidden">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex-none w-40 overflow-hidden rounded-xl border border-border bg-card">
                  <Skeleton className="aspect-square w-full" />
                  <div className="p-2 space-y-1">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : !publishedEvents || publishedEvents.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                You haven't published any tiles yet. Use the AI chat to generate one.
              </CardContent>
            </Card>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 snap-x snap-mandatory">
              {publishedEvents.map((event) => (
                <PublishedTileCard
                  key={event.id}
                  event={event}
                  isUnpublishing={unpublishing.has(event.id)}
                  onUnpublish={() => handleUnpublish(event)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Installed ─────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Installed
          </h2>
          <p className="text-xs text-muted-foreground">
            Configure settings and manage permissions for installed tiles.
          </p>

          {installedRows.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No tiles installed.{' '}
                <Link to="/tiles" className="underline">Browse the marketplace</Link>.
              </CardContent>
            </Card>
          ) : (
            installedRows.map((row) => {
              const eventFields: SettingsField[] = (() => {
                if (!row.event) return [];
                try {
                  return parseTileDefEvent({
                    id: row.event.id,
                    pubkey: row.event.pubkey,
                    created_at: row.event.created_at,
                    kind: row.event.kind,
                    content: row.event.content,
                    tags: row.event.tags,
                  })?.settings ?? [];
                } catch { return []; }
              })();
              const runtimeFields: SettingsField[] = settingsFields[row.identifier] ?? [];
              const fieldMap = new Map<string, SettingsField>(eventFields.map((f) => [f.key, f]));
              for (const f of runtimeFields) fieldMap.set(f.key, f);
              const fields = Array.from(fieldMap.values());
              const perms = permissions[row.identifier] ?? [];
              const saved = !!savedIds[row.identifier];

              return (
                <Card key={row.identifier} className="overflow-hidden">
                  <div className="flex items-center gap-3 border-b border-border bg-muted/30 p-3">
                    <div className="size-10 shrink-0 overflow-hidden rounded-md bg-muted">
                      {row.image ? (
                        <img src={row.image} alt="" className="size-full object-cover" loading="lazy"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      ) : (
                        <div className="flex size-full items-center justify-center text-muted-foreground">
                          <LayoutGrid className="size-5" />
                        </div>
                      )}
                    </div>
                    {row.naddr ? (
                      <Link to={`/tiles/${row.naddr}`} className="flex-1 min-w-0 hover:opacity-75 transition-opacity">
                        <p className="truncate font-medium text-sm">{row.name}</p>
                        <p className="truncate text-xs text-muted-foreground font-mono">{row.identifier}</p>
                      </Link>
                    ) : (
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium text-sm">{row.name}</p>
                        <p className="truncate text-xs text-muted-foreground font-mono">{row.identifier}</p>
                      </div>
                    )}
                    {row.naddr && (
                      <Button
                        variant="ghost" size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleUninstall(row.naddr!, row.identifier, row.name)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>

                  <CardContent className="p-4 space-y-5">
                    {/* Feed toggle — only shown when the tile declares include_in_feed */}
                    {feedCapableIdentifiers.has(row.identifier) && (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Rss className="size-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-none">Show in feed</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Display this tile's events in your home feed.
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={isFeedEnabled(row.identifier)}
                          onCheckedChange={(v) => toggleFeed(row.identifier, v)}
                        />
                      </div>
                    )}

                    {fields.length > 0 && (
                      <section className="space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Settings</h3>
                        <div className="space-y-3">
                          {fields.map((field) => (
                            <TileSettingInput
                              key={field.key}
                              field={field}
                              value={draftValue(row.identifier, field)}
                              onChange={(v) => setDraft(row.identifier, field.key, v)}
                            />
                          ))}
                        </div>
                        <div className="flex justify-end">
                          <Button size="sm" onClick={() => saveTile(row.identifier, fields)} disabled={!runtime || saved}>
                            {saved ? 'Saved' : 'Save'}
                          </Button>
                        </div>
                      </section>
                    )}

                    {perms.length > 0 && (
                      <section className="space-y-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Permissions</h3>
                        <ul className="space-y-1">
                          {perms.map((p) => (
                            <PermissionRow
                              key={p.capability}
                              capability={p.capability}
                              decision={p.decision}
                              onRevoke={() => handleRevoke(row.identifier, p.capability)}
                            />
                          ))}
                        </ul>
                      </section>
                    )}

                    {!feedCapableIdentifiers.has(row.identifier) && fields.length === 0 && perms.length === 0 && (
                      <p className="text-sm text-muted-foreground">This tile has no settings or permissions yet.</p>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </section>
      </div>

      {/* Confirmation dialog — shared for Unpublish and Uninstall */}
      <AlertDialog open={!!pendingConfirm} onOpenChange={(open) => { if (!open) setPendingConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingConfirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{pendingConfirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                pendingConfirm?.action();
                setPendingConfirm(null);
              }}
            >
              {pendingConfirm?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PublishedTileCard
// ─────────────────────────────────────────────────────────────────────────────

function PublishedTileCard({
  event,
  isUnpublishing,
  onUnpublish,
}: {
  event: NostrEvent;
  isUnpublishing: boolean;
  onUnpublish: () => void;
}) {
  const naddr = tileEventToNaddr(event);
  const image = sanitizeUrl(tagValue(event, 'image'));
  const name = tagValue(event, 'name') ?? getDTag(event) ?? event.id.slice(0, 8);
  const summary = tagValue(event, 'summary');

  return (
    <div className="group relative flex-none w-40 snap-start overflow-hidden rounded-xl border border-border bg-card">
      <Link to={`/tiles/${naddr}`} className="block">
        <div className="relative aspect-square bg-gradient-to-br from-primary/10 to-muted/20">
          {image ? (
            <img src={image} alt="" className="absolute inset-0 size-full object-cover" loading="lazy"
              onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30">
              <LayoutGrid className="size-8" />
            </div>
          )}
        </div>
        <div className="p-2 space-y-0.5">
          <p className="truncate text-xs font-semibold">{name}</p>
          {summary && <p className="line-clamp-2 text-[11px] text-muted-foreground leading-tight">{summary}</p>}
        </div>
      </Link>
      {/* Unpublish button — visible on hover */}
      <div className="absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition-transform bg-background/95 backdrop-blur-sm border-t border-border p-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-7 text-destructive hover:text-destructive hover:bg-destructive/10 text-[11px] gap-1"
          onClick={onUnpublish}
          disabled={isUnpublishing}
        >
          {isUnpublishing
            ? <><Loader2 className="size-3 animate-spin" /> Unpublishing…</>
            : <><Trash className="size-3" /> Unpublish</>}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Setting inputs
// ─────────────────────────────────────────────────────────────────────────────

function TileSettingInput({ field, value, onChange }: { field: SettingsField; value: string; onChange: (v: string) => void }) {
  const id = `tile-field-${field.key}`;
  if (field.type === 'text') {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{field.label}</Label>
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  if (field.type === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="cursor-pointer">{field.label}</Label>
        <Switch id={id} checked={value === 'true'} onCheckedChange={(v) => onChange(v ? 'true' : 'false')} />
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{field.label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}><SelectValue /></SelectTrigger>
        <SelectContent>
          {field.options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Capability metadata
// ─────────────────────────────────────────────────────────────────────────────

const CAPABILITY_META: Record<Capability, { label: string; description: string }> = {
  'get-pubkey':       { label: 'Read your public key',    description: 'Let this tile see your npub.' },
  'sign-event':       { label: 'Sign events',             description: 'Allow this tile to sign Nostr events on your behalf.' },
  'publish-event':    { label: 'Publish events',          description: 'Allow this tile to publish events to your relays.' },
  'nip44-encrypt':    { label: 'Encrypt messages',        description: 'Allow this tile to encrypt data using NIP-44.' },
  'nip44-decrypt':    { label: 'Decrypt messages',        description: 'Allow this tile to decrypt data using NIP-44.' },
  'fetch':            { label: 'Make network requests',   description: 'Allow this tile to fetch data from external URLs.' },
  'navigate':         { label: 'Navigate',                description: 'Allow this tile to trigger in-app navigation.' },
  'register-events':  { label: 'Register event filters',  description: 'Allow this tile to subscribe to Nostr event streams.' },
};

function PermissionRow({ capability, decision, onRevoke }: { capability: Capability; decision: PermissionDecision; onRevoke: () => void }) {
  const meta = CAPABILITY_META[capability] ?? { label: capability, description: '' };
  const granted = decision === 'granted';
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-none">{meta.label}</p>
        {meta.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
        )}
      </div>
      <Switch
        checked={granted}
        onCheckedChange={() => onRevoke()}
        aria-label={granted ? `Revoke ${meta.label}` : `Forget denial of ${meta.label}`}
      />
    </li>
  );
}
