import { z } from 'zod';

import { AppController } from '@/app.ts';
import { parseBody } from '@/utils/api.ts';

const pushSubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string(),
    }),
    data: z.object({
      alerts: z.object({
        mention: z.boolean().optional(),
        status: z.boolean().optional(),
        reblog: z.boolean().optional(),
        follow: z.boolean().optional(),
        follow_request: z.boolean().optional(),
        favourite: z.boolean().optional(),
        poll: z.boolean().optional(),
        update: z.boolean().optional(),
        'admin.sign_up': z.boolean().optional(),
        'admin.report': z.boolean().optional(),
      }).optional(),
      policy: z.enum(['all', 'followed', 'follower', 'none']).optional(),
    }),
  }),
});

export const pushSubscribeController: AppController = async (c) => {
  const data = pushSubscribeSchema.safeParse(await parseBody(c.req.raw));

  if (!data.success) {
    return c.json({ error: 'Invalid request', schema: data.error }, 400);
  }

  return c.json({});
};
