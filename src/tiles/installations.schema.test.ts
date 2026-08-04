import { describe, expect, it } from 'vitest';
import { AppConfigSchema, EncryptedSettingsSchema } from '@/lib/schemas';

const ALICE = 'a'.repeat(64);

describe('installedCanvasTiles schema', () => {
  it('preserves valid author-bound coordinates and tile settings while dropping malformed synced records', () => {
    expect(EncryptedSettingsSchema.parse({
      installedCanvasTiles: [
        { pubkey: ALICE, identifier: 'alice@example.com:weather' },
        { pubkey: 'invalid', identifier: 'not-a-coordinate' },
      ],
      canvasTileSettings: [
        { pubkey: ALICE, identifier: 'alice@example.com:weather', values: { units: 'metric' } },
        { pubkey: 'invalid', identifier: 'not-a-coordinate', values: { units: 123 } },
      ],
    }).installedCanvasTiles).toEqual([
      { pubkey: ALICE, identifier: 'alice@example.com:weather' },
    ]);
    expect(EncryptedSettingsSchema.parse({
      canvasTileSettings: [
        { pubkey: ALICE, identifier: 'alice@example.com:weather', values: { units: 'metric' } },
        { pubkey: 'invalid', identifier: 'not-a-coordinate', values: { units: 123 } },
      ],
    }).canvasTileSettings).toEqual([
      { pubkey: ALICE, identifier: 'alice@example.com:weather', values: { units: 'metric' } },
    ]);
  });

  it('keeps pre-canvas settings valid and accepts both local config fields', () => {
    expect(EncryptedSettingsSchema.parse({ sidebarWidgets: [] }).installedCanvasTiles).toBeUndefined();
    expect(AppConfigSchema.shape.installedCanvasTiles.safeParse([
      { pubkey: ALICE, identifier: 'alice@example.com:weather' },
    ]).success).toBe(true);
    expect(AppConfigSchema.shape.canvasTileSettings.safeParse([
      { pubkey: ALICE, identifier: 'alice@example.com:weather', values: { units: 'metric' } },
    ]).success).toBe(true);
  });
});
