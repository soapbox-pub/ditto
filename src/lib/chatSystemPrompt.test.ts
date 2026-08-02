import { describe, it, expect } from 'vitest';

import { ABILITIES } from '@/lib/abilities';
import { buildSystemPrompt } from './chatSystemPrompt';

describe('buildSystemPrompt', () => {
  it('includes a manifest naming and describing every registered ability', () => {
    const prompt = buildSystemPrompt('Ditto');

    for (const ability of ABILITIES) {
      expect(prompt).toContain(ability.label.defaultMessage);
      expect(prompt).toContain(ability.description.defaultMessage);
    }
  });
});
