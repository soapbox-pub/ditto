import { useMemo, useState } from 'react';
import { LayoutGrid, Trash2 } from 'lucide-react';
import type { Capability, SettingsField } from '@soapbox.pub/nostr-canvas';
import { nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { RequireCanvas } from '@/components/CanvasRuntimeProvider';
import { useCanvasTileInstallations } from '@/components/CanvasTileInstallationsProvider';
import { useAppContext } from '@/hooks/useAppContext';
import { useSeoMeta } from '@/hooks/useSeoMeta';
import { parseTileDefinition } from '@/tiles/definition';
import type { InstalledCanvasTile } from '@/tiles/installations';

const CAPABILITY_LABELS: Record<Capability, string> = {
  'get-pubkey': 'Read your public key',
  'publish-event': 'Publish events',
  'nip44-encrypt': 'Encrypt NIP-44 messages',
  'nip44-decrypt': 'Decrypt NIP-44 messages',
  'bitcoin-sign-psbt': 'Sign Bitcoin PSBTs',
  fetch: 'Make network requests',
  navigate: 'Request navigation',
  'feed-action': 'Publish feed actions',
};

export function TileSettingsPage() {
  return (
    <RequireCanvas>
      <TileSettingsInner />
    </RequireCanvas>
  );
}

function TileSettingsInner() {
  const { config } = useAppContext();
  const installations = useCanvasTileInstallations();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [, setPermissionsUpdated] = useState(0);

  useSeoMeta({
    title: `Tiles | Settings | ${config.appName}`,
    description: 'Manage installed Nostr Canvas tiles, their permissions, and settings.',
  });

  const tiles = useMemo(() => config.installedCanvasTiles.map((coordinate) => {
    const event = installations.getCachedDefinition(coordinate);
    const definition = event && parseTileDefinition(event);
    const saved = config.canvasTileSettings.find((entry) => sameCoordinate(entry, coordinate))?.values ?? {};
    return { coordinate, definition, saved };
  }), [config.canvasTileSettings, config.installedCanvasTiles, installations]);

  const valueFor = (coordinate: InstalledCanvasTile, field: SettingsField, saved: Record<string, string>) => {
    const key = `${coordinate.pubkey}:${coordinate.identifier}:${field.key}`;
    return drafts[key] ?? saved[field.key] ?? fieldDefault(field);
  };

  const setValue = (coordinate: InstalledCanvasTile, field: SettingsField, value: string) => {
    const key = `${coordinate.pubkey}:${coordinate.identifier}:${field.key}`;
    setDrafts((current) => ({ ...current, [key]: value }));
  };

  return (
    <main className="mx-auto w-full max-w-3xl">
      <PageHeader title="Tiles" icon={<LayoutGrid className="size-5" />} backTo="/settings" />
      <div className="space-y-6 px-4 pb-8">
        <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <img src="/tiles-palette-intro.png" alt="" className="mx-auto size-28 object-contain sm:mx-0" />
            <div className="space-y-2">
              <h1 className="text-xl font-semibold">Your installed tiles</h1>
              <p className="text-sm text-muted-foreground">Review each tile's capabilities and configure the settings its author declared.</p>
              <Button asChild size="sm" variant="outline"><Link to="/tiles">Browse tiles</Link></Button>
            </div>
          </CardContent>
        </Card>

        {tiles.length === 0 ? (
          <Card className="border-dashed"><CardContent className="space-y-3 py-12 text-center"><p className="text-sm text-muted-foreground">No tiles are installed yet.</p><Button asChild variant="outline"><Link to="/tiles">Browse tiles</Link></Button></CardContent></Card>
        ) : tiles.map(({ coordinate, definition, saved }) => {
          if (!definition) return <UnavailableTileCard key={`${coordinate.pubkey}:${coordinate.identifier}`} coordinate={coordinate} onRemove={() => installations.uninstall(coordinate)} />;
          const granted = installations.getGrantedCapabilities(definition.identifier, definition.perms);
          const fields = definition.settings ?? [];
          return (
            <Card key={`${coordinate.pubkey}:${coordinate.identifier}`}>
              <CardContent className="space-y-5 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-primary">{definition.image ? <img src={definition.image} alt="" className="size-full object-cover" /> : <LayoutGrid className="size-6" />}</div>
                  <div className="min-w-0 flex-1"><h2 className="truncate font-semibold">{definition.name}</h2><p className="truncate font-mono text-xs text-muted-foreground">{definition.identifier}</p></div>
                  <Button asChild size="sm" variant="outline"><Link to={`/tiles/${nip19.naddrEncode({ kind: 30207, pubkey: coordinate.pubkey, identifier: coordinate.identifier })}`}>Details</Link></Button>
                </div>

                {fields.length > 0 && <section className="space-y-3 border-t pt-5"><h3 className="text-sm font-medium">Settings</h3>{fields.map((field) => <TileSettingField key={field.key} field={field} value={valueFor(coordinate, field, saved)} onChange={(value) => setValue(coordinate, field, value)} />)}<div className="flex justify-end"><Button size="sm" onClick={() => {
                  const values = Object.fromEntries(fields.map((field) => [field.key, valueFor(coordinate, field, saved)]));
                  installations.saveSettings(coordinate, values);
                }}>Save settings</Button></div></section>}

                {definition.perms.length > 0 && <section className="space-y-3 border-t pt-5"><h3 className="text-sm font-medium">Permissions</h3><p className="text-xs text-muted-foreground">Permissions are stored on this device and can be changed at any time.</p><div className="space-y-3">{definition.perms.map((permission) => {
                  const enabled = granted.includes(permission);
                  return <div key={permission} className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium">{CAPABILITY_LABELS[permission]}</p><Badge className="mt-1" variant="outline">{permission}</Badge></div><Switch checked={enabled} onCheckedChange={(checked) => {
                    installations.setGrantedCapabilities(coordinate, checked ? [...granted, permission] : granted.filter((item) => item !== permission));
                    setPermissionsUpdated((version) => version + 1);
                  }} aria-label={`${enabled ? 'Revoke' : 'Grant'} ${CAPABILITY_LABELS[permission]}`} /></div>;
                })}</div></section>}

                {fields.length === 0 && definition.perms.length === 0 && <p className="border-t pt-5 text-sm text-muted-foreground">This tile has no configurable settings or requested permissions.</p>}
                <div className="flex justify-end border-t pt-5"><Button size="sm" variant="ghost" className="gap-2 text-destructive hover:text-destructive" onClick={() => installations.uninstall(coordinate)}><Trash2 className="size-4" />Remove tile</Button></div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}

function TileSettingField({ field, value, onChange }: { field: SettingsField; value: string; onChange: (value: string) => void }) {
  const id = `tile-setting-${field.key}`;
  if (field.type === 'boolean') return <div className="flex items-center justify-between gap-4"><Label htmlFor={id}>{field.label}</Label><Switch id={id} checked={value === 'true'} onCheckedChange={(checked) => onChange(checked ? 'true' : 'false')} /></div>;
  if (field.type === 'dropdown') return <div className="space-y-2"><Label htmlFor={id}>{field.label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger id={id}><SelectValue /></SelectTrigger><SelectContent>{field.options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>;
  return <div className="space-y-2"><Label htmlFor={id}>{field.label}</Label><Input id={id} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function UnavailableTileCard({ coordinate, onRemove }: { coordinate: InstalledCanvasTile; onRemove: () => void }) {
  return <Card className="border-dashed"><CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-medium">Tile definition unavailable</p><p className="truncate font-mono text-xs text-muted-foreground">{coordinate.identifier}</p><p className="mt-2 text-sm text-muted-foreground">Reconnect to the tile's relay or browse the marketplace to restore its definition.</p></div><div className="flex gap-2"><Button asChild size="sm" variant="outline"><Link to="/tiles">Browse tiles</Link></Button><Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={onRemove}>Remove</Button></div></CardContent></Card>;
}

function fieldDefault(field: SettingsField): string {
  if (field.type === 'boolean') return field.default ? 'true' : 'false';
  if (field.type === 'dropdown') return field.default ?? field.options[0]?.value ?? '';
  return field.default ?? '';
}

function sameCoordinate(left: InstalledCanvasTile, right: InstalledCanvasTile): boolean {
  return left.pubkey === right.pubkey && left.identifier === right.identifier;
}
