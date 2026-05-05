import { useState } from 'react';
import { Check, KeyRound, Lock, Pen, ShieldAlert, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { getKindLabel } from '@/lib/nsitePermissions';
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

function getPromptTitle(type: NsitePromptState['type'], kind: number | null): string {
  switch (type) {
    case 'signEvent':
      return kind !== null
        ? `Sign: ${getKindLabel(kind)}`
        : 'Sign event';
    case 'nip04.encrypt':
      return 'Encrypt message (NIP-04)';
    case 'nip04.decrypt':
      return 'Decrypt message (NIP-04)';
    case 'nip44.encrypt':
      return 'Encrypt message (NIP-44)';
    case 'nip44.decrypt':
      return 'Decrypt message (NIP-44)';
  }
}

function getPromptDescription(type: NsitePromptState['type']): string {
  switch (type) {
    case 'signEvent':
      return 'This app wants to sign a Nostr event on your behalf.';
    case 'nip04.encrypt':
    case 'nip44.encrypt':
      return 'This app wants to encrypt a message using your keys.';
    case 'nip04.decrypt':
    case 'nip44.decrypt':
      return 'This app wants to decrypt a message using your keys.';
  }
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
  const [remember, setRemember] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleAllow = () => onResolve({ allowed: true, remember });
  const handleDeny = () => onResolve({ allowed: false, remember });

  const icon = getPromptIcon(prompt.type);
  const title = getPromptTitle(prompt.type, prompt.kind);
  const description = getPromptDescription(prompt.type);

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
            <p className="text-xs text-muted-foreground">Permission request</p>
          </div>
          {appPicture && (
            <img
              src={appPicture}
              alt={appName}
              className="size-8 rounded-md object-cover shrink-0"
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

          {/* Event content preview (signEvent only) */}
          {prompt.type === 'signEvent' && eventContent && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground mb-1">Content</p>
              <p className="text-sm break-words whitespace-pre-wrap">
                {truncate(eventContent, 280)}
              </p>
            </div>
          )}

          {/* Target pubkey (encrypt/decrypt) */}
          {prompt.targetPubkey && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground mb-1">Target pubkey</p>
              <p className="text-xs font-mono break-all">
                {truncate(prompt.targetPubkey, 64)}
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
                  {showDetails ? 'Hide details' : 'Show details'}
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
              Remember for this site
            </Label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-5 pb-5">
          <Button
            variant="outline"
            className="flex-1 gap-1.5"
            onClick={handleDeny}
          >
            <X className="size-3.5" />
            Deny
          </Button>
          <Button
            className="flex-1 gap-1.5"
            onClick={handleAllow}
          >
            <Check className="size-3.5" />
            Allow
          </Button>
        </div>
      </div>
    </div>
  );
}
