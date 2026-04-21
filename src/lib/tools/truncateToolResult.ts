/** Maximum tool result size in bytes (50 KiB). */
const MAX_RESULT_BYTES = 50 * 1024;

/** Maximum tool result size in lines. */
const MAX_RESULT_LINES = 2000;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false });

/**
 * Truncate a tool result string if it exceeds size limits.
 *
 * Follows the same pattern as Shakespeare: when output is too large,
 * replace it with a truncation notice so the AI knows to ask for a
 * smaller result (e.g. fewer posts, shorter time window).
 */
export function truncateToolResult(result: string): string {
  const encoded = encoder.encode(result);
  const lines = result.split('\n').length;

  if (encoded.length <= MAX_RESULT_BYTES && lines <= MAX_RESULT_LINES) {
    return result;
  }

  // Truncate to the byte limit using actual byte boundaries.
  // TextDecoder with fatal:false gracefully handles a slice that lands
  // in the middle of a multi-byte character (replaces the partial char).
  let truncated = result;
  if (encoded.length > MAX_RESULT_BYTES) {
    truncated = decoder.decode(encoded.slice(0, MAX_RESULT_BYTES));
  }
  if (truncated.split('\n').length > MAX_RESULT_LINES) {
    truncated = truncated.split('\n').slice(0, MAX_RESULT_LINES).join('\n');
  }

  const notice = [
    '\n\n---',
    `[Output truncated: original was ${encoded.length.toLocaleString()} bytes / ${lines.toLocaleString()} lines, ` +
    `limits are ${MAX_RESULT_BYTES.toLocaleString()} bytes / ${MAX_RESULT_LINES.toLocaleString()} lines]`,
    'Try requesting fewer results (e.g. smaller limit, shorter time window).',
  ].join('\n');

  return truncated + notice;
}
