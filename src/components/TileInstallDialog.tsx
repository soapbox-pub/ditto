import { useEffect, useMemo, useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import type { Capability } from '@soapbox.pub/nostr-canvas';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCanvasTileInstallations } from '@/components/CanvasTileInstallationsProvider';
import { useAuthor } from '@/hooks/useAuthor';
import { canUseCanvasTiles } from '@/lib/canvasPlatform';
import { ALWAYS_PROMPT_CAPABILITIES } from '@/tiles/installations';
import { CAPABILITY_DESCRIPTIONS } from '@/tiles/capabilities';
import { tryNpubEncode } from '@/lib/safeNip19';
import type { TileDefinition } from '@/tiles/definition';

interface TileInstallDialogProps {
  tile: TileDefinition | undefined;
  tileEvent: NostrEvent | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TileInstallDialog({ tile, tileEvent, open, onOpenChange }: TileInstallDialogProps) {
  const installations = useCanvasTileInstallations();
  const [approvedPermissions, setApprovedPermissions] = useState<Capability[]>([]);

  // Reset permissions whenever the dialog opens so approvals don't leak between tiles.
  useEffect(() => {
    if (open) setApprovedPermissions([]);
  }, [open, tile?.id]);

  const mobile = !canUseCanvasTiles();

  const install = () => {
    if (!tileEvent || !tile) return;
    const grants = approvedPermissions.filter(
      (permission) => tile.perms.includes(permission) && !ALWAYS_PROMPT_CAPABILITIES.has(permission),
    );
    installations.install(tileEvent, grants);
    onOpenChange(false);
  };

  const authorNpub = tryNpubEncode(tile?.pubkey);
  const author = useAuthor(tile?.pubkey);

  const authorLabel = useMemo(() => {
    if (author.data?.metadata?.name) {
      const name = author.data.metadata.name;
      return name.startsWith('@') ? name : `@${name}`;
    }
    if (author.data?.metadata?.nip05) return author.data.metadata.nip05;
    if (authorNpub) return `${authorNpub.slice(0, 12)}…${authorNpub.slice(-6)}`;
    return undefined;
  }, [author.data?.metadata?.name, author.data?.metadata?.nip05, authorNpub]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {mobile ? (
          <>
            <DialogHeader>
              <DialogTitle>Widgets are coming soon</DialogTitle>
              <DialogDescription>
                Installing and running widgets is not available in the Ditto mobile apps yet. You can browse widgets here and install them from a web browser.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Install {tile?.name}</DialogTitle>
              <DialogDescription className="break-all">
                Review the capabilities requested by {tile?.identifier}
                {authorLabel && <> by <span title={authorNpub ?? undefined}>{authorLabel}</span></>}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {tile?.perms.length ? tile.perms.map((permission) => {
                const alwaysAsks = ALWAYS_PROMPT_CAPABILITIES.has(permission);
                if (alwaysAsks) {
                  return (
                    <div key={permission} className="text-sm">
                      <div className="flex items-center gap-3">
                        <span>{permission}</span>
                        <span className="text-xs text-muted-foreground">Always asks</span>
                      </div>
                      {CAPABILITY_DESCRIPTIONS[permission] && (
                        <p className="mt-1 text-xs text-muted-foreground">{CAPABILITY_DESCRIPTIONS[permission]}</p>
                      )}
                    </div>
                  );
                }
                const id = `tile-install-permission-${permission}`;
                return (
                  <label key={permission} htmlFor={id} className="flex items-start gap-3 text-sm">
                    <Checkbox
                      id={id}
                      checked={approvedPermissions.includes(permission)}
                      onCheckedChange={(checked) =>
                        setApprovedPermissions((current) =>
                          checked ? [...current, permission] : current.filter((item) => item !== permission),
                        )
                      }
                      className="mt-0.5"
                    />
                    <div>
                      <span>{permission}</span>
                      {CAPABILITY_DESCRIPTIONS[permission] && (
                        <p className="text-xs text-muted-foreground">{CAPABILITY_DESCRIPTIONS[permission]}</p>
                      )}
                    </div>
                  </label>
                );
              }) : <p className="text-sm text-muted-foreground">This widget does not request any capabilities.</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={install}>Install</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}