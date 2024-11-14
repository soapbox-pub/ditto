/// <reference lib="webworker" />

import { safeFetch } from '@soapbox/safe-fetch';
import { Stickynotes } from '@soapbox/stickynotes';
import * as Comlink from 'comlink';

import '@/workers/handlers/abortsignal.ts';
import '@/sentry.ts';

const console = new Stickynotes('ditto:fetch.worker');

export const FetchWorker = {
  async fetch(
    url: string,
    init: Omit<RequestInit, 'signal'>,
    signal: AbortSignal | null | undefined,
  ): Promise<[BodyInit, ResponseInit]> {
    console.debug(init.method, url);
    const response = await safeFetch(url, { ...init, signal });
    return [
      await response.arrayBuffer(),
      {
        status: response.status,
        statusText: response.statusText,
        headers: [...response.headers.entries()],
      },
    ];
  },
};

Comlink.expose(FetchWorker);

self.postMessage('ready');
