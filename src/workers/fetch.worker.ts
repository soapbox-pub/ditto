import { Comlink } from '@/deps.ts';

import './handlers/abortsignal.ts';

export const FetchWorker = {
  async fetch(
    url: string,
    init: Omit<RequestInit, 'signal'>,
    signal: AbortSignal | null | undefined,
  ): Promise<[BodyInit, ResponseInit]> {
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
