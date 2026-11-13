import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { defineMessage, FormattedMessage, useIntl, type IntlShape, type MessageDescriptor } from 'react-intl';
import { AlertTriangle, Loader2, Send } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useNostrPublish, type EventTemplate } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { shouldHideFeedEvent } from '@/lib/feedUtils';
import { getKindLabel, KIND_LABELS } from '@/lib/kindLabels';
import { isNostrId } from '@/lib/nostrId';
import { describePublishError } from '@/lib/publishError';
import { tryNeventEncode } from '@/lib/safeNip19';

interface StarterTemplate {
  kind: number;
  content: string;
  tags: string[][];
}

/** Starting points for common kinds. Built on demand so timestamps are current. */
const STARTERS: Record<number, () => StarterTemplate> = {
  1: () => ({ kind: 1, content: 'Hello from raw JSON!', tags: [] }),
  1111: () => ({
    kind: 1111,
    content: 'Nice post!',
    tags: [['E', '<root event id>', '', '<root author pubkey>'], ['K', '1'], ['P', '<root author pubkey>'], ['e', '<parent event id>', '', '<parent author pubkey>'], ['k', '1'], ['p', '<parent author pubkey>']],
  }),
  7: () => ({ kind: 7, content: '+', tags: [['e', '<event id>'], ['p', '<author pubkey>'], ['k', '1']] }),
  1068: () => ({
    kind: 1068,
    content: 'Tabs or spaces?',
    tags: [['option', 'a', 'Tabs'], ['option', 'b', 'Spaces'], ['polltype', 'singlechoice'], ['endsAt', String(Math.floor(Date.now() / 1000) + 86_400)]],
  }),
  9802: () => ({ kind: 9802, content: 'The quoted passage', tags: [['r', 'https://example.com/article', 'source']] }),
  30023: () => ({
    kind: 30023,
    content: '# My article\n\nWritten in **Markdown**.',
    tags: [['d', 'my-article'], ['title', 'My article'], ['summary', 'A short summary'], ['image', 'https://example.com/cover.jpg'], ['t', 'nostr']],
  }),
  30315: () => ({ kind: 30315, content: 'Working on something fun', tags: [['d', 'general']] }),
  30402: () => ({
    kind: 30402,
    content: 'Lightly used, new tires. Pickup only.',
    tags: [['d', 'road-bike'], ['title', 'Road bike'], ['summary', '56cm aluminum frame'], ['price', '300', 'USD'], ['location', 'Austin, TX'], ['image', 'https://example.com/bike.jpg'], ['t', 'bikes']],
  }),
  31923: () => {
    const start = Math.floor(Date.now() / 1000) + 7 * 86_400;
    return {
      kind: 31923,
      content: 'Come hang out!',
      tags: [['d', 'meetup'], ['title', 'Nostr meetup'], ['start', String(start)], ['end', String(start + 2 * 3600)], ['location', 'Somewhere fun']],
    };
  },
  39701: () => ({ kind: 39701, content: 'Worth a read', tags: [['d', 'example.com/article'], ['title', 'An example article'], ['t', 'reading']] }),
};

function starterJson(kind: number): string {
  return JSON.stringify(STARTERS[kind](), null, 2);
}

const errors = {
  json: defineMessage({ id: 'rawEvent.error.json', defaultMessage: 'Not valid JSON.' }),
  object: defineMessage({ id: 'rawEvent.error.object', defaultMessage: 'The event must be a JSON object.' }),
  kind: defineMessage({ id: 'rawEvent.error.kind', defaultMessage: '"kind" must be an integer between 0 and 65535.' }),
  content: defineMessage({ id: 'rawEvent.error.content', defaultMessage: '"content" must be a string.' }),
  tags: defineMessage({ id: 'rawEvent.error.tags', defaultMessage: '"tags" must be an array of arrays of strings.' }),
  createdAt: defineMessage({ id: 'rawEvent.error.createdAt', defaultMessage: '"created_at" must be a non-negative integer (Unix seconds).' }),
};

type ParseResult = { template: EventTemplate } | { error: MessageDescriptor };

interface Warning {
  message: MessageDescriptor;
  values?: Record<string, string>;
}

const warnings = {
  unknownKind: defineMessage({ id: 'rawEvent.warning.unknownKind', defaultMessage: "Ditto doesn't recognize kind {kind}, so it won't display this event. Other apps might." }),
  hidden: defineMessage({ id: 'rawEvent.warning.hidden', defaultMessage: "This {label} is missing tags or content Ditto requires, so it won't show up in feeds." }),
  profileJson: defineMessage({ id: 'rawEvent.warning.profileJson', defaultMessage: 'Profile content should be a JSON object, like {example}. Anything else breaks your profile in most apps.' }),
  badId: defineMessage({ id: 'rawEvent.warning.badId', defaultMessage: 'A "{tag}" tag doesn\'t hold a 64-character hex id. Did you leave a placeholder in?' }),
  emptyFollows: defineMessage({ id: 'rawEvent.warning.emptyFollows', defaultMessage: 'This has no "p" tags, so it will empty your follow list.' }),
  missingD: defineMessage({ id: 'rawEvent.warning.missingD', defaultMessage: 'Kind {kind} is addressable but has no "d" tag. It will be stored under an empty "d", replacing any other event of yours published that way.' }),
  replaces: defineMessage({ id: 'rawEvent.warning.replaces', defaultMessage: 'This replaces your current {label}.' }),
  replacesAddress: defineMessage({ id: 'rawEvent.warning.replacesAddress', defaultMessage: 'This replaces your {label} with "d" tag "{d}", if you have one.' }),
};

/** Tags whose first value is a hex event id or pubkey. */
const ID_TAGS = new Set(['e', 'E', 'p', 'P']);

/** Non-blocking problems with an otherwise valid template, from what Ditto knows about its kind. */
function getWarnings(template: EventTemplate, intl: IntlShape): Warning[] {
  const { kind, content, tags } = template;
  const label = getKindLabel(intl, kind);
  const result: Warning[] = [];

  if (!KIND_LABELS[kind]) {
    result.push({ message: warnings.unknownKind, values: { kind: String(kind) } });
  }

  if (kind === 0) {
    let metadata: unknown;
    try {
      metadata = JSON.parse(content);
    } catch {
      // Reported below.
    }
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
      result.push({ message: warnings.profileJson, values: { example: '{"name": "…"}' } });
    }
  } else if (KIND_LABELS[kind] && shouldHideFeedEvent({ ...template, id: '', pubkey: '', sig: '' })) {
    result.push({ message: warnings.hidden, values: { label } });
  }

  const badRef = tags.find(([name, value]) => ID_TAGS.has(name) && !isNostrId(value));
  if (badRef) {
    result.push({ message: warnings.badId, values: { tag: badRef[0] } });
  }

  if (kind === 3 && !tags.some(([name, value]) => name === 'p' && value)) {
    result.push({ message: warnings.emptyFollows });
  }

  if (kind >= 30000 && kind < 40000) {
    const d = tags.find(([name]) => name === 'd')?.[1];
    if (d === undefined) {
      result.push({ message: warnings.missingD, values: { kind: String(kind) } });
    } else {
      result.push({ message: warnings.replacesAddress, values: { label, d } });
    }
  } else if (kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000)) {
    result.push({ message: warnings.replaces, values: { label } });
  }

  return result;
}

/**
 * Parse user-supplied JSON into an unsigned event template. `id`, `pubkey`
 * and `sig` are ignored since the event is re-signed by the current account.
 */
function parseEventJson(text: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { error: errors.json };
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { error: errors.object };
  }

  const { kind, content = '', tags = [], created_at } = value as Record<string, unknown>;

  if (typeof kind !== 'number' || !Number.isInteger(kind) || kind < 0 || kind > 65535) {
    return { error: errors.kind };
  }
  if (typeof content !== 'string') {
    return { error: errors.content };
  }
  if (!Array.isArray(tags) || !tags.every((tag) => Array.isArray(tag) && tag.every((v) => typeof v === 'string'))) {
    return { error: errors.tags };
  }
  if (created_at !== undefined && (typeof created_at !== 'number' || !Number.isInteger(created_at) || created_at < 0)) {
    return { error: errors.createdAt };
  }

  return {
    template: {
      kind,
      content,
      tags: tags as string[][],
      created_at: created_at ?? Math.floor(Date.now() / 1000),
    },
  };
}

/** Sign and publish an arbitrary event written as raw JSON. */
export function RawEventPublisher() {
  const intl = useIntl();
  const { toast } = useToast();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const [text, setText] = useState(() => starterJson(1));
  const [published, setPublished] = useState<NostrEvent>();

  const parsed = useMemo(() => (text.trim() ? parseEventJson(text) : undefined), [text]);
  const error = parsed && 'error' in parsed ? parsed.error : undefined;
  const kindWarnings = useMemo(
    () => (parsed && 'template' in parsed ? getWarnings(parsed.template, intl) : []),
    [parsed, intl],
  );

  const handlePublish = async () => {
    if (!parsed || 'error' in parsed) return;
    try {
      const event = await publishEvent(parsed.template);
      setPublished(event);
      toast({ title: intl.formatMessage({ id: 'rawEvent.published', defaultMessage: 'Event published' }) });
    } catch (err) {
      const { title, description, values } = describePublishError(err);
      toast({
        title: intl.formatMessage(title),
        description: intl.formatMessage(description, values),
        variant: 'destructive',
      });
    }
  };

  const nevent = published ? tryNeventEncode({ id: published.id, author: published.pubkey, kind: published.kind }) : undefined;

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="raw-event-template" className="text-sm font-medium">
          <FormattedMessage id="rawEvent.template" defaultMessage="Start from" />
        </Label>
        <Select
          value=""
          onValueChange={(value) => {
            setText(starterJson(Number(value)));
            setPublished(undefined);
          }}
        >
          <SelectTrigger id="raw-event-template" className="w-full max-w-xs mt-2">
            <SelectValue placeholder={intl.formatMessage({ id: 'rawEvent.templatePlaceholder', defaultMessage: 'Pick a kind…' })} />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(STARTERS).map(Number).sort((a, b) => a - b).map((kind) => (
              <SelectItem key={kind} value={String(kind)}>
                <FormattedMessage
                  id="rawEvent.templateOption"
                  defaultMessage="{label} (kind {kind})"
                  values={{ label: getKindLabel(intl, kind), kind: String(kind) }}
                />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="raw-event-json" className="text-sm font-medium">
          <FormattedMessage id="rawEvent.label" defaultMessage="Event JSON" />
        </Label>
        <p className="text-xs text-muted-foreground mt-1 mb-2">
          <FormattedMessage
            id="rawEvent.description"
            defaultMessage="Write any event as JSON with <code>kind</code>, <code>content</code>, <code>tags</code>, and optionally <code>created_at</code>. It's signed with your current account and sent to your write relays. Any <code>id</code>, <code>pubkey</code>, or <code>sig</code> is ignored."
            values={{ code: (chunks) => <code className="bg-muted px-1 rounded">{chunks}</code> }}
          />
        </p>
        <Textarea
          id="raw-event-json"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPublished(undefined);
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          rows={10}
          aria-invalid={!!error}
          aria-describedby={error ? 'raw-event-error' : undefined}
          className="font-mono text-base md:text-sm"
        />
        {error && (
          <p id="raw-event-error" className="text-xs text-destructive mt-1">
            <FormattedMessage {...error} />
          </p>
        )}
      </div>

      {kindWarnings.length > 0 && (
        <ul className="space-y-1.5 rounded-lg bg-amber-500/10 px-3 py-2.5" aria-live="polite">
          {kindWarnings.map(({ message, values }) => (
            <li key={message.id} className="flex gap-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden />
              <span><FormattedMessage {...message} values={values} /></span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={handlePublish} disabled={!parsed || !!error || isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          <FormattedMessage id="rawEvent.publish" defaultMessage="Sign & publish" />
        </Button>
        {nevent && (
          <Link to={`/${nevent}`} className="text-sm text-primary hover:underline">
            <FormattedMessage id="rawEvent.view" defaultMessage="View published event" />
          </Link>
        )}
      </div>
    </div>
  );
}
