import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { defineMessage, FormattedMessage, useIntl, type MessageDescriptor } from 'react-intl';
import { Loader2, Send } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useNostrPublish, type EventTemplate } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { describePublishError } from '@/lib/publishError';
import { tryNeventEncode } from '@/lib/safeNip19';

const EXAMPLE = JSON.stringify({ kind: 1, content: 'Hello from raw JSON!', tags: [] }, null, 2);

const errors = {
  json: defineMessage({ id: 'rawEvent.error.json', defaultMessage: 'Not valid JSON.' }),
  object: defineMessage({ id: 'rawEvent.error.object', defaultMessage: 'The event must be a JSON object.' }),
  kind: defineMessage({ id: 'rawEvent.error.kind', defaultMessage: '"kind" must be an integer between 0 and 65535.' }),
  content: defineMessage({ id: 'rawEvent.error.content', defaultMessage: '"content" must be a string.' }),
  tags: defineMessage({ id: 'rawEvent.error.tags', defaultMessage: '"tags" must be an array of arrays of strings.' }),
  createdAt: defineMessage({ id: 'rawEvent.error.createdAt', defaultMessage: '"created_at" must be a non-negative integer (Unix seconds).' }),
};

type ParseResult = { template: EventTemplate } | { error: MessageDescriptor };

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
  const [text, setText] = useState(EXAMPLE);
  const [published, setPublished] = useState<NostrEvent>();

  const parsed = useMemo(() => (text.trim() ? parseEventJson(text) : undefined), [text]);
  const error = parsed && 'error' in parsed ? parsed.error : undefined;

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
