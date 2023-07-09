import { z } from '@/deps.ts';

const linkSchema = z.object({
  rel: z.string().optional(),
  type: z.string().optional(),
  href: z.string().optional(),
  template: z.string().optional(),
});

const webfingerSchema = z.object({
  subject: z.string(),
  aliases: z.array(z.string()).catch([]),
  links: z.array(linkSchema),
});

type Webfinger = z.infer<typeof webfingerSchema>;

export { webfingerSchema };
export type { Webfinger };
