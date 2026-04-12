import type { Tool } from './Tool';

/** OpenAI-compatible function-calling tool definition. */
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Convert a Tool<T> to OpenAI's function-calling format.
 *
 * Uses Zod's `.toJSONSchema()` (available since zod v4 / zod-to-json-schema)
 * to derive the JSON Schema from the tool's inputSchema.
 */
export function toolToOpenAI<T>(name: string, tool: Tool<T>): OpenAITool {
  return {
    type: 'function',
    function: {
      name,
      description: tool.description,
      parameters: tool.inputSchema.toJSONSchema() as Record<string, unknown>,
    },
  };
}
