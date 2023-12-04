import { Comlink } from '@/deps.ts';

import type { TrendsWorker as _TrendsWorker } from '@/workers/trends.worker.ts';

const worker = new Worker(new URL('./trends.worker.ts', import.meta.url), { type: 'module' });

const TrendsWorker = Comlink.wrap<typeof _TrendsWorker>(worker);

await new Promise<void>((resolve) => {
  const handleEvent = ({ data }: MessageEvent) => {
    if (data === 'ready') {
      worker.removeEventListener('message', handleEvent);
      resolve();
    }
  };
  worker.addEventListener('message', handleEvent);
});

export { TrendsWorker };
