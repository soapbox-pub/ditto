import { Comlink } from '@/deps.ts';

export const FetchWorker = {
  async fetch(url: string): Promise<[BodyInit, ResponseInit]> {
    const response = await fetch(url);
    return [
      await response.text(),
      {
        status: response.status,
        statusText: response.statusText,
        headers: Array.from(response.headers.entries()),
      },
    ];
  },
};

Comlink.expose(FetchWorker);
