import { JsonValue } from '@std/json';

/** Serialize an error into JSON for JSON logging. */
export function errorJson(error: unknown): JsonValue {
  if (error instanceof Error) {
    return { name: error.name, msg: error.message, stack: error.stack };
  }

  return { name: 'unknown', msg: String(error) };
}
