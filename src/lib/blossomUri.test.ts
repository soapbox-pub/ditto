import { describe, it, expect } from 'vitest';
import { parseBlossomUri, resolveBlossomUri, extractBlossomUris, blossomImetaTag, BLOSSOM_URI_REGEX } from './blossomUri';

const HASH = 'b1674191a88ec5cdd733e4240a81803105dc412d6c6708d53ab94fc248f4f553';
const PUBKEY = 'ec4425ff5e9446080d2f70440188e3ca5d6da8713db7bdeef73d0ed54d9093f0';
const PUBKEY2 = '781208004e09102d7da3b7345e64fd193cd1bc3fce8fdae6008d77f9cabcd036';

describe('parseBlossomUri', () => {
  it('parses a minimal URI', () => {
    const uri = parseBlossomUri(`blossom:${HASH}.pdf`);
    expect(uri).toEqual({
      sha256: HASH,
      ext: 'pdf',
      path: `${HASH}.pdf`,
      servers: [],
      authors: [],
      size: undefined,
    });
  });

  it('parses all query parameters', () => {
    const uri = parseBlossomUri(
      `blossom:${HASH}.png?xs=cdn.satellite.earth&as=${PUBKEY}&xs=blossom.primal.net&sz=184292`,
    );
    expect(uri?.sha256).toBe(HASH);
    expect(uri?.ext).toBe('png');
    expect(uri?.servers).toEqual([
      'https://cdn.satellite.earth',
      'https://blossom.primal.net',
    ]);
    expect(uri?.authors).toEqual([PUBKEY]);
    expect(uri?.size).toBe(184292);
  });

  it('collects repeated author hints and dedupes', () => {
    const uri = parseBlossomUri(`blossom:${HASH}.png?as=${PUBKEY}&as=${PUBKEY2}&as=${PUBKEY}`);
    expect(uri?.authors).toEqual([PUBKEY, PUBKEY2]);
  });

  it('upgrades http server hints to https origins', () => {
    const uri = parseBlossomUri(`blossom:${HASH}.jpg?xs=http://cdn.example.com`);
    expect(uri?.servers).toEqual(['https://cdn.example.com']);
  });

  it('accepts an explicit https scheme on the hint', () => {
    const uri = parseBlossomUri(`blossom:${HASH}.jpg?xs=https://cdn.example.com`);
    expect(uri?.servers).toEqual(['https://cdn.example.com']);
  });

  it('defaults to .bin extension when present', () => {
    const uri = parseBlossomUri(`blossom:${HASH}.bin`);
    expect(uri?.ext).toBe('bin');
  });

  it('lowercases an uppercase hash', () => {
    const uri = parseBlossomUri(`blossom:${HASH.toUpperCase()}.PNG`);
    expect(uri?.sha256).toBe(HASH);
    expect(uri?.ext).toBe('png');
  });

  it('rejects a missing extension', () => {
    expect(parseBlossomUri(`blossom:${HASH}`)).toBeUndefined();
  });

  it('rejects an invalid (short) hash', () => {
    expect(parseBlossomUri('blossom:abc123.png')).toBeUndefined();
  });

  it('rejects a non-blossom scheme', () => {
    expect(parseBlossomUri(`magnet:${HASH}.png`)).toBeUndefined();
  });

  it('drops invalid author and size params without rejecting the URI', () => {
    const uri = parseBlossomUri(`blossom:${HASH}.png?as=notapubkey&sz=-5`);
    expect(uri?.authors).toEqual([]);
    expect(uri?.size).toBeUndefined();
  });
});

describe('resolveBlossomUri', () => {
  it('orders xs hints before fallback servers and dedupes', () => {
    const uri = parseBlossomUri(`blossom:${HASH}.png?xs=cdn.satellite.earth`)!;
    const urls = resolveBlossomUri(uri, ['https://blossom.ditto.pub/', 'https://cdn.satellite.earth/']);
    expect(urls).toEqual([
      `https://cdn.satellite.earth/${HASH}.png`,
      `https://blossom.ditto.pub/${HASH}.png`,
    ]);
  });

  it('returns only fallback servers when there are no hints', () => {
    const uri = parseBlossomUri(`blossom:${HASH}.png`)!;
    const urls = resolveBlossomUri(uri, ['https://blossom.ditto.pub/']);
    expect(urls).toEqual([`https://blossom.ditto.pub/${HASH}.png`]);
  });

  it('produces only https urls', () => {
    const uri = parseBlossomUri(`blossom:${HASH}.png`)!;
    const urls = resolveBlossomUri(uri, ['http://insecure.example.com/']);
    expect(urls).toEqual([`https://insecure.example.com/${HASH}.png`]);
  });
});

describe('BLOSSOM_URI_REGEX', () => {
  it('matches a full-featured URI inside text', () => {
    const text = `look: blossom:${HASH}.pdf?xs=cdn.example.com&sz=1 done`;
    const match = text.match(BLOSSOM_URI_REGEX);
    expect(match?.[0]).toBe(`blossom:${HASH}.pdf?xs=cdn.example.com&sz=1`);
  });
});

describe('extractBlossomUris', () => {
  it('extracts every valid URI in order', () => {
    const content = `first blossom:${HASH}.png?xs=a.example.com then blossom:${HASH}.mp4`;
    const found = extractBlossomUris(content);
    expect(found).toHaveLength(2);
    expect(found[0].uri.ext).toBe('png');
    expect(found[0].raw).toBe(`blossom:${HASH}.png?xs=a.example.com`);
    expect(found[1].uri.ext).toBe('mp4');
  });

  it('skips malformed URIs', () => {
    const content = `blossom:tooshort.png and blossom:${HASH}.jpg`;
    const found = extractBlossomUris(content);
    expect(found).toHaveLength(1);
    expect(found[0].uri.ext).toBe('jpg');
  });
});

describe('blossomImetaTag', () => {
  it('builds a NIP-92 imeta tag with url, x, m and size', () => {
    const raw = `blossom:${HASH}.png?xs=cdn.example.com&sz=184292`;
    const uri = parseBlossomUri(raw)!;
    expect(blossomImetaTag(uri, raw)).toEqual([
      'imeta',
      `url ${raw}`,
      `x ${HASH}`,
      'm image/png',
      'size 184292',
    ]);
  });

  it('omits size when unknown', () => {
    const raw = `blossom:${HASH}.mp4`;
    const uri = parseBlossomUri(raw)!;
    expect(blossomImetaTag(uri, raw)).toEqual([
      'imeta',
      `url ${raw}`,
      `x ${HASH}`,
      'm video/mp4',
    ]);
  });
});
