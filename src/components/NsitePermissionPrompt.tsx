import { useState } from 'react';
import { defineMessages, FormattedMessage, useIntl, type IntlShape } from 'react-intl';
import { AlertTriangle, Check, KeyRound, Lock, Pen, ShieldAlert, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { formatNsiteRecord, getKindLabel } from '@/lib/nsitePermissions';
import type { NsitePromptState, NsitePromptDecision } from '@/hooks/useNsiteSignerRpc';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NsitePermissionPromptProps {
  /** App icon URL, if available. */
  appPicture?: string;
  /** Human-readable app name. */
  appName: string;
  /** The nsite gateway URL, used to fetch the site favicon. */
  siteUrl?: string;
  /** The pending prompt state from useNsiteSignerRpc. */
  prompt: NsitePromptState;
  /** Callback to resolve the prompt. */
  onResolve: (decision: NsitePromptDecision) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPromptIcon(type: NsitePromptState['type']) {
  switch (type) {
    case 'signEvent':
      return <Pen className="size-5 text-amber-500" />;
    case 'nip04.encrypt':
    case 'nip44.encrypt':
      return <Lock className="size-5 text-blue-500" />;
    case 'nip04.decrypt':
    case 'nip44.decrypt':
      return <KeyRound className="size-5 text-violet-500" />;
  }
}

const messages = defineMessages({
  write: { id: 'nsite.prompt.write', defaultMessage: 'Write: {label}' },
  signKind: { id: 'nsite.prompt.signKind', defaultMessage: 'Sign: {label}' },
  signEvent: { id: 'nsite.prompt.signEvent', defaultMessage: 'Sign event' },
  nip04Encrypt: { id: 'nsite.prompt.nip04Encrypt', defaultMessage: 'Encrypt message (NIP-04)' },
  nip44Encrypt: { id: 'nsite.prompt.nip44Encrypt', defaultMessage: 'Encrypt message (NIP-44)' },
  readUnknown: { id: 'nsite.prompt.readUnknown', defaultMessage: 'Read your private data' },
  read: { id: 'nsite.prompt.read', defaultMessage: 'Read: {label}' },
  nip04Decrypt: { id: 'nsite.prompt.nip04Decrypt', defaultMessage: 'Decrypt message (NIP-04)' },
  nip44Decrypt: { id: 'nsite.prompt.nip44Decrypt', defaultMessage: 'Decrypt message (NIP-44)' },
  writeRecordDescription: {
    id: 'nsite.prompt.writeRecordDescription',
    defaultMessage: 'This app wants to save this data on your behalf, replacing what is stored there now.',
  },
  signDescription: { id: 'nsite.prompt.signDescription', defaultMessage: 'This app wants to sign a Nostr event on your behalf.' },
  encryptDescription: { id: 'nsite.prompt.encryptDescription', defaultMessage: 'This app wants to encrypt a message using your keys.' },
  readUnknownDescription: {
    id: 'nsite.prompt.readUnknownDescription',
    defaultMessage: 'This app wants to decrypt data that is encrypted to your own key. It could be private lists, app settings, or wallet backups.',
  },
  readRecordDescription: { id: 'nsite.prompt.readRecordDescription', defaultMessage: 'This app wants to read private data stored in this record.' },
  decryptDescription: { id: 'nsite.prompt.decryptDescription', defaultMessage: 'This app wants to decrypt a message using your keys.' },
  walletWrite: { id: 'nsite.prompt.walletWrite', defaultMessage: 'This will replace your Monero wallet backup.' },
  walletRead: { id: 'nsite.prompt.walletRead', defaultMessage: 'This record contains your Monero wallet seed.' },
  settingsWrite: {
    id: 'nsite.prompt.settingsWrite',
    defaultMessage: 'This will replace your Ditto settings, including your relays and content filters.',
  },
  settingsRead: { id: 'nsite.prompt.settingsRead', defaultMessage: 'This record contains your Ditto settings.' },
  rememberSession: { id: 'nsite.prompt.rememberSession', defaultMessage: 'Remember until this app is closed' },
  rememberSite: { id: 'nsite.prompt.rememberSite', defaultMessage: 'Remember for this site' },
});

function getPromptTitle(prompt: NsitePromptState, intl: IntlShape): string {
  const { type, kind, record } = prompt;
  switch (type) {
    case 'signEvent':
      if (record && record !== 'unknown') return intl.formatMessage(messages.write, { label: formatNsiteRecord(record, intl) });
      return kind !== null
        ? intl.formatMessage(messages.signKind, { label: getKindLabel(kind) })
        : intl.formatMessage(messages.signEvent);
    case 'nip04.encrypt':
      return intl.formatMessage(messages.nip04Encrypt);
    case 'nip44.encrypt':
      return intl.formatMessage(messages.nip44Encrypt);
    case 'nip04.decrypt':
    case 'nip44.decrypt':
      if (record === 'unknown') return intl.formatMessage(messages.readUnknown);
      if (record) return intl.formatMessage(messages.read, { label: formatNsiteRecord(record, intl) });
      return intl.formatMessage(type === 'nip04.decrypt' ? messages.nip04Decrypt : messages.nip44Decrypt);
  }
}

function getPromptDescription(prompt: NsitePromptState, intl: IntlShape): string {
  const { type, record } = prompt;
  switch (type) {
    case 'signEvent':
      return intl.formatMessage(record && record !== 'unknown' ? messages.writeRecordDescription : messages.signDescription);
    case 'nip04.encrypt':
    case 'nip44.encrypt':
      return intl.formatMessage(messages.encryptDescription);
    case 'nip04.decrypt':
    case 'nip44.decrypt':
      if (record === 'unknown') return intl.formatMessage(messages.readUnknownDescription);
      return intl.formatMessage(record ? messages.readRecordDescription : messages.decryptDescription);
  }
}

/** Warning for records holding key material or settings, or null. */
function getSensitiveWarning(prompt: NsitePromptState, intl: IntlShape): string | null {
  const { type, record } = prompt;
  if (!record || record === 'unknown' || !record.sensitive) return null;
  const write = type === 'signEvent';
  if (record.type === 'settings') return intl.formatMessage(write ? messages.settingsWrite : messages.settingsRead);
  return intl.formatMessage(write ? messages.walletWrite : messages.walletRead);
}

/** Truncate a string to a maximum character length. */
function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + '\u2026';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Overlay prompt shown when an nsite requests a signer operation that requires
 * user approval. Renders on top of the nsite iframe within the preview panel.
 */
export function NsitePermissionPrompt({
  appPicture,
  appName,
  siteUrl,
  prompt,
  onResolve,
}: NsitePermissionPromptProps) {
  const intl = useIntl();
  const [remember, setRemember] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const canRemember = prompt.rememberMode !== 'never';
  const handleAllow = () => onResolve({ allowed: true, remember: canRemember && remember });
  const handleDeny = () => onResolve({ allowed: false, remember: canRemember && remember });

  const icon = getPromptIcon(prompt.type);
  const title = getPromptTitle(prompt, intl);
  const description = getPromptDescription(prompt, intl);
  const warning = getSensitiveWarning(prompt, intl);

  // For signEvent, show a preview of the event content.
  const eventContent = prompt.event?.content as string | undefined;
  const eventJson = prompt.event ? JSON.stringify(prompt.event, null, 2) : null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <div className="flex items-center justify-center size-10 rounded-full bg-muted">
            <ExternalFavicon
              url={siteUrl}
              size={22}
              fallback={<ShieldAlert className="size-5 text-muted-foreground" />}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{appName}</p>
            <p className="text-xs text-muted-foreground">
              <FormattedMessage id="nsite.prompt.header" defaultMessage="Permission request" />
            </p>
          </div>
          {appPicture && (
            <img
              src={appPicture}
              alt={appName}
              className="size-8 rounded-md object-cover shrink-0"
              decoding="async"
            />
          )}
        </div>

        {/* Body */}
        <div className="px-5 pb-4 space-y-3">
          {/* Operation */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <div className="shrink-0 mt-0.5">{icon}</div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
          </div>

          {/* Key-material warning */}
          {warning && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
              <AlertTriangle className="size-4 shrink-0 mt-0.5 text-destructive" />
              <p className="text-xs text-destructive">{warning}</p>
            </div>
          )}

          {/* Event content preview (signEvent only) */}
          {prompt.type === 'signEvent' && eventContent && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground mb-1">
                <FormattedMessage id="nsite.prompt.content" defaultMessage="Content" />
              </p>
              <p className="text-sm break-words whitespace-pre-wrap">
                {truncate(eventContent, 280)}
              </p>
            </div>
          )}

          {/* Raw event details (collapsible) */}
          {eventJson && (
            <Collapsible open={showDetails} onOpenChange={setShowDetails}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showDetails
                    ? <FormattedMessage id="nsite.prompt.hideDetails" defaultMessage="Hide details" />
                    : <FormattedMessage id="nsite.prompt.showDetails" defaultMessage="Show details" />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-2 rounded-lg border bg-muted/30 p-3 text-xs font-mono max-h-40 overflow-auto whitespace-pre-wrap break-all">
                  {eventJson}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Remember checkbox */}
          {canRemember && (
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="nsite-remember"
                checked={remember}
                onCheckedChange={(checked) => setRemember(checked === true)}
              />
              <Label
                htmlFor="nsite-remember"
                className="text-xs text-muted-foreground cursor-pointer select-none"
              >
                {intl.formatMessage(prompt.rememberMode === 'session' ? messages.rememberSession : messages.rememberSite)}
              </Label>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-5 pb-5">
          <Button
            variant="outline"
            className="flex-1 gap-1.5"
            onClick={handleDeny}
          >
            <X className="size-3.5" />
            <FormattedMessage id="nsite.prompt.deny" defaultMessage="Deny" />
          </Button>
          <Button
            className="flex-1 gap-1.5"
            onClick={handleAllow}
          >
            <Check className="size-3.5" />
            <FormattedMessage id="nsite.prompt.allow" defaultMessage="Allow" />
          </Button>
        </div>
      </div>
    </div>
  );
}
