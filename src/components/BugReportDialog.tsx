import { useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { Capacitor } from '@capacitor/core';
import { nip19 } from 'nostr-tools';
import { ImagePlus, Loader2, X } from 'lucide-react';

import { AdaptiveDialog, AdaptiveDialogContent, AdaptiveDialogDescription, AdaptiveDialogTitle } from '@/components/AdaptiveDialog';
import { LoginArea } from '@/components/auth/LoginArea';
import { EmbeddedPost } from '@/components/EmbeddedPost';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { toast } from '@/hooks/useToast';
import { DITTO_REPO_COORD, DITTO_REPO_OWNER, DITTO_REPO_RELAYS } from '@/lib/dittoRepo';
import { encodeEventAddress } from '@/lib/encodeEvent';
import type { NostrEvent } from '@nostrify/nostrify';

interface BugReportDialogProps {
  /** The post the bug showed up on, quoted in the issue. */
  event?: NostrEvent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Screenshot {
  url: string;
  tags: string[][];
}

/** Device details appended to the issue so the bug can be reproduced. */
function describeDevice(path: string): string {
  return [
    `Ditto v${import.meta.env.VERSION} (${Capacitor.getPlatform()})`,
    `Page: ${path}`,
    `Viewport: ${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`,
    `User agent: ${navigator.userAgent}`,
  ].join('\n');
}

/**
 * Files a NIP-34 issue (kind 1621) against Ditto's repository, optionally
 * quoting the post the bug appeared on.
 */
export function BugReportDialog({ event, open, onOpenChange }: BugReportDialogProps) {
  const intl = useIntl();
  const navigate = useNavigate();
  const location = useLocation();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [includeDevice, setIncludeDevice] = useState(true);

  const deviceInfo = describeDevice(location.pathname);
  const canSubmit = !!user && subject.trim() !== '' && description.trim() !== '' && !isPending && !isUploading;

  const handleFiles = async (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      try {
        const tags = await uploadFile(file);
        setScreenshots((prev) => [...prev, { url: tags[0][1], tags }]);
      } catch {
        toast({ title: intl.formatMessage({ id: 'bugReport.uploadFailed', defaultMessage: "Couldn't upload {name}" }, { name: file.name }), variant: 'destructive' });
      }
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    const sections = [description.trim()];
    if (screenshots.length > 0) sections.push(screenshots.map((s) => s.url).join('\n'));
    if (event) sections.push(`Seen on: nostr:${encodeEventAddress(event)}`);
    if (includeDevice) sections.push(deviceInfo);

    const tags: string[][] = [
      ['a', DITTO_REPO_COORD, DITTO_REPO_RELAYS[0]],
      ['p', DITTO_REPO_OWNER],
      ['subject', subject.trim()],
      ['t', 'bug'],
      ['alt', `Bug report: ${subject.trim()}`],
    ];
    if (event) tags.push(['q', event.id, '', event.pubkey]);
    for (const { tags: fileTags } of screenshots) {
      tags.push(['imeta', ...fileTags.map(([name, value]) => `${name} ${value}`)]);
    }

    try {
      const issue = await publishEvent({ kind: 1621, content: sections.join('\n\n'), tags });

      // NIP-34: issues belong on the repository's relays, which the user's
      // own write relays rarely include.
      await nostr.group(DITTO_REPO_RELAYS).event(issue, { signal: AbortSignal.timeout(5000) }).catch(() => {});

      toast({ title: intl.formatMessage({ id: 'bugReport.submitted', defaultMessage: 'Bug reported. Thank you!' }) });
      setSubject('');
      setDescription('');
      setScreenshots([]);
      onOpenChange(false);
      navigate(`/${nip19.neventEncode({ id: issue.id, author: issue.pubkey, kind: issue.kind, relays: DITTO_REPO_RELAYS.slice(0, 2) })}`);
    } catch (error) {
      toast({
        title: intl.formatMessage({ id: 'bugReport.submitFailed', defaultMessage: "Couldn't send the bug report" }),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    }
  };

  return (
    <AdaptiveDialog open={open} onOpenChange={onOpenChange}>
      <AdaptiveDialogContent
        className="max-w-lg max-h-[85dvh] rounded-2xl flex flex-col overflow-hidden"
        sheetClassName="gap-4 px-6 pt-3 pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <AdaptiveDialogTitle>
          <FormattedMessage id="bugReport.title" defaultMessage="Report a bug" />
        </AdaptiveDialogTitle>
        <AdaptiveDialogDescription className="text-sm text-muted-foreground">
          <FormattedMessage
            id="bugReport.description"
            defaultMessage="This files a public issue on Ditto's repository, signed by you, so the team can reply to it."
          />
        </AdaptiveDialogDescription>

        {!user ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              <FormattedMessage id="bugReport.loginRequired" defaultMessage="Log in to report a bug." />
            </p>
            <LoginArea className="max-w-60" />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6 space-y-4 pb-1">
              {event && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    <FormattedMessage id="bugReport.seenOn" defaultMessage="Seen on this post" />
                  </p>
                  <EmbeddedPost event={event} disableHoverCards />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="bug-subject">
                  <FormattedMessage id="bugReport.subject" defaultMessage="What went wrong?" />
                </Label>
                <Input
                  id="bug-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={intl.formatMessage({ id: 'bugReport.subjectPlaceholder', defaultMessage: 'e.g. Feed jumps back to the top while scrolling' })}
                  maxLength={200}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bug-description">
                  <FormattedMessage id="bugReport.details" defaultMessage="Details" />
                </Label>
                <Textarea
                  id="bug-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={intl.formatMessage({ id: 'bugReport.detailsPlaceholder', defaultMessage: 'What did you do, what did you expect, and what happened instead?' })}
                  className="resize-none"
                  rows={5}
                />
              </div>

              <div className="space-y-2">
                {screenshots.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {screenshots.map((s) => (
                      <div key={s.url} className="relative">
                        <img src={s.url} alt="" className="size-20 rounded-lg border border-border-subtle object-cover" />
                        <button
                          type="button"
                          onClick={() => setScreenshots((prev) => prev.filter((p) => p.url !== s.url))}
                          className="absolute -top-2 -right-2 rounded-full bg-background border border-border p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={intl.formatMessage({ id: 'bugReport.removeScreenshot', defaultMessage: 'Remove screenshot' })}
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void handleFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                  <FormattedMessage id="bugReport.addScreenshot" defaultMessage="Add screenshot" />
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="bug-device">
                    <FormattedMessage id="bugReport.includeDevice" defaultMessage="Include app and device info" />
                  </Label>
                  <Switch id="bug-device" checked={includeDevice} onCheckedChange={setIncludeDevice} />
                </div>
                {includeDevice && (
                  <pre className="inset-well rounded-lg p-3 text-xs text-muted-foreground whitespace-pre-wrap break-all">{deviceInfo}</pre>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2 shrink-0 max-sidebar:[&>*]:flex-1">
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
                <FormattedMessage id="common.cancel" defaultMessage="Cancel" />
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit}>
                {isPending ? (
                  <FormattedMessage id="bugReport.submitting" defaultMessage="Sending..." />
                ) : (
                  <FormattedMessage id="bugReport.submit" defaultMessage="Send bug report" />
                )}
              </Button>
            </div>
          </>
        )}
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
