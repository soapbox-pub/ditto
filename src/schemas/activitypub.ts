import { z } from '@/deps.ts';

const apId = z.string().url();
const recipients = z.array(z.string()).catch([]);
const published = () => z.string().datetime().catch(new Date().toISOString());

/** Validates individual items in an array, dropping any that aren't valid. */
function filteredArray<T extends z.ZodTypeAny>(schema: T) {
  return z.any().array()
    .transform((arr) => (
      arr.map((item) => {
        const parsed = schema.safeParse(item);
        return parsed.success ? parsed.data : undefined;
      }).filter((item): item is z.infer<T> => Boolean(item))
    ));
}

const imageSchema = z.object({
  type: z.literal('Image').catch('Image'),
  url: z.string().url(),
});

const attachmentSchema = z.object({
  type: z.literal('Document').catch('Document'),
  mediaType: z.string().optional().catch(undefined),
  url: z.string().url(),
});

const mentionSchema = z.object({
  type: z.literal('Mention'),
  href: z.string().url(),
  name: z.string().optional().catch(undefined),
});

const hashtagSchema = z.object({
  type: z.literal('Hashtag'),
  href: z.string().url(),
  name: z.string(),
});

const emojiSchema = z.object({
  type: z.literal('Emoji'),
  icon: imageSchema,
  name: z.string(),
});

const tagSchema = z.discriminatedUnion('type', [
  mentionSchema,
  hashtagSchema,
  emojiSchema,
]);

const propertyValueSchema = z.object({
  type: z.literal('PropertyValue'),
  name: z.string(),
  value: z.string(),
  verified_at: z.string().nullish(),
});

/** https://codeberg.org/fediverse/fep/src/branch/main/feps/fep-fffd.md */
const proxySchema = z.object({
  protocol: z.string().url(),
  proxied: z.string(),
  authoritative: z.boolean().optional().catch(undefined),
});

const personSchema = z.object({
  type: z.literal('Person'),
  id: apId,
  icon: imageSchema.optional().catch(undefined),
  image: imageSchema.optional().catch(undefined),
  name: z.string().catch(''),
  preferredUsername: z.string(),
  inbox: apId,
  followers: apId.optional().catch(undefined),
  following: apId.optional().catch(undefined),
  outbox: apId.optional().catch(undefined),
  summary: z.string().catch(''),
  attachment: filteredArray(propertyValueSchema).catch([]),
  tag: filteredArray(emojiSchema).catch([]),
  endpoints: z.object({
    sharedInbox: apId.optional(),
  }).optional().catch({}),
  publicKey: z.object({
    id: apId,
    owner: apId,
    publicKeyPem: z.string(),
  }).optional().catch(undefined),
  proxyOf: z.array(proxySchema).optional().catch(undefined),
});

const applicationSchema = personSchema.merge(z.object({ type: z.literal('Application') }));
const groupSchema = personSchema.merge(z.object({ type: z.literal('Group') }));
const organizationSchema = personSchema.merge(z.object({ type: z.literal('Organization') }));
const serviceSchema = personSchema.merge(z.object({ type: z.literal('Service') }));

const actorSchema = z.discriminatedUnion('type', [
  personSchema,
  applicationSchema,
  groupSchema,
  organizationSchema,
  serviceSchema,
]);

const noteSchema = z.object({
  type: z.literal('Note'),
  id: apId,
  to: recipients,
  cc: recipients,
  content: z.string(),
  attachment: z.array(attachmentSchema).optional().catch(undefined),
  tag: filteredArray(tagSchema).catch([]),
  inReplyTo: apId.optional().catch(undefined),
  attributedTo: apId,
  published: published(),
  sensitive: z.boolean().optional().catch(undefined),
  summary: z.string().nullish().catch(undefined),
  quoteUrl: apId.optional().catch(undefined),
  source: z.object({
    content: z.string(),
    mediaType: z.literal('text/markdown'),
  }).optional().catch(undefined),
  proxyOf: z.array(proxySchema).optional().catch(undefined),
});

const flexibleNoteSchema = noteSchema.extend({
  quoteURL: apId.optional().catch(undefined),
  quoteUri: apId.optional().catch(undefined),
  _misskey_quote: apId.optional().catch(undefined),
}).transform((note) => {
  const { quoteUrl, quoteUri, quoteURL, _misskey_quote, ...rest } = note;
  return {
    quoteUrl: quoteUrl || quoteUri || quoteURL || _misskey_quote,
    ...rest,
  };
});

// https://github.com/colinhacks/zod/discussions/2100#discussioncomment-5109781
const objectSchema = z.union([
  flexibleNoteSchema,
  personSchema,
  applicationSchema,
  groupSchema,
  organizationSchema,
  serviceSchema,
]).pipe(
  z.discriminatedUnion('type', [
    noteSchema,
    personSchema,
    applicationSchema,
    groupSchema,
    organizationSchema,
    serviceSchema,
  ]),
);

const createNoteSchema = z.object({
  type: z.literal('Create'),
  id: apId,
  to: recipients,
  cc: recipients,
  actor: apId,
  object: noteSchema,
  published: published(),
  proxyOf: z.array(proxySchema).optional().catch(undefined),
});

const announceNoteSchema = z.object({
  type: z.literal('Announce'),
  id: apId,
  to: recipients,
  cc: recipients,
  actor: apId,
  object: apId.or(noteSchema),
  published: published(),
  proxyOf: z.array(proxySchema).optional().catch(undefined),
});

const followSchema = z.object({
  type: z.literal('Follow'),
  id: apId,
  to: recipients,
  cc: recipients,
  actor: apId,
  object: apId,
  proxyOf: z.array(proxySchema).optional().catch(undefined),
});

const acceptSchema = z.object({
  type: z.literal('Accept'),
  id: apId,
  actor: apId,
  to: recipients,
  cc: recipients,
  object: apId.or(followSchema),
});

const likeSchema = z.object({
  type: z.literal('Like'),
  id: apId,
  actor: apId,
  object: apId,
  to: recipients,
  cc: recipients,
  proxyOf: z.array(proxySchema).optional().catch(undefined),
});

const emojiReactSchema = z.object({
  type: z.literal('EmojiReact'),
  id: apId,
  actor: apId,
  object: apId,
  content: z.string().refine((v) => /\p{Extended_Pictographic}/u.test(v)),
  to: recipients,
  cc: recipients,
  proxyOf: z.array(proxySchema).optional().catch(undefined),
});

const deleteSchema = z.object({
  type: z.literal('Delete'),
  id: apId,
  actor: apId,
  object: apId,
  to: recipients,
  cc: recipients,
  proxyOf: z.array(proxySchema).optional().catch(undefined),
});

const updateActorSchema = z.object({
  type: z.literal('Update'),
  id: apId,
  actor: apId,
  to: recipients,
  cc: recipients,
  object: actorSchema,
  proxyOf: z.array(proxySchema).optional().catch(undefined),
});

/**
 * A custom Zap activity type we made up, based on:
 * https://github.com/nostr-protocol/nips/blob/master/57.md
 */
const zapSchema = z.object({
  type: z.literal('Zap'),
  id: apId,
  actor: apId,
  object: apId,
  to: recipients,
  cc: recipients,
  proxyOf: z.array(proxySchema).optional().catch(undefined),
});

const activitySchema = z.discriminatedUnion('type', [
  followSchema,
  acceptSchema,
  createNoteSchema,
  announceNoteSchema,
  updateActorSchema,
  likeSchema,
  emojiReactSchema,
  deleteSchema,
  zapSchema,
]).refine((activity) => {
  const ids: string[] = [activity.id];

  if (activity.type === 'Create') {
    ids.push(
      activity.object.id,
      activity.object.attributedTo,
    );
  }

  if (activity.type === 'Update') {
    ids.push(activity.object.id);
  }

  const { origin: actorOrigin } = new URL(activity.actor);

  // Object containment
  return ids.every((id) => {
    const { origin: idOrigin } = new URL(id);
    return idOrigin === actorOrigin;
  });
});

type Activity = z.infer<typeof activitySchema>;
type CreateNote = z.infer<typeof createNoteSchema>;
type Announce = z.infer<typeof announceNoteSchema>;
type Update = z.infer<typeof updateActorSchema>;
type Object = z.infer<typeof objectSchema>;
type Follow = z.infer<typeof followSchema>;
type Accept = z.infer<typeof acceptSchema>;
type Actor = z.infer<typeof actorSchema>;
type Note = z.infer<typeof noteSchema>;
type Mention = z.infer<typeof mentionSchema>;
type Hashtag = z.infer<typeof hashtagSchema>;
type Emoji = z.infer<typeof emojiSchema>;
type Like = z.infer<typeof likeSchema>;
type EmojiReact = z.infer<typeof emojiReactSchema>;
type Delete = z.infer<typeof deleteSchema>;
type Zap = z.infer<typeof zapSchema>;
type Proxy = z.infer<typeof proxySchema>;

export { acceptSchema, activitySchema, actorSchema, emojiSchema, followSchema, imageSchema, noteSchema, objectSchema };
export type {
  Accept,
  Activity,
  Actor,
  Announce,
  CreateNote,
  Delete,
  Emoji,
  EmojiReact,
  Follow,
  Hashtag,
  Like,
  Mention,
  Note,
  Object,
  Proxy,
  Update,
  Zap,
};
