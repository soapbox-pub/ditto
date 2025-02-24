import { z } from 'zod';

import { AppController } from '@/app.ts';
import { parseBody } from '@/utils/api.ts';

const kv = await Deno.openKv();

type Timeline = 'home' | 'notifications';

interface Marker {
  last_read_id: string;
  version: number;
  updated_at: string;
}

export const markersController: AppController = async (c) => {
  const { user } = c.var;

  const pubkey = await user!.signer.getPublicKey();
  const timelines = c.req.queries('timeline[]') ?? [];

  const results = await kv.getMany<Marker[]>(
    timelines.map((timeline) => ['markers', pubkey, timeline]),
  );

  const marker = results.reduce<Record<string, Marker>>((acc, { key, value }) => {
    if (value) {
      const timeline = key[key.length - 1] as string;
      acc[timeline] = value;
    }
    return acc;
  }, {});

  return c.json(marker);
};

const markerDataSchema = z.object({
  last_read_id: z.string(),
});

export const updateMarkersController: AppController = async (c) => {
  const { user } = c.var;

  const pubkey = await user!.signer.getPublicKey();
  const record = z.record(z.enum(['home', 'notifications']), markerDataSchema).parse(await parseBody(c.req.raw));
  const timelines = Object.keys(record) as Timeline[];

  const markers: Record<string, Marker> = {};

  const entries = await kv.getMany<Marker[]>(
    timelines.map((timeline) => ['markers', pubkey, timeline]),
  );

  for (const timeline of timelines) {
    const last = entries.find(({ key }) => key[key.length - 1] === timeline);

    const marker: Marker = {
      last_read_id: record[timeline]!.last_read_id,
      version: last?.value ? last.value.version + 1 : 1,
      updated_at: new Date().toISOString(),
    };

    await kv.set(['markers', pubkey, timeline], marker);
    markers[timeline] = marker;
  }

  return c.json(markers);
};
