/** Serialize an error into JSON for JSON logging. */
export function errorJson(error: unknown): Error | null {
  if (error instanceof Error) {
    return error;
  } else {
    return null;
  }
}
