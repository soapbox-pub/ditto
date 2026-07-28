import { describe, expect, it } from 'vitest';
import { hashWidgetId, widgetAccentHue, widgetAccentVars } from './widgetAccent';

describe('hashWidgetId', () => {
  it('returns the same value for the same input', () => {
    expect(hashWidgetId('trends')).toBe(hashWidgetId('trends'));
    expect(hashWidgetId('canvas:example.com:widget')).toBe(hashWidgetId('canvas:example.com:widget'));
  });

  it('returns different values for different inputs', () => {
    expect(hashWidgetId('trends')).not.toBe(hashWidgetId('hot-posts'));
    expect(hashWidgetId('blobbi')).not.toBe(hashWidgetId('wikipedia'));
    expect(hashWidgetId('canvas:a')).not.toBe(hashWidgetId('canvas:b'));
  });
});

describe('widgetAccentHue', () => {
  it('returns the same hue for the same id', () => {
    expect(widgetAccentHue('trends')).toBe(widgetAccentHue('trends'));
    expect(widgetAccentHue('canvas:example.com:widget')).toBe(widgetAccentHue('canvas:example.com:widget'));
  });

  it('returns different hues for different known-fixture ids', () => {
    // A few known fixtures — we don't care about the actual values, only that they differ.
    const h1 = widgetAccentHue('trends');
    const h2 = widgetAccentHue('hot-posts');
    const h3 = widgetAccentHue('blobbi');
    const h4 = widgetAccentHue('canvas:foo:bar');

    expect(h1).not.toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h2).not.toBe(h3);
    // Canvas id may collide with a builtin id — we only verify they differ from each other.
    const hues = [h1, h2, h3, h4];
    expect(new Set(hues).size).toBe(4);
  });

  it('returns a hue in [0, 360)', () => {
    for (const id of ['trends', 'canvas:a', 'canvas:b', '', 'z'.repeat(100)]) {
      const hue = widgetAccentHue(id);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });
});

describe('widgetAccentVars', () => {
  it('returns a record with the --widget-accent key', () => {
    const vars = widgetAccentVars('trends', 'dark');
    expect(vars).toHaveProperty('--widget-accent');
    expect(Object.keys(vars)).toHaveLength(1);
  });

  it('returns a bare HSL triple in the format "h s% l%"', () => {
    for (const mode of ['dark', 'light'] as const) {
      const vars = widgetAccentVars('trends', mode);
      expect(vars['--widget-accent']).toMatch(/^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/);
    }
  });

  it('produces different HSL strings for dark vs light mode', () => {
    const dark = widgetAccentVars('trends', 'dark');
    const light = widgetAccentVars('trends', 'light');
    expect(dark['--widget-accent']).not.toBe(light['--widget-accent']);
  });

  it('same id + same mode → same vars across calls', () => {
    expect(widgetAccentVars('trends', 'dark')).toEqual(widgetAccentVars('trends', 'dark'));
    expect(widgetAccentVars('canvas:x', 'light')).toEqual(widgetAccentVars('canvas:x', 'light'));
  });

  it('different ids give different hue components in dark mode', () => {
    const a = widgetAccentVars('trends', 'dark')['--widget-accent'];
    const b = widgetAccentVars('hot-posts', 'dark')['--widget-accent'];
    // Both end with "45% 45%" but the hue prefix should differ.
    const hueA = Number(a.split(' ')[0]);
    const hueB = Number(b.split(' ')[0]);
    expect(hueA).not.toBe(hueB);
  });
});
