import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FormattedMessage, useIntl } from 'react-intl';
import { AlertTriangle, Loader2, Send } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { NoteCard } from '@/components/NoteCard';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { getKindLabel } from '@/lib/kindLabels';
import { describePublishError } from '@/lib/publishError';
import { buildPreviewEvent, getWarnings, parseEventJson, type Warning } from '@/lib/rawEvent';
import { tryNeventEncode } from '@/lib/safeNip19';
import { cn } from '@/lib/utils';

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
  9802: () => ({ kind: 9802, content: 'The quoted passage', tags: [['i', 'https://example.com/article'], ['r', 'https://example.com/article', 'source']] }),
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

/** Sign and publish an arbitrary event written as raw JSON. */
export function RawEventPublisher() {
  const intl = useIntl();
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const [text, setText] = useState(() => starterJson(1));
  const [published, setPublished] = useState<NostrEvent>();

  const parsed = useMemo(() => (text.trim() ? parseEventJson(text) : undefined), [text]);
  const error = parsed && 'error' in parsed ? parsed.error : undefined;
  const kindWarnings = useMemo(
    () => (parsed && 'template' in parsed ? getWarnings(parsed.template, intl) : []),
    [parsed, intl],
  );

  const previewEvent = useMemo(
    () => (user && parsed && 'template' in parsed ? buildPreviewEvent(parsed.template, user.pubkey) : undefined),
    [user, parsed],
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

      <RawEventWarnings warnings={kindWarnings} />

      {previewEvent && (
        <div>
          <p className="text-sm font-medium mb-2">
            <FormattedMessage id="rawEvent.preview" defaultMessage="Feed preview" />
          </p>
          <RawEventPreview event={previewEvent} />
        </div>
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

/** Warnings about an event being written, in amber, or errors that block publishing, in red. */
export function RawEventWarnings({ warnings, blocking }: { warnings: Warning[]; blocking?: boolean }) {
  if (warnings.length === 0) return null;
  return (
    <ul
      className={cn('space-y-1.5 rounded-lg px-3 py-2.5', blocking ? 'bg-destructive/10' : 'bg-amber-500/10')}
      aria-live="polite"
    >
      {warnings.map(({ message, values }) => (
        <li
          key={message.id}
          className={cn('flex gap-2 text-xs', blocking ? 'text-destructive' : 'text-amber-700 dark:text-amber-400')}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden />
          <span><FormattedMessage {...message} values={values} /></span>
        </li>
      ))}
    </ul>
  );
}

/** An unpublished event drawn with the feed's own card. */
export function RawEventPreview({ event }: { event: NostrEvent }) {
  return (
    // Inert: the preview's links and actions point at an event that doesn't exist yet.
    <div inert className="rounded-2xl border border-border-subtle overflow-hidden">
      <NoteCard event={event} compact />
    </div>
  );
}
