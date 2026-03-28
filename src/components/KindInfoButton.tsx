import { ExternalLink, Info } from 'lucide-react';

import type { ExtraKindDef } from '@/lib/extraKinds';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ExternalFavicon } from '@/components/ExternalFavicon';

interface KindInfoButtonProps {
  kindDef: ExtraKindDef;
  icon?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Info button that opens a modal with a blurb and external site links for an extra kind. */
export function KindInfoButton({ kindDef, icon, open, onOpenChange }: KindInfoButtonProps) {
  const { label, blurb, sites } = kindDef;

  if (!sites?.length && !blurb) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 rounded-full text-muted-foreground hover:text-foreground">
          <Info className="size-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-xs rounded-xl p-6">
        <div className="flex flex-col items-center text-center gap-4">
          {icon && (
            <div className="text-primary [&>svg]:size-10">
              {icon}
            </div>
          )}

          <DialogTitle className="text-lg">{label}</DialogTitle>

          {blurb && (
            <DialogDescription className="text-sm leading-relaxed">
              {blurb}
            </DialogDescription>
          )}

          {sites && sites.length > 0 && (
            <div className="w-full space-y-1.5 pt-1">
              {sites.map((site) => {
                const hostname = new URL(site.url).hostname;
                const name = site.name ?? hostname.split('.')[0].replace(/^./, (c) => c.toUpperCase());

                return (
                  <a
                    key={site.url}
                    href={site.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    <ExternalFavicon url={site.url} size={16} />
                    {name}
                    <ExternalLink className="size-3.5 opacity-70" />
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
