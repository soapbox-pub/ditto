import type { NostrEvent } from '@nostrify/nostrify';
import { finalizeEvent, getPublicKey } from 'nostr-tools';
import { describe, expect, it, vi } from 'vitest';
import {
  CanvasTileInstallations,
  type CanvasTileRuntime,
  type InstalledCanvasTile,
} from './installations';

const ALICE_PRIVATE_KEY = new Uint8Array(32).fill(1);
const ALICE = getPublicKey(ALICE_PRIVATE_KEY);
const BOB = getPublicKey(new Uint8Array(32).fill(2));

function tileEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  const { id: _id, pubkey: _pubkey, sig: _sig, ...unsigned } = overrides;
  return {
    ...finalizeEvent({
      created_at: 1_700_000_000,
      kind: 30207,
      content: 'function render() return ui.Text("Weather") end',
      tags: [
      ['d', 'alice@example.com:weather'],
      ['name', 'Weather'],
      ['v', '1.0.0'],
      ['s', '3'],
      ['language', 'lua'],
      ['t', 'nostr-canvas-tile'],
      ['perm', 'fetch'],
      ['perm', 'publish-event'],
      ],
      ...unsigned,
    }, ALICE_PRIVATE_KEY),
    ...overrides,
  };
}

function runtime(): CanvasTileRuntime {
  return {
    registerFromEvent: vi.fn(),
    uninstallTile: vi.fn(),
    setScope: vi.fn(),
    saveSettings: vi.fn(),
  };
}

describe('CanvasTileInstallations', () => {
  it('installs only validated definitions, syncs their author-bound coordinates, and keeps source in the local cache', () => {
    const tileRuntime = runtime();
    const savedCoordinates = vi.fn();
    const installations = new CanvasTileInstallations({
      storage: new Map(),
      runtime: tileRuntime,
      saveCoordinates: savedCoordinates,
    });

    installations.setAccount(ALICE);
    const event = tileEvent();
    const installed = installations.install(event, ['fetch']);

    const coordinate: InstalledCanvasTile = {
      pubkey: ALICE,
      identifier: 'alice@example.com:weather',
    };
    expect(installed).toEqual(coordinate);
    expect(savedCoordinates).toHaveBeenCalledWith([coordinate]);
    expect(tileRuntime.registerFromEvent).toHaveBeenCalledWith(event);
    expect(installations.getGrantedCapabilities('alice@example.com:weather', ['fetch', 'publish-event'])).toEqual(['fetch']);
    expect(installations.getCachedDefinition(coordinate)).toMatchObject({
      id: event.id,
      pubkey: event.pubkey,
      content: event.content,
      tags: event.tags,
    });
  });

  it('restores a missing local definition only through an author-constrained coordinate query', async () => {
    const tileRuntime = runtime();
    const event = tileEvent();
    const query = vi.fn().mockResolvedValue([event]);
    const coordinate: InstalledCanvasTile = { pubkey: ALICE, identifier: 'alice@example.com:weather' };
    const installations = new CanvasTileInstallations({
      storage: new Map(),
      runtime: tileRuntime,
      saveCoordinates: vi.fn(),
      fetchDefinition: query,
    });

    installations.setAccount(ALICE);
    await installations.restore([coordinate]);

    expect(query).toHaveBeenCalledWith({ kinds: [30207], authors: [ALICE], '#d': ['alice@example.com:weather'], limit: 1 });
    expect(tileRuntime.registerFromEvent).toHaveBeenCalledWith(event);
    expect(installations.getGrantedCapabilities('alice@example.com:weather', ['fetch'])).toEqual([]);
  });

  it('never accepts malformed synced coordinates or definitions from another author', async () => {
    const tileRuntime = runtime();
    const query = vi.fn().mockResolvedValue([tileEvent({ pubkey: BOB })]);
    const installations = new CanvasTileInstallations({
      storage: new Map(),
      runtime: tileRuntime,
      saveCoordinates: vi.fn(),
      fetchDefinition: query,
    });

    installations.setAccount(ALICE);
    await installations.restore([
      { pubkey: 'not-a-pubkey', identifier: 'broken' },
      { pubkey: ALICE, identifier: 'alice@example.com:weather' },
    ]);

    expect(tileRuntime.registerFromEvent).not.toHaveBeenCalled();
  });

  it('does not leak grants between accounts or an anonymous scope', () => {
    const tileRuntime = runtime();
    const installations = new CanvasTileInstallations({ storage: new Map(), runtime: tileRuntime, saveCoordinates: vi.fn() });

    installations.setAccount(ALICE);
    installations.install(tileEvent(), ['fetch']);
    expect(installations.getGrantedCapabilities('alice@example.com:weather', ['fetch'])).toEqual(['fetch']);

    installations.setAccount(BOB);
    expect(installations.getGrantedCapabilities('alice@example.com:weather', ['fetch'])).toEqual([]);
    installations.setAccount(null);
    expect(installations.getGrantedCapabilities('alice@example.com:weather', ['fetch'])).toEqual([]);
    expect(tileRuntime.setScope).toHaveBeenLastCalledWith(null);
  });

  it('updates duplicate identifiers in place and removes their local cache and grants on uninstall', () => {
    const tileRuntime = runtime();
    const saveCoordinates = vi.fn();
    const installations = new CanvasTileInstallations({ storage: new Map(), runtime: tileRuntime, saveCoordinates });
    const coordinate: InstalledCanvasTile = { pubkey: ALICE, identifier: 'alice@example.com:weather' };

    installations.setAccount(ALICE);
    installations.install(tileEvent(), ['fetch']);
    installations.install(tileEvent({ created_at: 1_700_000_100 }), ['fetch']);
    installations.uninstall(coordinate);

    expect(saveCoordinates).toHaveBeenLastCalledWith([]);
    expect(tileRuntime.uninstallTile).toHaveBeenCalledWith(coordinate.identifier);
    expect(installations.getCachedDefinition(coordinate)).toBeUndefined();
    expect(installations.getGrantedCapabilities(coordinate.identifier, ['fetch'])).toEqual([]);
  });

  it('syncs declared tile settings through Ditto settings while excluding undeclared keys', () => {
    const tileRuntime = runtime();
    const saveTileSettings = vi.fn();
    const installations = new CanvasTileInstallations({
      storage: new Map(),
      runtime: tileRuntime,
      saveCoordinates: vi.fn(),
      saveTileSettings,
    });
    const event = tileEvent({
      tags: [...tileEvent().tags, ['setting', 'units', 'Units', 'dropdown', 'metric:Metric', 'imperial:Imperial']],
    });
    const coordinate: InstalledCanvasTile = { pubkey: ALICE, identifier: 'alice@example.com:weather' };

    installations.setAccount(ALICE);
    installations.install(event, ['fetch']);
    installations.saveSettings(coordinate, { units: 'metric', untrusted: 'discard me' });

    expect(saveTileSettings).toHaveBeenCalledWith([
      { ...coordinate, values: { units: 'metric' } },
    ]);
    expect(tileRuntime.saveSettings).toHaveBeenCalledWith(coordinate.identifier, { units: 'metric' });
  });
});
