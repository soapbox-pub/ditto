import { z } from '@/deps.ts';

import { hexIdSchema, signedEventSchema } from '../schema.ts';

const filterSchema = z.object({
  kinds: z.number().int().positive().array().optional(),
  ids: hexIdSchema.array().optional(),
  authors: hexIdSchema.array().optional(),
  since: z.number().int().positive().optional(),
  until: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
}).and(z.record(
  z.custom<`#${string}`>((val) => typeof val === 'string' && val.startsWith('#')),
  z.string().array(),
));

const clientMsgSchema = z.union([
  z.tuple([z.literal('REQ'), z.string().min(1)]).rest(filterSchema),
  z.tuple([z.literal('EVENT'), signedEventSchema]),
  z.tuple([z.literal('CLOSE'), z.string().min(1)]),
]);

type Filter = z.infer<typeof filterSchema>;

export { clientMsgSchema, filterSchema };
