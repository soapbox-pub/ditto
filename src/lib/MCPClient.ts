import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import type { MCPServer } from '@/contexts/AppContext';

/** Tool schema as returned by MCP server listTools. */
export interface MCPToolSchema {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, object>;
    required?: string[];
  };
}

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
 * MCP Client for discovering and executing tools from Streamable HTTP MCP servers.
 * Uses the official @modelcontextprotocol/sdk library.
 */
export class MCPClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport;
  private connected = false;

  constructor(server: MCPServer) {
    this.client = new Client(
      { name: 'ditto', version: '1.0.0' },
      { capabilities: {} },
    );

    this.transport = new StreamableHTTPClientTransport(new URL(server.url), {
      requestInit: server.headers ? { headers: server.headers } : undefined,
    });
  }

  /** Connect to the MCP server (no-op if already connected). */
  async connect(): Promise<void> {
    if (this.connected) return;
    await this.client.connect(this.transport);
    this.connected = true;
  }

  /** List all available tools from the MCP server. */
  async listTools(): Promise<MCPToolSchema[]> {
    await this.connect();
    const result = await this.client.listTools();
    return result.tools;
  }

  /** Call a tool on the MCP server and return concatenated text content. */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    await this.connect();

    const result = await this.client.callTool({ name, arguments: args });
    const content = Array.isArray(result.content) ? result.content : [];

    if (result.isError) {
      const errorText = content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('\n');
      throw new Error(`MCP tool error: ${errorText}`);
    }

    return content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map((c) => c.text)
      .join('\n');
  }

  /** Close the connection to the MCP server. */
  async close(): Promise<void> {
    if (!this.connected) return;
    await this.client.close();
    this.connected = false;
  }

  /** Convert MCP tool schemas to OpenAI function-calling format. */
  static toOpenAITools(mcpTools: MCPToolSchema[]): Record<string, OpenAITool> {
    const tools: Record<string, OpenAITool> = {};

    for (const tool of mcpTools) {
      tools[tool.name] = {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description || '',
          parameters: tool.inputSchema as Record<string, unknown>,
        },
      };
    }

    return tools;
  }
}

/**
 * Discover tools from all configured MCP servers.
 * Tool names are prefixed with `serverName__` to avoid collisions.
 * Returns both the OpenAI-formatted tool definitions and a map from
 * prefixed tool name to the MCPClient instance that owns it.
 */
export async function discoverMCPTools(
  mcpServers: Record<string, MCPServer>,
): Promise<{
  tools: Record<string, OpenAITool>;
  clients: Record<string, MCPClient>;
}> {
  const allTools: Record<string, OpenAITool> = {};
  const clients: Record<string, MCPClient> = {};

  for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
    try {
      const client = new MCPClient(serverConfig);
      const mcpTools = await client.listTools();
      const openAITools = MCPClient.toOpenAITools(mcpTools);

      for (const [toolName, tool] of Object.entries(openAITools)) {
        const prefixedName = `${serverName}__${toolName}`;
        allTools[prefixedName] = {
          type: 'function',
          function: {
            ...tool.function,
            name: prefixedName,
            description: `[${serverName}] ${tool.function.description}`,
          },
        };
        clients[prefixedName] = client;
      }
    } catch (error) {
      console.error(`Failed to discover tools from MCP server "${serverName}":`, error);
    }
  }

  return { tools: allTools, clients };
}
