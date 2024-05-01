import Debug from '@soapbox/stickynotes/debug';
import * as Comlink from 'comlink';

import './handlers/abortsignal.ts';

const debug = Debug('ditto:fetch.worker');

export const FetchWorker = {
  async fetch(
    url: string,
    init: Omit<RequestInit, 'signal'>,
    signal: AbortSignal | null | undefined,
  ): Promise<[BodyInit, ResponseInit]> {
    debug(init.method, url);
    const response = await fetch(url, { ...init, signal });
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
