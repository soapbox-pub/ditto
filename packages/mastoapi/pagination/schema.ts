import { z } from 'zod';

export interface Pagination {
  max_id?: string;
  min_id?: string;
  since?: number;
  until?: number;
  limit: number;
  offset: number;
}

export interface PaginationSchemaOpts {
  limit?: number;
  max?: number;
}

/** Schema to parse pagination query params. */
export function paginationSchema(opts: PaginationSchemaOpts = {}): z.ZodType<Pagination> {
  let { limit = 20, max = 40 } = opts;

  if (limit > max) {
    max = limit;
  }

  return z.object({
    max_id: z.string().transform((val) => {
      if (!val.includes('-')) return val;
      return val.split('-')[1];
    }).optional().catch(undefined),
    min_id: z.string().optional().catch(undefined),
    since: z.coerce.number().nonnegative().optional().catch(undefined),
    until: z.coerce.number().nonnegative().optional().catch(undefined),
    limit: z.coerce.number().catch(limit).transform((value) => Math.min(Math.max(value, 0), max)),
    offset: z.coerce.number().nonnegative().catch(0),
  }) as z.ZodType<Pagination>;
}
