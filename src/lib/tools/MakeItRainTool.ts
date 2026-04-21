import { z } from 'zod';

import type { Tool, ToolResult, ToolContext } from './Tool';

const inputSchema = z.object({
  action: z.enum(['start', 'stop']).describe('Whether to start or stop the effect.'),
  type: z.enum(['rain', 'snow']).optional().describe('The type of precipitation. Defaults to "rain".'),
  intensity: z.enum(['light', 'moderate', 'heavy']).optional().describe('How intense the effect should be. "light" for gentle ambiance, "moderate" for noticeable effect, "heavy" for dramatic downpour. Defaults to "moderate".'),
});

type Params = z.infer<typeof inputSchema>;

export const MakeItRainTool: Tool<Params> = {
  description: `Trigger a fun visual weather effect on the user's screen. This is a playful easter egg — use it when the mood calls for it!

Use "start" to activate rain or snow, and "stop" to turn it off. The effect persists across the entire app (all pages) until the user asks to stop it.

**When to use this (be creative!):**
- The user literally says "make it rain" or asks for rain/snow
- Celebrating something (use heavy rain or snow for dramatic flair)
- The conversation has a moody, dramatic, or cozy vibe
- The user is feeling down (gentle rain can be soothing)
- Discussing weather, seasons, or nature
- Any moment where a visual flourish would delight

**When to stop:**
- The user asks to stop, turn off, or clear the effect
- The user says "enough" or seems annoyed by it`,

  inputSchema,

  async execute(args: Params, ctx: ToolContext): Promise<ToolResult> {
    if (args.action === 'stop') {
      ctx.setScreenEffect(null);
      return { result: JSON.stringify({ success: true, message: 'Screen effect stopped.' }) };
    }

    const effectType = args.type ?? 'rain';
    const intensity = args.intensity ?? 'moderate';

    ctx.setScreenEffect({ type: effectType, intensity });

    const label = `${intensity} ${effectType}`;
    return { result: JSON.stringify({ success: true, message: `${label} effect activated!` }) };
  },
};
