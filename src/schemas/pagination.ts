import { z } from 'zod';

/** Schema to parse pagination query params. */
export const paginationSchema = z.object({
  max_id: z.string().optional().catch(undefined),
  min_id: z.string().optional().catch(undefined),
  since: z.coerce.number().nonnegative().optional().catch(undefined),
  until: z.coerce.number().nonnegative().optional().catch(undefined),
  limit: z.coerce.number().catch(20).transform((value) => Math.min(Math.max(value, 0), 40)),
  offset: z.coerce.number().nonnegative().catch(0),
});
