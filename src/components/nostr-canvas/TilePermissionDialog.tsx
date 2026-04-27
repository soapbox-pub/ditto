/**
 * Dialog that asks the user whether to grant a tile a capability.
 *
 * Per the nostr-canvas NIP, the client "MUST request approval the first
 * time a tile invokes each capability, clearly identifying the tile by
 * its `d` tag identifier and author." We display the tile identifier,
 * the tile's author profile (kind-0), and a human-readable capability
 * label so the user can make an informed decision.
 *
 * The dialog is a render-only component: the parent component resolves
 * the library's permission-prompt Promise when the user clicks Allow
 * or Deny. Persistence of the decision is handled by the parent via
 * the `createScopedPermissionCache` helper.
 */

import { memo, useMemo } from 'react';
import type { Capability } from '@soapbox.pub/nostr-canvas';
import { Lock, ShieldCheck } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { NSchema as n } from '@nostrify/nostrify';
import type { NostrMetadata } from '@nostrify/nostrify';

import { parseTileIdentifier } from '@/lib/nostr-canvas/identifiers';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

interface TilePermissionDialogProps {
  identifier: string;
  capability: Capability;
  onAllow: () => void;
  onDeny: () => void;
}

const CAPABILITY_LABELS: Record<Capability, string> = {
  'get-pubkey': 'Read your public key',
  'sign-event': 'Sign events on your behalf',
  'publish-event': 'Publish events to Nostr',
  'nip44-encrypt': 'Encrypt messages (NIP-44)',
  'nip44-decrypt': 'Decrypt messages (NIP-44)',
  fetch: 'Make outbound network requests',
  navigate: 'Request navigation to other tiles or events',
  'register-events': 'Render custom event kinds in your feed',
};

const CAPABILITY_WARNINGS: Partial<Record<Capability, string>> = {
  'sign-event':
    'The tile will sign events with your Nostr key. Only grant to authors you trust.',
  'publish-event':
    'The tile can publish events that appear to come from you. Only grant to authors you trust.',
  'nip44-decrypt':
    'The tile can read encrypted messages you have received. Grant with care.',
  fetch:
    'The tile can reach external HTTP services through your CORS proxy.',
};

export const TilePermissionDialog = memo(function TilePermissionDialog({
  identifier,
  capability,
  onAllow,
  onDeny,
}: TilePermissionDialogProps) {
  // Split identifier into NIP-05 prefix + slug for display. A malformed
  // identifier shouldn't reach us, but be defensive.
  const parts = useMemo(() => parseTileIdentifier(identifier), [identifier]);

  const authorProfile = useTileAuthorProfile(parts?.nip05);
  const capabilityLabel =
    CAPABILITY_LABELS[capability] ?? capability;
  const warning = CAPABILITY_WARNINGS[capability];
  const nip05Match =
    authorProfile?.nip05?.toLowerCase() === parts?.nip05?.toLowerCase();

  return (
    <Dialog open onOpenChange={(open) => !open && onDeny()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="size-5 shrink-0" aria-hidden />
            Tile permission request
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2 text-sm">
          <div className="flex items-center gap-3">
            <Avatar className="size-10">
              <AvatarImage
                src={sanitizeUrl(authorProfile?.picture)}
                alt={authorProfile?.name ?? parts?.nip05 ?? 'Tile author'}
              />
              <AvatarFallback>
                {(authorProfile?.name ?? parts?.nip05 ?? '?').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">
                {authorProfile?.display_name ??
                  authorProfile?.name ??
                  parts?.nip05 ??
                  identifier}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="truncate">{identifier}</span>
                {nip05Match && (
                  <ShieldCheck
                    className="size-3.5 shrink-0 text-emerald-500"
                    aria-label="NIP-05 verified"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Permission
            </div>
            <div className="mt-1 text-sm font-medium">{capabilityLabel}</div>
          </div>

          {warning && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {warning}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onDeny}>
            Deny
          </Button>
          <Button onClick={onAllow}>Allow</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

/**
 * Lookup a tile author's kind-0 metadata by NIP-05 address. We could
 * reuse `useAuthor(pubkey)` but the identifier only gives us the NIP-05
 * prefix; resolving it back to a pubkey via NIP-05 HTTPS lookup is out
 * of scope for the permission dialog. Instead we query for a kind-0
 * event with this NIP-05 in its content — best-effort display, no
 * trust implications (the identifier itself is the trust boundary).
 */
function useTileAuthorProfile(
  nip05: string | undefined,
): NostrMetadata | undefined {
  const { nostr } = useNostr();
  const { data } = useQuery({
    queryKey: ['tile-author-by-nip05', nip05 ?? ''],
    enabled: !!nip05,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [0], search: nip05!, limit: 5 }],
        { signal },
      );
      for (const event of events) {
        try {
          const metadata = n.json().pipe(n.metadata()).parse(event.content);
          if (
            metadata.nip05 &&
            metadata.nip05.toLowerCase() === nip05!.toLowerCase()
          ) {
            return metadata;
          }
        } catch {
          // continue
        }
      }
      return null;
    },
  });
  return data ?? undefined;
}
