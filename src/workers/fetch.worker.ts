/// <reference lib="webworker" />

import { safeFetch } from '@soapbox/safe-fetch';
import { logi } from '@soapbox/logi';
import * as Comlink from 'comlink';

import '@/workers/handlers/abortsignal.ts';
import '@/sentry.ts';

export const FetchWorker = {
  async fetch(
    url: string,
    init: Omit<RequestInit, 'signal'>,
    signal: AbortSignal | null | undefined,
  ): Promise<[BodyInit, ResponseInit]> {
    logi({ level: 'debug', ns: 'ditto.fetch', state: 'started', method: init.method ?? 'GET', url });

    const response = await safeFetch(url, { ...init, signal });

    logi({
      level: 'debug',
      ns: 'ditto.fetch',
      state: 'finished',
      method: init.method ?? 'GET',
      url,
      status: response.status,
    });

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
