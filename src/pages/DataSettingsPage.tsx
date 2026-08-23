import { CloudDownload, CloudUpload, Download, FileText, TriangleAlert, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { defineMessage, FormattedMessage, FormattedNumber, useIntl, type MessageDescriptor } from 'react-intl';
import { Navigate } from 'react-router-dom';

import { InfoTip } from '@/components/InfoTip';
import { IntroImage } from '@/components/IntroImage';
import { PageHeader } from '@/components/PageHeader';
import { RelayProgressList } from '@/components/RelayProgressList';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { useAccountExport } from '@/hooks/useAccountExport';
import { useAccountImport } from '@/hooks/useAccountImport';
import { useAccountPublish } from '@/hooks/useAccountPublish';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useSeoMeta } from '@/hooks/useSeoMeta';
import { useToast } from '@/hooks/useToast';
import { KIND_LABELS } from '@/lib/kindLabels';
import { tryNpubEncode } from '@/lib/safeNip19';
import { cn } from '@/lib/utils';

import type { ImportIssueKind } from '@/lib/dataTransfer';

/** Issue rows rendered in the details dialog before truncating. */
const MAX_ISSUE_ROWS = 200;

const ISSUE_LABELS: Record<ImportIssueKind, MessageDescriptor> = {
  foreign: defineMessage({
    id: 'settings.data.issue.foreign',
    defaultMessage: 'Signed by another account',
  }),
  'invalid-signature': defineMessage({
    id: 'settings.data.issue.invalidSignature',
    defaultMessage: 'Signature does not verify',
  }),
  malformed: defineMessage({
    id: 'settings.data.issue.malformed',
    defaultMessage: 'Not a readable event',
  }),
};

/** Determinate bar for the local phases of an import (signing, saving). */
function PhaseBar({ label, current, total }: { label: React.ReactNode; current: number; total: number }) {
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="min-w-0 truncate text-muted-foreground">{label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          <FormattedNumber value={current} />
          {' / '}
          <FormattedNumber value={total} />
        </span>
      </div>
      <div
        className="h-1 overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function DataSettingsPage() {
  const intl = useIntl();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { toast } = useToast();

  const exporter = useAccountExport();
  const importer = useAccountImport();
  const publisher = useAccountPublish();

  const [fullPull, setFullPull] = useState(false);
  const [fullPush, setFullPush] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useSeoMeta({
    title: `${intl.formatMessage({ id: 'settings.sections.data.label', defaultMessage: "Import & Export" })} | ${intl.formatMessage({ id: 'settings.title', defaultMessage: "Settings" })} | ${config.appName}`,
    description: intl.formatMessage({ id: 'settings.data.metaDescription', defaultMessage: "Back up your events and restore them to the Nostr network" }),
  });

  // An import writes to the same local store the export count reads, so the
  // Publish button's "N events" would otherwise go stale right after one.
  const { refreshLocalCount } = exporter;
  const importStatus = importer.state.status;
  useEffect(() => {
    if (importStatus === 'done') void refreshLocalCount();
  }, [importStatus, refreshLocalCount]);

  if (!user) {
    return <Navigate to="/settings" replace />;
  }

  const exportRunning = exporter.state.status === 'running';
  const importState = importer.state;
  const importBusy = importState.status === 'signing' || importState.status === 'storing' || importState.status === 'pushing';
  const publishState = publisher.state;
  const publishBusy = publishState.status === 'reading' || publishState.status === 'pushing';
  const issues = importState.parsed?.issues ?? [];
  const foreignCount = issues.filter((issue) => issue.kind === 'foreign').length;
  const invalidCount = issues.filter((issue) => issue.kind === 'invalid-signature').length;
  const malformedCount = issues.filter((issue) => issue.kind === 'malformed').length;

  async function handleDownload() {
    try {
      const count = await exporter.download();
      toast({
        title: intl.formatMessage({ id: 'settings.data.downloadReady', defaultMessage: "Export saved" }),
        description: intl.formatMessage(
          { id: 'settings.data.downloadReadyDescription', defaultMessage: "{count, plural, one {# event written to a .jsonl file.} other {# events written to a .jsonl file.}}" },
          { count: count ?? 0 },
        ),
      });
    } catch {
      toast({
        title: intl.formatMessage({ id: 'settings.data.downloadFailed', defaultMessage: "Export failed" }),
        description: intl.formatMessage({ id: 'settings.data.downloadFailedDescription', defaultMessage: "The file could not be written. Check available storage and try again." }),
        variant: 'destructive',
      });
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so choosing the same file twice still fires a change event.
    event.target.value = '';
    if (file) void importer.selectFile(file);
  }

  return (
    <main className="">
      <PageHeader
        backTo="/settings"
        alwaysShowBack
        titleContent={
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold">
              <FormattedMessage id="settings.sections.data.label" defaultMessage={"Import & Export"} />
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              <FormattedMessage id="settings.data.pageDescription" defaultMessage={"Move your events between the Nostr network and this device."} />
            </p>
          </div>
        }
      />

      <div className="p-4">
        {/* Intro */}
        <div className="flex items-center gap-4 px-3 pt-2 pb-4">
          <IntroImage src="/data-intro.png" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">
              <FormattedMessage id="settings.data.yourArchive" defaultMessage={"Your archive"} />
            </h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              <FormattedMessage id="settings.data.yourArchiveDescription" defaultMessage={"Nostr has no single server holding your history — it is spread across the relays you publish to. These tools gather it into one local database you can save, and push a saved archive back out to the network."} />
            </p>
          </div>
        </div>

        {/* Export */}
        <div>
          <div className="relative px-3 py-3.5">
            <h2 className="text-base font-semibold flex items-center gap-1.5">
              <CloudDownload className="size-4" />
              <FormattedMessage id="settings.data.export" defaultMessage={"Export"} />
            </h2>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
          </div>

          <div className="pt-4 pb-6 px-3 space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <FormattedMessage id="settings.data.exportDescription" defaultMessage={"Reads every event you have published from each of your relays into this device's local database, then saves the result as a .jsonl file — one event per line."} />
            </p>

            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-1.5">
                <Label htmlFor="export-full" className="text-sm font-medium">
                  <FormattedMessage id="settings.data.fullPull" defaultMessage={"Full network scan"} />
                </Label>
                <InfoTip name={intl.formatMessage({ id: 'settings.data.fullPull', defaultMessage: "Full network scan" })}>
                  <FormattedMessage id="settings.data.fullPullDescription" defaultMessage={"Re-read your whole history from every relay. Off by default: each relay is asked only for events newer than the last sync, which is much faster. Turn this on after adding a relay that holds older posts."} />
                </InfoTip>
              </div>
              <Switch id="export-full" checked={fullPull} onCheckedChange={setFullPull} disabled={exportRunning} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void exporter.start({ full: fullPull })} disabled={exportRunning}>
                <CloudDownload className="size-4" />
                <FormattedMessage id="settings.data.fetchFromRelays" defaultMessage={"Fetch from relays"} />
              </Button>

              {exportRunning && (
                <Button variant="outline" onClick={exporter.cancel}>
                  <FormattedMessage id="settings.data.cancel" defaultMessage={"Cancel"} />
                </Button>
              )}

              <Button
                variant="outline"
                onClick={() => void handleDownload()}
                disabled={exporter.isDownloading || !exporter.localCount}
              >
                <Download className="size-4" />
                {exporter.localCount === undefined ? (
                  <FormattedMessage id="settings.data.download" defaultMessage={"Download .jsonl"} />
                ) : (
                  <FormattedMessage
                    id="settings.data.downloadCount"
                    defaultMessage={"Download {count, plural, one {# event} other {# events}}"}
                    values={{ count: exporter.localCount }}
                  />
                )}
              </Button>
            </div>

            <RelayProgressList relays={exporter.state.relays} />

            {exporter.state.status === 'done' && (
              <p className="text-xs text-muted-foreground">
                <FormattedMessage
                  id="settings.data.exportDone"
                  defaultMessage={"{count, plural, one {# event received from relays.} other {# events received from relays.}}"}
                  values={{ count: exporter.state.fetched }}
                />
              </p>
            )}
          </div>
        </div>

        {/* Import */}
        <div>
          <div className="relative px-3 py-3.5">
            <h2 className="text-base font-semibold flex items-center gap-1.5">
              <CloudUpload className="size-4" />
              <FormattedMessage id="settings.data.import" defaultMessage={"Import"} />
            </h2>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
          </div>

          <div className="pt-4 pb-6 px-3 space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <FormattedMessage id="settings.data.importDescription" defaultMessage={"Publishes events to your relays — either from a file, or from what this device already holds."} />
            </p>

            {/* Applies to both of the pushes below. */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-1.5">
                <Label htmlFor="import-full" className="text-sm font-medium">
                  <FormattedMessage id="settings.data.fullPush" defaultMessage={"Full network push"} />
                </Label>
                <InfoTip name={intl.formatMessage({ id: 'settings.data.fullPush', defaultMessage: "Full network push" })}>
                  <FormattedMessage id="settings.data.fullPushDescription" defaultMessage={"Send every event again, even ones a relay already accepted from a previous run. Off by default so a repeated push only sends what is missing."} />
                </InfoTip>
              </div>
              <Switch id="import-full" checked={fullPush} onCheckedChange={setFullPush} disabled={importBusy || publishBusy} />
            </div>

            <div className="h-px bg-primary/10" />

            {/* From a file */}
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <FormattedMessage id="settings.data.fromFile" defaultMessage={"From a file"} />
              <InfoTip name={intl.formatMessage({ id: 'settings.data.fromFile', defaultMessage: "From a file" })}>
                <FormattedMessage id="settings.data.fromFileDescription" defaultMessage={"Reads a .jsonl file, saves it to this device, and publishes it. Lines with no signature are signed with your account, so you can write events by hand — only \"kind\" is required."} />
              </InfoTip>
            </h3>

            <input
              ref={fileRef}
              type="file"
              accept=".jsonl,.ndjson,.json,.txt,application/x-ndjson,application/json,text/plain"
              className="hidden"
              onChange={handleFileChange}
            />

            {!importState.parsed && (
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importState.status === 'parsing'}>
                <FileText className="size-4" />
                <FormattedMessage id="settings.data.chooseFile" defaultMessage={"Choose a file"} />
              </Button>
            )}

            {importState.parsed && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate text-xs font-medium" title={importState.filename}>
                    {importState.filename}
                  </span>
                  {!importBusy && (
                    <button
                      onClick={importer.reset}
                      className="ml-auto -mr-1 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={intl.formatMessage({ id: 'settings.data.clearFile', defaultMessage: "Clear selected file" })}
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="text-[11px]">
                    <FormattedMessage
                      id="settings.data.readyCount"
                      defaultMessage={"{count, plural, one {# ready} other {# ready}}"}
                      values={{ count: importState.parsed.signed.length }}
                    />
                  </Badge>

                  {importState.parsed.unsigned.length > 0 && (
                    <Badge variant="secondary" className="text-[11px]">
                      <FormattedMessage
                        id="settings.data.toSignCount"
                        defaultMessage={"{count, plural, one {# to sign} other {# to sign}}"}
                        values={{ count: importState.parsed.unsigned.length }}
                      />
                    </Badge>
                  )}

                  {issues.length > 0 && (
                    <button
                      onClick={() => setIssuesOpen(true)}
                      className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-400"
                    >
                      <TriangleAlert className="size-3" />
                      <FormattedMessage
                        id="settings.data.warningCount"
                        defaultMessage={"{count, plural, one {# warning} other {# warnings}}"}
                        values={{ count: issues.length }}
                      />
                    </button>
                  )}
                </div>

                {foreignCount > 0 && (
                  <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                    <FormattedMessage
                      id="settings.data.foreignWarning"
                      defaultMessage={"{count, plural, one {# event is signed by a different account and will be skipped.} other {# events are signed by a different account and will be skipped.}} Tap the warning badge for details."}
                      values={{ count: foreignCount }}
                    />
                  </p>
                )}

                {invalidCount > 0 && (
                  <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                    <FormattedMessage
                      id="settings.data.invalidSignatureWarning"
                      defaultMessage={"{count, plural, one {# event has a signature that does not verify and will be skipped.} other {# events have signatures that do not verify and will be skipped.}}"}
                      values={{ count: invalidCount }}
                    />
                  </p>
                )}

                {malformedCount > 0 && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    <FormattedMessage
                      id="settings.data.malformedWarning"
                      defaultMessage={"{count, plural, one {# line could not be read as an event.} other {# lines could not be read as events.}}"}
                      values={{ count: malformedCount }}
                    />
                  </p>
                )}

                {importState.parsed.unsigned.length > 0 && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    <FormattedMessage
                      id="settings.data.signingNotice"
                      defaultMessage={"Unsigned events are signed with your account, one at a time. A browser extension or remote signer may ask you to approve each one."}
                    />
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => void importer.start({ full: fullPush })}
                disabled={importBusy || !importState.parsed || importState.publishable === 0}
              >
                <CloudUpload className="size-4" />
                <FormattedMessage id="settings.data.startImport" defaultMessage={"Import & publish"} />
              </Button>

              {importBusy && (
                <Button variant="outline" onClick={importer.cancel}>
                  <FormattedMessage id="settings.data.cancel" defaultMessage={"Cancel"} />
                </Button>
              )}
            </div>

            {importState.status === 'signing' && importState.parsed && (
              <PhaseBar
                label={<FormattedMessage id="settings.data.signingPhase" defaultMessage={"Signing events"} />}
                current={importState.signed}
                total={importState.parsed.unsigned.length}
              />
            )}

            {importState.status === 'storing' && (
              <PhaseBar
                label={<FormattedMessage id="settings.data.storingPhase" defaultMessage={"Saving to this device"} />}
                current={importState.stored}
                total={importState.publishable}
              />
            )}

            <RelayProgressList relays={importer.relays} />

            {importState.status === 'done' && (
              <p className="text-xs text-muted-foreground">
                <FormattedMessage
                  id="settings.data.importDone"
                  defaultMessage={"{count, plural, one {# event saved locally and sent to your relays.} other {# events saved locally and sent to your relays.}}"}
                  values={{ count: importState.stored }}
                />
              </p>
            )}

            {importState.status === 'error' && (
              <p className="text-xs text-destructive">{importState.error}</p>
            )}

            <div className="h-px bg-primary/10" />

            {/* From this device */}
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <FormattedMessage id="settings.data.fromLocal" defaultMessage={"From this device"} />
              <InfoTip name={intl.formatMessage({ id: 'settings.data.fromLocal', defaultMessage: "From this device" })}>
                <FormattedMessage id="settings.data.fromLocalDescription" defaultMessage={"Publishes what this device already holds, with no file involved. Use it to fill in a relay you just added, or one that lost its copy of your history. Run Export first so there is something to send."} />
              </InfoTip>
            </h3>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => void publisher.start({ full: fullPush })}
                disabled={publishBusy || !exporter.localCount}
              >
                <CloudUpload className="size-4" />
                {exporter.localCount === undefined ? (
                  <FormattedMessage id="settings.data.startPublish" defaultMessage={"Publish local events"} />
                ) : (
                  <FormattedMessage
                    id="settings.data.startPublishCount"
                    defaultMessage={"Publish {count, plural, one {# event} other {# events}}"}
                    values={{ count: exporter.localCount }}
                  />
                )}
              </Button>

              {publishBusy && (
                <Button variant="outline" onClick={publisher.cancel}>
                  <FormattedMessage id="settings.data.cancel" defaultMessage={"Cancel"} />
                </Button>
              )}
            </div>

            {publishState.status === 'reading' && (
              <p className="text-xs text-muted-foreground">
                <FormattedMessage id="settings.data.readingLocal" defaultMessage={"Reading the local database…"} />
              </p>
            )}

            <RelayProgressList relays={publisher.relays} />

            {publishState.status === 'done' && (
              <p className="text-xs text-muted-foreground">
                {publishState.total === 0 ? (
                  <FormattedMessage id="settings.data.publishEmpty" defaultMessage={"Nothing to publish — this device holds none of your events yet. Run Export first."} />
                ) : (
                  <FormattedMessage
                    id="settings.data.publishDone"
                    defaultMessage={"{count, plural, one {# event offered to your relays.} other {# events offered to your relays.}}"}
                    values={{ count: publishState.total }}
                  />
                )}
              </p>
            )}

            {publishState.status === 'error' && (
              <p className="text-xs text-destructive">{publishState.error}</p>
            )}
          </div>
        </div>
      </div>

      {/* Warning details */}
      <Dialog open={issuesOpen} onOpenChange={setIssuesOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage id="settings.data.issuesTitle" defaultMessage={"Skipped lines"} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage id="settings.data.issuesDescription" defaultMessage={"These lines will not be saved or published. Events signed by another account cannot be re-signed by you without changing their author, so they are left alone."} />
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-3">
            <ul className="divide-y divide-border/60">
              {issues.slice(0, MAX_ISSUE_ROWS).map((issue) => {
                const npub = tryNpubEncode(issue.pubkey);
                return (
                  <li key={issue.line} className="py-2.5 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px] tabular-nums">
                        <FormattedMessage
                          id="settings.data.issueLine"
                          defaultMessage={"Line {line}"}
                          values={{ line: issue.line }}
                        />
                      </Badge>
                      <span
                        className={cn(
                          'text-xs font-medium',
                          issue.kind === 'malformed' ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400',
                        )}
                      >
                        <FormattedMessage {...ISSUE_LABELS[issue.kind]} />
                      </span>
                      {issue.eventKind !== undefined && (
                        <span className="text-[11px] text-muted-foreground">
                          {KIND_LABELS[issue.eventKind] ?? intl.formatMessage(
                            { id: 'settings.data.issueKind', defaultMessage: 'Kind {kind}' },
                            { kind: issue.eventKind },
                          )}
                        </span>
                      )}
                    </div>
                    {npub && (
                      <p className="break-all font-mono text-[10px] leading-relaxed text-muted-foreground">{npub}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </ScrollArea>

          {issues.length > MAX_ISSUE_ROWS && (
            <p className="text-xs text-muted-foreground">
              <FormattedMessage
                id="settings.data.issuesTruncated"
                defaultMessage={"…and {count, plural, one {# more} other {# more}}."}
                values={{ count: issues.length - MAX_ISSUE_ROWS }}
              />
            </p>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
