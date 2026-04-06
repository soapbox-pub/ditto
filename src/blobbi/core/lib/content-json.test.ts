// src/blobbi/core/lib/content-json.test.ts

/**
 * Tests for the low-level content JSON utilities.
 */

import { describe, it, expect } from 'vitest';

import { safeParseContent, updateContentSection } from './content-json';

// ─── safeParseContent ─────────────────────────────────────────────────────────

describe('safeParseContent', () => {
  it('returns parseOk: true with empty data for empty string', () => {
    const result = safeParseContent('');
    expect(result).toEqual({ parseOk: true, data: {} });
  });

  it('returns parseOk: true with empty data for whitespace', () => {
    const result = safeParseContent('   \n\t  ');
    expect(result).toEqual({ parseOk: true, data: {} });
  });

  it('returns parseOk: true for valid JSON object', () => {
    const result = safeParseContent('{"key": "value", "num": 42}');
    expect(result.parseOk).toBe(true);
    expect(result.data).toEqual({ key: 'value', num: 42 });
  });

  it('preserves all keys including nested objects', () => {
    const input = JSON.stringify({
      a: 1,
      b: { nested: true },
      c: [1, 2, 3],
      d: null,
    });
    const result = safeParseContent(input);
    expect(result.parseOk).toBe(true);
    expect(result.data).toEqual({ a: 1, b: { nested: true }, c: [1, 2, 3], d: null });
  });

  it('returns parseOk: false for invalid JSON', () => {
    const result = safeParseContent('not json');
    expect(result.parseOk).toBe(false);
    expect(result.data).toEqual({});
  });

  it('returns parseOk: false for JSON array', () => {
    const result = safeParseContent('[1, 2, 3]');
    expect(result.parseOk).toBe(false);
    expect(result.data).toEqual({});
  });

  it('returns parseOk: false for JSON string', () => {
    const result = safeParseContent('"hello"');
    expect(result.parseOk).toBe(false);
    expect(result.data).toEqual({});
  });

  it('returns parseOk: false for JSON number', () => {
    const result = safeParseContent('42');
    expect(result.parseOk).toBe(false);
    expect(result.data).toEqual({});
  });

  it('returns parseOk: false for JSON boolean', () => {
    const result = safeParseContent('true');
    expect(result.parseOk).toBe(false);
    expect(result.data).toEqual({});
  });

  it('returns parseOk: false for JSON null', () => {
    const result = safeParseContent('null');
    expect(result.parseOk).toBe(false);
    expect(result.data).toEqual({});
  });
});

// ─── updateContentSection ─────────────────────────────────────────────────────

describe('updateContentSection', () => {
  it('adds a new section to empty content', () => {
    const result = updateContentSection('', 'newSection', { value: 42 });
    expect(JSON.parse(result)).toEqual({ newSection: { value: 42 } });
  });

  it('adds a new section alongside existing ones', () => {
    const existing = JSON.stringify({ existing: 'data' });
    const result = updateContentSection(existing, 'newSection', 'hello');
    expect(JSON.parse(result)).toEqual({ existing: 'data', newSection: 'hello' });
  });

  it('overwrites an existing section', () => {
    const existing = JSON.stringify({ section: 'old', other: 'keep' });
    const result = updateContentSection(existing, 'section', 'new');
    expect(JSON.parse(result)).toEqual({ section: 'new', other: 'keep' });
  });

  it('preserves all sibling keys', () => {
    const existing = JSON.stringify({ a: 1, b: 2, c: 3, d: 4 });
    const result = updateContentSection(existing, 'b', 'updated');
    expect(JSON.parse(result)).toEqual({ a: 1, b: 'updated', c: 3, d: 4 });
  });

  it('handles invalid JSON input gracefully', () => {
    const result = updateContentSection('bad json', 'section', 'value');
    expect(JSON.parse(result)).toEqual({ section: 'value' });
  });

  it('can set a section to null', () => {
    const existing = JSON.stringify({ section: 'data' });
    const result = updateContentSection(existing, 'section', null);
    expect(JSON.parse(result)).toEqual({ section: null });
  });

  it('can set a section to an array', () => {
    const existing = JSON.stringify({ other: 'data' });
    const result = updateContentSection(existing, 'items', [1, 2, 3]);
    expect(JSON.parse(result)).toEqual({ other: 'data', items: [1, 2, 3] });
  });
});
