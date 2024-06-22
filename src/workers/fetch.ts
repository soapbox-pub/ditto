import * as Comlink from 'comlink';

import { FetchWorker } from './fetch.worker.ts';
import './handlers/abortsignal.ts';

import { fetchCounter } from '@/metrics.ts';

const worker = new Worker(new URL('./fetch.worker.ts', import.meta.url), { type: 'module' });
const client = Comlink.wrap<typeof FetchWorker>(worker);

// Wait for the worker to be ready before we start using it.
const ready = new Promise<void>((resolve) => {
  const handleEvent = () => {
    self.removeEventListener('message', handleEvent);
    resolve();
  };
  worker.addEventListener('message', handleEvent);
});

/**
 * Fetch implementation with a Web Worker.
 * Calling this performs the fetch in a separate CPU thread so it doesn't block the main thread.
 */
const fetchWorker: typeof fetch = async (...args) => {
  await ready;
  const [url, init] = serializeFetchArgs(args);
  const { body, signal, ...rest } = init;
  fetchCounter.inc({ method: init.method });
  const result = await client.fetch(url, { ...rest, body: await prepareBodyForWorker(body) }, signal);
  return new Response(...result);
};

/** Take arguments to `fetch`, and turn them into something we can send over Comlink. */
function serializeFetchArgs(args: Parameters<typeof fetch>): [string, RequestInit] {
  const request = normalizeRequest(args);
  const init = requestToInit(request);
  return [request.url, init];
}

/** Get a `Request` object from arguments to `fetch`. */
function normalizeRequest(args: Parameters<typeof fetch>): Request {
  return new Request(...args);
}

/** Get the body as a type we can transfer over Web Workers. */
async function prepareBodyForWorker(
  body: BodyInit | undefined | null,
): Promise<ArrayBuffer | Blob | string | undefined | null> {
  if (!body || typeof body === 'string' || body instanceof ArrayBuffer || body instanceof Blob) {
    return body;
  } else {
    const response = new Response(body);
    return await response.arrayBuffer();
  }
}

/**
 * Convert a `Request` object into its serialized `RequestInit` format.
 * `RequestInit` is a subset of `Request`, just lacking helper methods like `json()`,
 * making it easier to serialize (exceptions: `body` and `signal`).
 */
function requestToInit(request: Request): RequestInit {
  return {
    method: request.method,
    headers: [...request.headers.entries()],
    body: request.body,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    mode: request.mode,
    credentials: request.credentials,
    cache: request.cache,
    redirect: request.redirect,
    integrity: request.integrity,
    keepalive: request.keepalive,
    signal: request.signal,
  };
}

export { fetchWorker };
