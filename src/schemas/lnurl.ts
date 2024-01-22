import { z } from '@/deps.ts';

const lnurlCallbackResponseSchema = z.object({
  pr: z.string(),
  routes: z.unknown().array(),
});

export { lnurlCallbackResponseSchema };
