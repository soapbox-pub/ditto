import { describe, it, expect } from 'vitest';
import { genUserName } from './genUserName';

describe('genUserName', () => {
  it('generates a deterministic name from a seed', () => {
    const seed = 'test-seed-123';
    const name1 = genUserName(seed);
    const name2 = genUserName(seed);
    
    expect(name1).toEqual('Brave Whale');
    expect(name1).toEqual(name2);
  });

  it('generates different names for different seeds', () => {
    const name1 = genUserName('seed1');
    const name2 = genUserName('seed2');
    const name3 = genUserName('seed3');
    
    // While it's theoretically possible for different seeds to generate the same name,
    // it's very unlikely with our word lists
    expect(name1).not.toBe(name2);
    expect(name2).not.toBe(name3);
    expect(name1).not.toBe(name3);
  });

  it('handles typical Nostr pubkey format', () => {
    // Typical hex pubkey (64 characters)
    const pubkey = 'e4690a13290739da123aa17d553851dec4cdd0e9d89aa18de3741c446caf8761';
    const name = genUserName(pubkey);
    
    expect(name).toEqual('Gentle Hawk');
  });
});