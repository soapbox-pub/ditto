/** Creates an `AbortError` object matching the Fetch API. */
function abortError() {
  return new DOMException('The signal has been aborted', 'AbortError');
}

export { abortError };
