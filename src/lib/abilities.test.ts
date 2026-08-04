import { describe, it, expect } from 'vitest';

import { ABILITIES, buildAbilityManifest } from '@/lib/abilities';

describe('ABILITIES', () => {
  it('exposes message descriptors, not plain strings, for every label and description', () => {
    for (const ability of ABILITIES) {
      expect(typeof ability.label, `${ability.key} label is a descriptor`).toBe('object');
      expect(typeof ability.description, `${ability.key} description is a descriptor`).toBe('object');

      // MessageDescriptor shape: static id + English defaultMessage.
      expect(ability.label).toMatchObject({ id: expect.any(String), defaultMessage: expect.any(String) });
      expect(ability.description).toMatchObject({ id: expect.any(String), defaultMessage: expect.any(String) });

      expect(ability.label.id.length).toBeGreaterThan(0);
      expect(ability.label.defaultMessage.length).toBeGreaterThan(0);
      expect(ability.description.id.length).toBeGreaterThan(0);
      expect(ability.description.defaultMessage.length).toBeGreaterThan(0);
    }
  });

  it('uses unique message ids across every label and description', () => {
    const ids = ABILITIES.flatMap((ability) => [ability.label.id, ability.description.id]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('builds the system-prompt manifest from the English defaultMessages', () => {
    const manifest = buildAbilityManifest();

    for (const ability of ABILITIES) {
      expect(manifest).toContain(ability.label.defaultMessage);
      expect(manifest).toContain(ability.description.defaultMessage);
    }
  });
});
