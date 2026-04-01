import { describe, it, expect } from 'vitest';

import {
  calculateActionXP,
  calculateInventoryActionXP,
  applyXPGain,
  getXPGainSummary,
  formatXPGain,
  getXPGainMessage,
  ACTION_XP,
  INVENTORY_ACTION_XP,
  DIRECT_ACTION_XP,
} from './blobbi-xp';

describe('calculateActionXP', () => {
  it('returns the correct XP for each inventory action', () => {
    expect(calculateActionXP('feed')).toBe(5);
    expect(calculateActionXP('play')).toBe(8);
    expect(calculateActionXP('clean')).toBe(6);
    expect(calculateActionXP('medicine')).toBe(10);
  });

  it('returns the correct XP for each direct action', () => {
    expect(calculateActionXP('play_music')).toBe(7);
    expect(calculateActionXP('sing')).toBe(9);
  });

  it('returns 0 for an unknown action', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(calculateActionXP('unknown' as any)).toBe(0);
  });
});

describe('calculateInventoryActionXP', () => {
  it('returns base XP for quantity 1', () => {
    expect(calculateInventoryActionXP('feed', 1)).toBe(5);
    expect(calculateInventoryActionXP('medicine', 1)).toBe(10);
  });

  it('multiplies XP by quantity', () => {
    expect(calculateInventoryActionXP('feed', 3)).toBe(15);
    expect(calculateInventoryActionXP('play', 5)).toBe(40);
  });

  it('defaults to quantity 1 when not specified', () => {
    expect(calculateInventoryActionXP('clean')).toBe(6);
  });

  it('returns 0 for quantity less than 1', () => {
    expect(calculateInventoryActionXP('feed', 0)).toBe(0);
    expect(calculateInventoryActionXP('feed', -1)).toBe(0);
  });
});

describe('applyXPGain', () => {
  it('adds XP to a current value', () => {
    expect(applyXPGain(100, 25)).toBe(125);
  });

  it('treats undefined current XP as 0', () => {
    expect(applyXPGain(undefined, 10)).toBe(10);
  });

  it('never returns a negative value', () => {
    expect(applyXPGain(5, -20)).toBe(0);
    expect(applyXPGain(0, -1)).toBe(0);
  });

  it('handles zero XP gain', () => {
    expect(applyXPGain(50, 0)).toBe(50);
  });
});

describe('getXPGainSummary', () => {
  it('returns the correct xpGained and quantity', () => {
    const result = getXPGainSummary('feed', 3);
    expect(result).toEqual({ xpGained: 15, quantity: 3 });
  });

  it('defaults quantity to 1', () => {
    const result = getXPGainSummary('sing');
    expect(result).toEqual({ xpGained: 9, quantity: 1 });
  });
});

describe('formatXPGain', () => {
  it('formats positive XP as "+N XP"', () => {
    expect(formatXPGain(15)).toBe('+15 XP');
    expect(formatXPGain(1)).toBe('+1 XP');
  });

  it('returns empty string for zero or negative XP', () => {
    expect(formatXPGain(0)).toBe('');
    expect(formatXPGain(-5)).toBe('');
  });
});

describe('getXPGainMessage', () => {
  it('formats a message with action and XP earned', () => {
    expect(getXPGainMessage('feed', 5)).toBe('+5 XP earned!');
  });

  it('includes total when provided', () => {
    expect(getXPGainMessage('feed', 5, 105)).toBe('+5 XP earned! Total: 105 XP');
  });

  it('returns empty string for zero or negative XP', () => {
    expect(getXPGainMessage('feed', 0)).toBe('');
    expect(getXPGainMessage('feed', -1)).toBe('');
  });
});

describe('XP constants', () => {
  it('ACTION_XP contains all inventory and direct actions', () => {
    for (const action of Object.keys(INVENTORY_ACTION_XP)) {
      expect(ACTION_XP).toHaveProperty(action);
      expect(ACTION_XP[action as keyof typeof ACTION_XP]).toBe(
        INVENTORY_ACTION_XP[action as keyof typeof INVENTORY_ACTION_XP],
      );
    }
    for (const action of Object.keys(DIRECT_ACTION_XP)) {
      expect(ACTION_XP).toHaveProperty(action);
      expect(ACTION_XP[action as keyof typeof ACTION_XP]).toBe(
        DIRECT_ACTION_XP[action as keyof typeof DIRECT_ACTION_XP],
      );
    }
  });

  it('all XP values are positive integers', () => {
    for (const xp of Object.values(ACTION_XP)) {
      expect(xp).toBeGreaterThan(0);
      expect(Number.isInteger(xp)).toBe(true);
    }
  });
});
