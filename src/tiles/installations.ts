import type { NostrEvent } from '@nostrify/nostrify';
import { parseTileDefEvent, type Capability, type SettingsField } from '@soapbox.pub/nostr-canvas';
import { isNostrId } from '@/lib/nostrId';

export interface InstalledCanvasTile {
  pubkey: string;
  identifier: string;
}

export interface CanvasTileSettings extends InstalledCanvasTile {
  values: Record<string, string>;
}

export interface CanvasTileRuntime {
  registerFromEvent(event: NostrEvent): void;
  uninstallTile(identifier: string): void;
  setScope(pubkey: string | null): void;
  saveSettings(identifier: string, values: Record<string, string>): void;
}

type StorageBackend = Map<string, string> | Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface CanvasTileInstallationsOptions {
  storage: StorageBackend;
  runtime: CanvasTileRuntime;
  saveCoordinates: (coordinates: InstalledCanvasTile[]) => void;
  saveTileSettings?: (settings: CanvasTileSettings[]) => void;
  fetchDefinition?: (filter: { kinds: number[]; authors: string[]; '#d': string[]; limit: number }) => Promise<NostrEvent[]>;
}

const CACHE_PREFIX = 'ditto:canvas-tile-definition:';
const GRANT_PREFIX = 'ditto:canvas-tile-grants:';

export class CanvasTileInstallations {
  private readonly storage: StorageBackend;
  private readonly runtime: CanvasTileRuntime;
  private readonly saveCoordinates: CanvasTileInstallationsOptions['saveCoordinates'];
  private readonly saveTileSettings: CanvasTileInstallationsOptions['saveTileSettings'];
  private readonly fetchDefinition: CanvasTileInstallationsOptions['fetchDefinition'];
  private account: string | null = null;
  private coordinates = new Map<string, InstalledCanvasTile>();
  private settings = new Map<string, CanvasTileSettings>();

  constructor(options: CanvasTileInstallationsOptions) {
    this.storage = options.storage;
    this.runtime = options.runtime;
    this.saveCoordinates = options.saveCoordinates;
    this.saveTileSettings = options.saveTileSettings;
    this.fetchDefinition = options.fetchDefinition;
  }

  setAccount(pubkey: string | null): void {
    this.account = pubkey;
    this.runtime.setScope(pubkey);
  }

  install(event: NostrEvent, approved: Capability[]): InstalledCanvasTile | undefined {
    const parsed = parseTileDefEvent(event);
    if (!parsed || !isNostrId(event.pubkey) || !this.account) return undefined;
    const coordinate = { pubkey: event.pubkey, identifier: parsed.identifier };
    this.coordinates.set(coordinateKey(coordinate), coordinate);
    this.cacheDefinition(coordinate, event);
    this.writeGrants(coordinate.identifier, parsed.perms.filter((permission) => approved.includes(permission)));
    this.runtime.registerFromEvent(event);
    this.persistCoordinates();
    return coordinate;
  }

  async restore(coordinates: unknown[], settings: unknown[] = []): Promise<void> {
    this.coordinates = new Map();
    this.settings = new Map();
    for (const input of coordinates) {
      const coordinate = parseCoordinate(input);
      if (!coordinate) continue;
      this.coordinates.set(coordinateKey(coordinate), coordinate);
      const event = this.getCachedDefinition(coordinate) ?? await this.fetch(coordinate);
      const parsed = event && parseTileDefEvent(event);
      if (!parsed || event.pubkey !== coordinate.pubkey || parsed.identifier !== coordinate.identifier) continue;
      this.cacheDefinition(coordinate, event);
      this.runtime.registerFromEvent(event);
    }
    for (const input of settings) {
      const entry = parseSettings(input);
      if (!entry || !this.coordinates.has(coordinateKey(entry))) continue;
      this.applySettings(entry);
    }
  }

  uninstall(coordinate: InstalledCanvasTile): void {
    const key = coordinateKey(coordinate);
    this.coordinates.delete(key);
    this.settings.delete(key);
    this.remove(CACHE_PREFIX + key);
    this.removeGrant(coordinate.identifier);
    this.runtime.uninstallTile(coordinate.identifier);
    this.persistCoordinates();
    this.persistSettings();
  }

  saveSettings(coordinate: InstalledCanvasTile, values: Record<string, string>): void {
    const event = this.getCachedDefinition(coordinate);
    const parsed = event && parseTileDefEvent(event);
    if (!parsed || !this.coordinates.has(coordinateKey(coordinate))) return;
    const safeValues = filterSettings(parsed.settings, values);
    const entry = { ...coordinate, values: safeValues };
    this.settings.set(coordinateKey(coordinate), entry);
    this.runtime.saveSettings(coordinate.identifier, safeValues);
    this.persistSettings();
  }

  getCachedDefinition(coordinate: InstalledCanvasTile): NostrEvent | undefined {
    const raw = this.get(CACHE_PREFIX + coordinateKey(coordinate));
    if (!raw) return undefined;
    try {
      const event: unknown = JSON.parse(raw);
      return isNostrEvent(event) ? event : undefined;
    } catch {
      return undefined;
    }
  }

  getGrantedCapabilities(identifier: string, declared: Capability[]): Capability[] {
    if (!this.account) return [];
    const raw = this.get(GRANT_PREFIX + this.account);
    if (!raw) return [];
    try {
      const grants: unknown = JSON.parse(raw);
      const stored = typeof grants === 'object' && grants !== null ? (grants as Record<string, unknown>)[identifier] : undefined;
      return Array.isArray(stored) ? stored.filter((value): value is Capability => typeof value === 'string' && declared.includes(value as Capability)) : [];
    } catch {
      return [];
    }
  }

  private applySettings(entry: CanvasTileSettings): void {
    const event = this.getCachedDefinition(entry);
    const parsed = event && parseTileDefEvent(event);
    if (!parsed) return;
    const values = filterSettings(parsed.settings, entry.values);
    this.settings.set(coordinateKey(entry), { ...entry, values });
    this.runtime.saveSettings(entry.identifier, values);
  }

  private async fetch(coordinate: InstalledCanvasTile): Promise<NostrEvent | undefined> {
    const events = await this.fetchDefinition?.({ kinds: [30207], authors: [coordinate.pubkey], '#d': [coordinate.identifier], limit: 1 });
    return events?.[0];
  }

  private cacheDefinition(coordinate: InstalledCanvasTile, event: NostrEvent): void {
    this.set(CACHE_PREFIX + coordinateKey(coordinate), JSON.stringify(event));
  }

  private writeGrants(identifier: string, grants: Capability[]): void {
    if (!this.account) return;
    const key = GRANT_PREFIX + this.account;
    let stored: Record<string, Capability[]> = {};
    try { stored = JSON.parse(this.get(key) ?? '{}') as Record<string, Capability[]>; } catch { /* replace invalid grants */ }
    this.set(key, JSON.stringify({ ...stored, [identifier]: grants }));
  }

  private removeGrant(identifier: string): void {
    if (!this.account) return;
    const key = GRANT_PREFIX + this.account;
    try {
      const grants = JSON.parse(this.get(key) ?? '{}') as Record<string, Capability[]>;
      delete grants[identifier];
      this.set(key, JSON.stringify(grants));
    } catch { this.remove(key); }
  }

  private persistCoordinates(): void { this.saveCoordinates([...this.coordinates.values()]); }
  private persistSettings(): void { this.saveTileSettings?.([...this.settings.values()]); }
  private get(key: string): string | null { return this.storage instanceof Map ? this.storage.get(key) ?? null : this.storage.getItem(key); }
  private set(key: string, value: string): void { if (this.storage instanceof Map) this.storage.set(key, value); else this.storage.setItem(key, value); }
  private remove(key: string): void { if (this.storage instanceof Map) this.storage.delete(key); else this.storage.removeItem(key); }
}

function coordinateKey({ pubkey, identifier }: InstalledCanvasTile): string { return `${pubkey}:${identifier}`; }
function parseCoordinate(input: unknown): InstalledCanvasTile | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const { pubkey, identifier } = input as Record<string, unknown>;
  return isNostrId(pubkey) && typeof identifier === 'string' && identifier.includes('@') && identifier.includes(':') ? { pubkey, identifier } : undefined;
}
function parseSettings(input: unknown): CanvasTileSettings | undefined {
  const coordinate = parseCoordinate(input);
  const values = input && typeof input === 'object' ? (input as Record<string, unknown>).values : undefined;
  if (!coordinate || !values || typeof values !== 'object' || Array.isArray(values)) return undefined;
  const entries = Object.entries(values);
  if (entries.some(([, value]) => typeof value !== 'string')) return undefined;
  return { ...coordinate, values: Object.fromEntries(entries) };
}
function filterSettings(fields: SettingsField[], values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter(([key, value]) => {
    const field = fields.find((candidate) => candidate.key === key);
    if (!field) return false;
    if (field.type === 'boolean') return value === 'true' || value === 'false';
    return field.type !== 'dropdown' || field.options.some((option) => option.value === value);
  }));
}
function isNostrEvent(value: unknown): value is NostrEvent {
  return !!value && typeof value === 'object' && typeof (value as NostrEvent).pubkey === 'string' && Array.isArray((value as NostrEvent).tags);
}
