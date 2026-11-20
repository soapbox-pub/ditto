import { useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Pencil, Save } from 'lucide-react';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { RawEventPreview, RawEventWarnings } from '@/components/RawEventPublisher';
import { parseAuthorEvent } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useNostrStorage } from '@/hooks/useNostrStorage';
import { useToast } from '@/hooks/useToast';
import { isAddressableKind } from '@/lib/eventKinds';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { getKindLabel } from '@/lib/kindLabels';
import { describePublishError } from '@/lib/publishError';
import { buildPreviewEvent, checkEdit, diffTags, eventToEditableJson, parseEventJson } from '@/lib/rawEvent';

interface RawEventEditDialogProps {
  /** The current user's replaceable or addressable event to edit. */
  event: NostrEvent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opened from the event's own menu, which also offers restoring an older version. */
  fromMenu?: boolean;
}

/** Most added or removed tags listed in the preview, each way. */
const MAX_TAG_LINES = 50;

/**
 * Edit one of the user's replaceable or addressable events as raw JSON, with
 * a preview of the result and the tags it adds and removes. The edit must
 * still parse, stay the same event (kind and "d" tag) and not introduce a
 * problem the event didn't already have. Before publishing it checks the
 * relays for a newer version, so it never overwrites a change made elsewhere.
 */
export function RawEventEditDialog({ event, open, onOpenChange, fromMenu }: RawEventEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[85dvh] flex flex-col gap-0 p-0 rounded-2xl overflow-hidden"
        aria-describedby={undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
          <DialogTitle className="text-base font-semibold">
            <FormattedMessage id="rawEvent.edit.title" defaultMessage="Edit Event JSON" />
          </DialogTitle>
        </DialogHeader>
        {open && <EditorBody key={event.id} event={event} fromMenu={fromMenu} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function EditorBody({ event, fromMenu, onClose }: { event: NostrEvent; fromMenu?: boolean; onClose: () => void }) {
  const intl = useIntl();
  const { nostr } = useNostr();
  const { store } = useNostrStorage();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();

  const [base, setBase] = useState(event);
  const [text, setText] = useState(() => eventToEditableJson(event));
  const [tab, setTab] = useState('edit');
  const [newer, setNewer] = useState<NostrEvent>();
  const [publishing, setPublishing] = useState(false);

  const label = getKindLabel(intl, base.kind);
  const parsed = useMemo(() => parseEventJson(text), [text]);
  const template = 'template' in parsed ? parsed.template : undefined;
  const check = useMemo(() => (template ? checkEdit(template, base, intl) : undefined), [template, base, intl]);
  const diff = useMemo(() => (template ? diffTags(base.tags, template.tags) : undefined), [template, base]);
  const contentChanged = !!template && template.content !== base.content;
  const changed = contentChanged || !!diff?.added.length || !!diff?.removed.length;
  const previewEvent = useMemo(
    () => (template && user ? buildPreviewEvent(template, user.pubkey) : undefined),
    [template, user],
  );

  const canPublish = !!template && !!check && check.errors.length === 0 && changed && !newer && !publishing
    && user?.pubkey === base.pubkey;

  const handlePublish = async () => {
    if (!template || !canPublish) return;
    setPublishing(true);
    try {
      const filter: NostrFilter = { kinds: [base.kind], authors: [base.pubkey] };
      if (isAddressableKind(base.kind)) filter['#d'] = [base.tags.find(([name]) => name === 'd')?.[1] ?? ''];
      const prev = await fetchFreshEvent(nostr, filter, { store });
      if (prev && prev.id !== base.id && prev.created_at >= base.created_at) {
        setNewer(prev);
        return;
      }
      const published = await publishEvent({ ...template, prev: prev ?? base });
      // The app's own copies of these drive the session (relays, profile,
      // follows), so they take the edit now instead of on their next refetch.
      if (published.kind === 0) queryClient.setQueryData(['author', published.pubkey], parseAuthorEvent(published));
      if (published.kind === 3) queryClient.invalidateQueries({ queryKey: ['follow-list', published.pubkey] });
      if (published.kind === 10002) queryClient.setQueryData(['relayList', published.pubkey], published);
      toast({ title: intl.formatMessage({ id: 'rawEvent.edit.published', defaultMessage: 'Changes published' }) });
      onClose();
    } catch (err) {
      const { title, description, values } = describePublishError(err);
      toast({
        title: intl.formatMessage(title),
        description: intl.formatMessage(description, values),
        variant: 'destructive',
      });
    } finally {
      setPublishing(false);
    }
  };

  const loadNewer = () => {
    if (!newer) return;
    setBase(newer);
    setText(eventToEditableJson(newer));
    setNewer(undefined);
  };

  const blocking = 'error' in parsed ? [{ message: parsed.error }] : check?.errors ?? [];

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-4 space-y-3">
        <div className="flex gap-2 rounded-lg bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden />
          <p>
            {fromMenu ? (
              <FormattedMessage
                id="rawEvent.edit.caution"
                defaultMessage="You're editing the raw event. Ditto checks the basics, but an edit that passes can still break this {label} in other apps. If it goes wrong, use Restore previous version from the same menu."
                values={{ label }}
              />
            ) : (
              <FormattedMessage
                id="rawEvent.edit.cautionPlain"
                defaultMessage="You're editing the raw event. Ditto checks the basics, but an edit that passes can still break this {label} in other apps."
                values={{ label }}
              />
            )}
          </p>
        </div>

        {newer && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-destructive/10 px-3 py-2.5 text-xs text-destructive" role="alert">
            <p className="flex-1 min-w-48">
              <FormattedMessage
                id="rawEvent.edit.newer"
                defaultMessage="This {label} changed since you opened it, so publishing would overwrite that change. Load the latest version and make your edit again."
                values={{ label }}
              />
            </p>
            <Button size="sm" variant="outline" onClick={loadNewer}>
              <FormattedMessage id="rawEvent.edit.loadNewer" defaultMessage="Load latest version" />
            </Button>
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="edit">
              <FormattedMessage id="rawEvent.edit.tabEdit" defaultMessage="Edit" />
            </TabsTrigger>
            <TabsTrigger value="preview">
              <FormattedMessage id="rawEvent.edit.tabPreview" defaultMessage="Preview" />
            </TabsTrigger>
          </TabsList>

          <TabsContent value="edit">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label={intl.formatMessage({ id: 'rawEvent.label', defaultMessage: 'Event JSON' })}
              aria-invalid={blocking.length > 0}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              rows={14}
              className="font-mono text-base md:text-sm"
            />
          </TabsContent>

          <TabsContent value="preview" className="space-y-3">
            {previewEvent ? (
              <RawEventPreview event={previewEvent} />
            ) : template && (
              <p className="text-sm text-muted-foreground">
                <FormattedMessage
                  id="rawEvent.edit.noCard"
                  defaultMessage="Ditto doesn't show this kind as a post, so here's what your edit changes."
                />
              </p>
            )}
            {template && <EditChanges contentChanged={contentChanged} added={diff?.added ?? []} removed={diff?.removed ?? []} />}
          </TabsContent>
        </Tabs>

        <RawEventWarnings warnings={blocking} blocking />
        <RawEventWarnings warnings={check?.warnings ?? []} />
      </div>

      <div className="flex justify-end gap-2 border-t border-border-subtle px-5 py-3 shrink-0">
        <Button variant="ghost" onClick={onClose}>
          <FormattedMessage id="common.cancel" defaultMessage="Cancel" />
        </Button>
        <Button onClick={handlePublish} disabled={!canPublish}>
          {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <FormattedMessage id="rawEvent.edit.publish" defaultMessage="Sign & publish" />
        </Button>
      </div>
    </>
  );
}

/** The user's own lists and profile, which never show up as posts with a menu to edit them from. */
const OWN_KINDS = [0, 3, 10002];

/** Buttons that load the user's current profile, follow list or relay list into the raw editor. */
export function RawEventEditLauncher() {
  const intl = useIntl();
  const { nostr } = useNostr();
  const { store } = useNostrStorage();
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const [loading, setLoading] = useState<number>();
  const [target, setTarget] = useState<NostrEvent>();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const load = async (kind: number) => {
    setLoading(kind);
    try {
      const event = await fetchFreshEvent(nostr, { kinds: [kind], authors: [user.pubkey] }, { store });
      if (event) {
        setTarget(event);
        setOpen(true);
      } else {
        toast({
          title: intl.formatMessage(
            { id: 'rawEvent.edit.notFound', defaultMessage: "Couldn't find your {label} on your relays." },
            { label: getKindLabel(intl, kind) },
          ),
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(undefined);
    }
  };

  return (
    <div>
      <p className="text-sm font-medium">
        <FormattedMessage id="rawEvent.edit.launcherLabel" defaultMessage="Edit yours" />
      </p>
      <div className="flex flex-wrap gap-2 mt-2">
        {OWN_KINDS.map((kind) => (
          <Button key={kind} size="sm" variant="secondary" onClick={() => load(kind)} disabled={loading !== undefined}>
            {loading === kind ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
            {getKindLabel(intl, kind)}
          </Button>
        ))}
      </div>
      {target && <RawEventEditDialog event={target} open={open} onOpenChange={setOpen} />}
    </div>
  );
}

function EditChanges({ contentChanged, added, removed }: { contentChanged: boolean; added: string[][]; removed: string[][] }) {
  if (!contentChanged && added.length === 0 && removed.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        <FormattedMessage id="rawEvent.edit.noChanges" defaultMessage="No changes yet." />
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm font-medium mb-2">
        <FormattedMessage id="rawEvent.edit.changes" defaultMessage="Changes" />
      </p>
      <div className="inset-well rounded-lg px-3 py-2 space-y-1 font-mono text-xs break-all">
        {contentChanged && (
          <p className="font-sans text-muted-foreground">
            <FormattedMessage id="rawEvent.edit.contentChanged" defaultMessage="Content changed" />
          </p>
        )}
        <TagLines tags={removed} sign="−" className="text-destructive" />
        <TagLines tags={added} sign="+" className="text-green-700 dark:text-green-400" />
      </div>
    </div>
  );
}

function TagLines({ tags, sign, className }: { tags: string[][]; sign: string; className: string }) {
  const more = tags.length - MAX_TAG_LINES;
  return (
    <>
      {tags.slice(0, MAX_TAG_LINES).map((tag, i) => (
        <p key={i} className={className}>
          {sign} {JSON.stringify(tag)}
        </p>
      ))}
      {more > 0 && (
        <p className={className}>
          <FormattedMessage id="rawEvent.edit.moreTags" defaultMessage="{sign} and {count} more" values={{ sign, count: more }} />
        </p>
      )}
    </>
  );
}
