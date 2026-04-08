// ---------------------------------------------------------------------------
// JSON-RPC 2.0 message types used by the sandbox frame protocol.
// ---------------------------------------------------------------------------

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  id: string | number;
  result: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: string | number;
  error: { code: number; message: string };
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

// ---------------------------------------------------------------------------
// Serialised HTTP request/response shapes exchanged via the fetch RPC.
// ---------------------------------------------------------------------------

export interface SerialisedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

export interface SerialisedResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string | null;
}

// ---------------------------------------------------------------------------
// File resolution types used by SandboxFrame consumers.
// ---------------------------------------------------------------------------

/** The result of resolving a file request inside the sandbox. */
export interface FileResponse {
  /** HTTP status code. */
  status: number;
  /** MIME content type (e.g. "text/html"). */
  contentType: string;
  /** Raw file bytes. */
  body: Uint8Array;
}

/**
 * A virtual script that the sandbox frame should serve at a given path
 * and inject into HTML responses via a `<script>` tag.
 */
export interface InjectedScript {
  /** The virtual path to serve this script at (e.g. "/__injected__/preview.js"). */
  path: string;
  /** The script source code as a string. */
  content: string;
}
