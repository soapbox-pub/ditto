import { Globe } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';

import { NsitePreviewDialog } from '@/components/NsitePreviewDialog';
import { Button } from '@/components/ui/button';
import { useAddrEvent } from '@/hooks/useEvent';

interface ProfileNsiteButtonProps {
  /** Hex pubkey of the profile being viewed. */
  pubkey: string | undefined;
  /** Name to fall back on when the site manifest has no `title` tag. */
  displayName: string;
}

/**
 * Renders a button to open the profile owner's NIP-5A root site (kind 15128)
 * in the in-app nsite viewer. Renders nothing when they haven't published one.
 */
export function ProfileNsiteButton({ pubkey, displayName }: ProfileNsiteButtonProps) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);

  // Root sites are replaceable, not addressable — kind + author identifies
  // them, and the empty identifier is ignored for non-addressable kinds.
  const addr = useMemo(
    () => (pubkey ? { kind: 15128, pubkey, identifier: '' } : undefined),
    [pubkey],
  );
  const { data: event } = useAddrEvent(addr);

  // A manifest without `path` tags maps no files, so there's nothing to serve.
  const hasFiles = !!event?.tags.some(([name]) => name === 'path');

  if (!event || !hasFiles) return null;

  const title = event.tags.find(([name]) => name === 'title')?.[1];
  const appName = title || intl.formatMessage(
    { id: 'profile.nsite.fallbackName', defaultMessage: "{name}'s site" },
    { name: displayName },
  );
  const label = intl.formatMessage({ id: 'profile.nsite.view', defaultMessage: 'View website' });

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        className="rounded-full size-10"
        title={label}
        aria-label={label}
        onClick={() => setOpen(true)}
      >
        <Globe className="size-5" />
      </Button>

      <NsitePreviewDialog
        event={event}
        appName={appName}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
