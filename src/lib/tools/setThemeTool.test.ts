import { describe, it, expect, vi } from 'vitest';
import { toolToOpenAI } from '@soapbox.pub/nostr-canvas/devkit';
import type { ToolResult } from '@soapbox.pub/nostr-canvas/devkit';

import { createSetThemeTool } from './setThemeTool';

const VALID_ARGS = {
  background: '228 20% 10%',
  text: '210 40% 98%',
  primary: '258 70% 60%',
};

function parseResult(result: ToolResult) {
  if (!('content' in result)) throw new Error('expected a content result');
  return JSON.parse(result.content) as Record<string, unknown>;
}

describe('createSetThemeTool', () => {
  it('returns a Tool with a description and a zod inputSchema', () => {
    const tool = createSetThemeTool(() => {});
    expect(tool.description).toContain('HSL');
    expect(tool.inputSchema).toBeDefined();
  });

  it('applies a theme built from valid HSL colors', async () => {
    const apply = vi.fn();
    const tool = createSetThemeTool(apply);

    const result = await tool.execute(VALID_ARGS);

    expect(apply).toHaveBeenCalledWith({
      colors: {
        background: VALID_ARGS.background,
        text: VALID_ARGS.text,
        primary: VALID_ARGS.primary,
      },
    });
    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.colors).toEqual({
      background: VALID_ARGS.background,
      text: VALID_ARGS.text,
      primary: VALID_ARGS.primary,
    });
  });

  it('rejects invalid HSL colors without applying the theme', async () => {
    const apply = vi.fn();
    const tool = createSetThemeTool(apply);

    const result = await tool.execute({ ...VALID_ARGS, background: 'not-a-color' });

    const parsed = parseResult(result);
    expect(parsed.error).toContain('Invalid HSL color values');
    expect(parsed.received).toEqual({ background: 'not-a-color', text: VALID_ARGS.text, primary: VALID_ARGS.primary });
    expect(apply).not.toHaveBeenCalled();
  });

  it('rejects colors missing the saturation or lightness percent sign', async () => {
    const apply = vi.fn();
    const tool = createSetThemeTool(apply);

    const result = await tool.execute({ ...VALID_ARGS, text: '210 40 98%' });

    expect(parseResult(result).error).toContain('Invalid HSL color values');
    expect(apply).not.toHaveBeenCalled();
  });

  it('accepts boundary HSL values (hue 359, saturation/lightness 100%)', async () => {
    const apply = vi.fn();
    const tool = createSetThemeTool(apply);

    const result = await tool.execute({
      background: '359 100% 100%',
      text: '0 0% 0%',
      primary: '120 100% 50%',
    });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(parseResult(result).success).toBe(true);
  });

  it('rejects out-of-range HSL values (hue 360+, saturation/lightness above 100%)', async () => {
    const apply = vi.fn();
    const tool = createSetThemeTool(apply);

    for (const background of ['360 20% 10%', '999 20% 10%', '10 101% 10%', '10 20% 101%']) {
      const result = await tool.execute({ ...VALID_ARGS, background });
      expect(parseResult(result).error).toContain('Invalid HSL color values');
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it('applies a bundled font case-insensitively and reports the canonical family', async () => {
    const apply = vi.fn();
    const tool = createSetThemeTool(apply);

    const result = await tool.execute({ ...VALID_ARGS, font: 'dm sans' });

    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ font: { family: 'DM Sans' } }));
    expect(parseResult(result).font).toBe('DM Sans');
  });

  it('rejects an unknown font without applying the theme', async () => {
    const apply = vi.fn();
    const tool = createSetThemeTool(apply);

    const result = await tool.execute({ ...VALID_ARGS, font: 'Comic Sans' });

    const parsed = parseResult(result);
    expect(parsed.error).toContain('Unknown font "Comic Sans"');
    expect(apply).not.toHaveBeenCalled();
  });

  it('applies an https background with cover mode by default', async () => {
    const apply = vi.fn();
    const tool = createSetThemeTool(apply);

    const result = await tool.execute({ ...VALID_ARGS, background_url: 'https://example.com/bg.jpg' });

    expect(apply).toHaveBeenCalledWith(expect.objectContaining({
      background: { url: 'https://example.com/bg.jpg', mode: 'cover' },
    }));
    expect(parseResult(result).background).toEqual({ url: 'https://example.com/bg.jpg', mode: 'cover' });
  });

  it('applies a tile-mode background when requested', async () => {
    const apply = vi.fn();
    const tool = createSetThemeTool(apply);

    await tool.execute({ ...VALID_ARGS, background_url: 'https://example.com/pattern.png', background_mode: 'tile' });

    expect(apply).toHaveBeenCalledWith(expect.objectContaining({
      background: { url: 'https://example.com/pattern.png', mode: 'tile' },
    }));
  });

  it('drops a non-https background URL instead of applying it', async () => {
    const apply = vi.fn();
    const tool = createSetThemeTool(apply);

    const result = await tool.execute({ ...VALID_ARGS, background_url: 'javascript:alert(1)' });

    expect(apply).toHaveBeenCalledWith(expect.not.objectContaining({ background: expect.anything() }));
    expect(parseResult(result).background).toBeUndefined();
  });

  it('rejects non-object arguments with a structured error instead of throwing', async () => {
    const apply = vi.fn();
    const tool = createSetThemeTool(apply);

    for (const garbage of [null, 'oops', [1, 2, 3]]) {
      const result = await tool.execute(garbage as unknown as typeof VALID_ARGS);
      expect(parseResult(result).error).toContain('Invalid arguments');
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it('rejects wrong-typed optional fields with a structured error', async () => {
    const apply = vi.fn();
    const tool = createSetThemeTool(apply);

    const result = await tool.execute({ ...VALID_ARGS, font: 123 } as unknown as typeof VALID_ARGS);

    expect(parseResult(result).error).toContain('font');
    expect(apply).not.toHaveBeenCalled();
  });

  it('exposes a schema that toolToOpenAI converts into set_theme parameters', () => {
    const tool = createSetThemeTool(() => {});
    const openai = toolToOpenAI('set_theme', tool);

    expect(openai.function.name).toBe('set_theme');
    const params = openai.function.parameters as Record<string, unknown>;
    expect(params.type).toBe('object');
    expect(params.required).toEqual(expect.arrayContaining(['background', 'text', 'primary']));
    expect(params.required).not.toContain('font');
    expect((params.properties as Record<string, unknown>).font).toBeDefined();
    expect((params.properties as Record<string, unknown>).background_mode).toMatchObject({ enum: ['cover', 'tile'] });
  });
});
