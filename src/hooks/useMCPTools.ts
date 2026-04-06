import { useQuery } from '@tanstack/react-query';

import { useAppContext } from '@/hooks/useAppContext';
import { discoverMCPTools, type MCPClient, type OpenAITool } from '@/lib/MCPClient';

interface UseMCPToolsResult {
  /** OpenAI-formatted tool definitions keyed by prefixed name (`serverName__toolName`). */
  tools: Record<string, OpenAITool>;
  /** Map from prefixed tool name to the MCPClient that owns it (for executing calls). */
  clients: Record<string, MCPClient>;
  /** Whether tool discovery is still in progress. */
  isLoading: boolean;
  /** Error from discovery, if any. */
  error: Error | null;
}

/**
 * Discovers and caches MCP tools from all configured servers.
 *
 * Tools are cached for 5 minutes and auto-refetched when the
 * `mcpServers` config changes (e.g. user adds/removes a server).
 */
export function useMCPTools(): UseMCPToolsResult {
  const { config } = useAppContext();
  const mcpServers = config.mcpServers;

  // Stable query key: serialize the server URLs so TanStack detects config changes.
  const serverKey = JSON.stringify(
    Object.entries(mcpServers).map(([name, s]) => [name, s.url]),
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ['mcp-tools', serverKey],
    queryFn: async () => {
      if (Object.keys(mcpServers).length === 0) {
        return { tools: {} as Record<string, OpenAITool>, clients: {} as Record<string, MCPClient> };
      }
      return await discoverMCPTools(mcpServers);
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return {
    tools: data?.tools ?? {},
    clients: data?.clients ?? {},
    isLoading,
    error: error as Error | null,
  };
}
