/**
 * `/settings/tiles` — configure installed tiles, manage their permissions,
 * and uninstall them.
 *
 * The runtime holds the authoritative `settingsFields` map (indexed by tile
 * identifier) — we read from `useNostrCanvas()` and write back via
 * `runtime.saveSettings()`. Permissions live in a per-user
 * localStorage-backed cache (see `capabilityCache.ts`); the UI enumerates
 * them via `listScopedPermissions` and revokes with `revokeScopedPermission`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { ExternalLink, LayoutGrid, Trash2, ShieldCheck, ShieldX } from 'lucide-react';
import { Link } from 'react-router-dom';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useInstalledTiles } from '@/hooks/useInstalledTiles';
import { useCanvasGate } from '@/lib/nostr-canvas/canvasGate';
import { useSafeNostrCanvas } from '@/lib/nostr-canvas/useSafeNostrCanvas';
import {
  forgetTilePermissions,
  listScopedPermissions,
  revokeScopedPermission,
  type PermissionEntry,
} from '@/lib/nostr-canvas/capabilityCache';
import { getDTag } from '@/lib/nostr-canvas/identifiers';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { useToast } from '@/hooks/useToast';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the canonical default for a settings field as a string.
 * Matches the runtime's storage format (booleans live as "true"/"false").
 */
function fieldDefault(field: SettingsField): string {
  if (field.type === 'boolean') {
    return field.default !== undefined ? String(field.default) : 'false';
  }
  if (field.type === 'text') return field.default ?? '';
  // dropdown
  return field.default ?? (field.options[0]?.value ?? '');
}

/** Group stored permission entries by tile identifier. */
function groupPermissions(
  entries: PermissionEntry[],
): Record<string, PermissionEntry[]> {
  const out: Record<string, PermissionEntry[]> = {};
  for (const e of entries) (out[e.identifier] ??= []).push(e);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// TileSettingsPage
// ─────────────────────────────────────────────────────────────────────────────

export function TileSettingsPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { gateOpen, requestGate } = useCanvasGate();
  const canvas = useSafeNostrCanvas();
  const { installedTiles, uninstallTile } = useInstalledTiles();
  const { toast } = useToast();

  useSeoMeta({
    title: `Tile settings | ${config.appName}`,
    description: 'Configure installed nostr-canvas tiles and manage their permissions.',
  });

  // Opening the gate lets the runtime load settings fields declared by
  // installed tiles; otherwise `canvas` stays undefined and fields are empty.
  useEffect(() => {
    if (!gateOpen) requestGate();
  }, [gateOpen, requestGate]);

  const runtime = canvas?.runtime;
  const settingsFields = canvas?.settingsFields ?? {};

  // Per-tile, per-key draft values. Keyed as `<identifier>::<key>` so
  // a single flat map covers all open forms.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Build a stable snapshot of current persisted values, initialised once
  // per tile so the inputs are controlled but don't fight the runtime.
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});

  // Permissions for the current user.
  const [permissions, setPermissions] = useState<
    Record<string, PermissionEntry[]>
  >(() => groupPermissions(listScopedPermissions(user?.pubkey ?? null)));

  // Refresh permissions when the user changes.
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

  const setDraft = useCallback(
    (identifier: string, key: string, value: string) => {
      setDrafts((prev) => ({ ...prev, [`${identifier}::${key}`]: value }));
    },
    [],
  );

  const saveTile = useCallback(
    (identifier: string, fields: SettingsField[]) => {
      if (!runtime) return;
      const values: Record<string, string> = {};
      for (const field of fields) {
        values[field.key] = draftValue(identifier, field);
      }
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

  const handleUninstall = useCallback(
    (naddr: string, identifier: string, name: string) => {
      const confirmed = window.confirm(
        `Uninstall "${name}"?\n\nThis removes the tile, its stored data, and all its permissions.`,
      );
      if (!confirmed) return;
      // Uninstall from AppConfig + local cache.
      uninstallTile(naddr);
      // Also wipe the runtime's per-tile store if the runtime is mounted.
      try {
        runtime?.uninstallTile(identifier);
      } catch {
        // Runtime may have already dropped it via InstalledTilesBinder.
      }
      forgetTilePermissions(user?.pubkey ?? null, identifier);
      setPermissions(groupPermissions(listScopedPermissions(user?.pubkey ?? null)));
    },
    [runtime, uninstallTile, user?.pubkey],
  );

  // Build the row list: every installed tile, plus any tile identifier
  // that has orphaned permission decisions (so users can still revoke them).
  const rows = useMemo(() => {
    const byIdent: Record<
      string,
      { naddr?: string; name: string; image?: string; identifier: string; event?: NostrEvent }
    > = {};
    for (const { naddr, event } of installedTiles) {
      const identifier = getDTag(event);
      if (!identifier) continue;
      byIdent[identifier] = {
        naddr,
        identifier,
        name:
          event.tags.find(([n]) => n === 'name')?.[1] ??
          identifier,
        image: sanitizeUrl(event.tags.find(([n]) => n === 'image')?.[1]),
        event,
      };
    }
    // Include any tile identifier that only has orphan permissions.
    for (const identifier of Object.keys(permissions)) {
      if (!byIdent[identifier]) {
        byIdent[identifier] = { identifier, name: identifier };
      }
    }
    return Object.values(byIdent);
  }, [installedTiles, permissions]);

  return (
    <main className="pb-16 sidebar:pb-0">
      <PageHeader
        title="Tile settings"
        icon={<LayoutGrid className="size-5" />}
        backTo="/settings"
      />

      <div className="px-4 pt-4 space-y-4 max-w-2xl mx-auto">
        <p className="text-sm text-muted-foreground">
          Configure installed tiles and manage which capabilities they're
          allowed to use. Uninstall removes the tile along with its stored
          data and permissions.
        </p>

        {rows.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 px-8 text-center space-y-2">
              <p className="text-sm font-medium">No installed tiles</p>
              <p className="text-sm text-muted-foreground">
                Browse the{' '}
                <Link to="/tiles" className="underline">Tiles page</Link>{' '}
                to install one.
              </p>
            </CardContent>
          </Card>
        ) : (
          rows.map((row) => {
            // Start with the fields declared in the tile's event tags — these
            // are always available from the local cache, even before the runtime
            // has mounted a tile instance. Then overlay any runtime-reported
            // fields (keyed by `field.key`), which win on collision so a tile
            // can conditionally add or replace fields at runtime.
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
              } catch {
                return [];
              }
            })();
            const runtimeFields: SettingsField[] = settingsFields[row.identifier] ?? [];
            // Merge: event fields first, then runtime fields override by key.
            const fieldMap = new Map<string, SettingsField>(
              eventFields.map((f) => [f.key, f]),
            );
            for (const f of runtimeFields) fieldMap.set(f.key, f);
            const fields = Array.from(fieldMap.values());
            const perms = permissions[row.identifier] ?? [];
            const saved = !!savedIds[row.identifier];
            return (
              <Card key={row.identifier} className="overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-3 border-b border-border bg-muted/30 p-3">
                  <div className="size-10 shrink-0 overflow-hidden rounded-md bg-muted">
                    {row.image ? (
                      <img
                        src={row.image}
                        alt=""
                        className="size-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground">
                        <LayoutGrid className="size-5" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-sm">{row.name}</p>
                    <p className="truncate text-xs text-muted-foreground font-mono">
                      {row.identifier}
                    </p>
                  </div>
                  {row.naddr && (
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Link to={`/tiles/${row.naddr}`} title="View in marketplace">
                        <ExternalLink className="size-4" />
                      </Link>
                    </Button>
                  )}
                  {row.naddr && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() =>
                        handleUninstall(row.naddr!, row.identifier, row.name)}
                    >
                      <Trash2 className="size-4 mr-1.5" />
                      Uninstall
                    </Button>
                  )}
                </div>

                <CardContent className="p-4 space-y-5">
                  {/* Settings */}
                  {fields.length > 0 && (
                    <section className="space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Settings
                      </h3>
                      <div className="space-y-3">
                        {fields.map((field) => (
                          <TileSettingInput
                            key={field.key}
                            field={field}
                            value={draftValue(row.identifier, field)}
                            onChange={(v) =>
                              setDraft(row.identifier, field.key, v)}
                          />
                        ))}
                      </div>
                      <Button
                        size="sm"
                        onClick={() => saveTile(row.identifier, fields)}
                        disabled={!runtime || saved}
                      >
                        {saved ? 'Saved' : 'Save'}
                      </Button>
                    </section>
                  )}

                  {/* Permissions */}
                  {perms.length > 0 && (
                    <section className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Permissions
                      </h3>
                      <ul className="divide-y divide-border rounded-md border border-border">
                        {perms.map((p) => (
                          <PermissionRow
                            key={p.capability}
                            capability={p.capability}
                            decision={p.decision}
                            onRevoke={() =>
                              handleRevoke(row.identifier, p.capability)}
                          />
                        ))}
                      </ul>
                    </section>
                  )}

                  {fields.length === 0 && perms.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      This tile has no settings or permissions yet.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────────────────────────────────────

function TileSettingInput({
  field,
  value,
  onChange,
}: {
  field: SettingsField;
  value: string;
  onChange: (v: string) => void;
}) {
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
    const checked = value === 'true';
    return (
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="cursor-pointer">{field.label}</Label>
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={(v) => onChange(v ? 'true' : 'false')}
        />
      </div>
    );
  }
  // dropdown
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{field.label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function PermissionRow({
  capability,
  decision,
  onRevoke,
}: {
  capability: Capability;
  decision: PermissionDecision;
  onRevoke: () => void;
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <span className="flex-1 truncate text-sm font-mono">{capability}</span>
      <Badge
        variant={decision === 'granted' ? 'default' : 'destructive'}
        className="gap-1"
      >
        {decision === 'granted'
          ? <ShieldCheck className="size-3" />
          : <ShieldX className="size-3" />}
        {decision}
      </Badge>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRevoke}
        title={decision === 'granted' ? 'Revoke this grant' : 'Forget this denial'}
      >
        Forget
      </Button>
    </li>
  );
}
