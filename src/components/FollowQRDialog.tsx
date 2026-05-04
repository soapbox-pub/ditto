import { useEffect, useState } from 'react';
import { nip19 } from 'nostr-tools';
import QRCode from 'qrcode';
import { Copy, Check } from 'lucide-react';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useShareOrigin } from '@/hooks/useShareOrigin';
import { genUserName } from '@/lib/genUserName';
import { getThemedQRColors } from '@/lib/qrColors';

interface FollowQRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FollowQRDialog({ open, onOpenChange }: FollowQRDialogProps) {
  const { user } = useCurrentUser();
  const author = useAuthor(user?.pubkey ?? '');
  const shareOrigin = useShareOrigin();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const metadata = author.data?.metadata;
  const displayName = user ? metadata?.name || metadata?.display_name || genUserName(user.pubkey) : '';

  const npub = user ? nip19.npubEncode(user.pubkey) : '';
  const followUrl = npub ? `${shareOrigin}/follow/${npub}` : '';

  useEffect(() => {
    if (!followUrl || !open) return;

    const { dark, light } = getThemedQRColors();

    QRCode.toDataURL(followUrl, {
      width: 400,
      margin: 2,
      color: { dark, light },
      errorCorrectionLevel: 'M',
    })
      .then(setQrDataUrl)
      .catch(console.error);
  }, [followUrl, open]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(followUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-6 flex flex-col items-center gap-5 rounded-2xl">
        <DialogTitle className="sr-only">Share follow link</DialogTitle>

        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-2">
          <Avatar shape={getAvatarShape(metadata)} className="size-16 ring-2 ring-secondary">
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="text-xl font-semibold">
              {displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <p className="text-sm text-muted-foreground text-center">
            Scan to follow <span className="text-foreground font-medium">{displayName}</span>
          </p>
        </div>

        {/* QR code */}
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="Follow QR code"
            className="w-full rounded-xl border border-border"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <div className="w-full aspect-square rounded-xl border border-border bg-muted animate-pulse" />
        )}

        {/* Copy link */}
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied
            ? <Check className="size-3.5 text-primary flex-shrink-0" />
            : <Copy className="size-3.5 flex-shrink-0" />}
          <span className="truncate max-w-64">{followUrl}</span>
        </button>
      </DialogContent>
    </Dialog>
  );
}
