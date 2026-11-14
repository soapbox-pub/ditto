import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';

interface AdaptiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible title, read out but not shown. */
  title: ReactNode;
  children: ReactNode;
  /** Classes for the centered dialog (wide screens). */
  className?: string;
  /** Classes for the bottom sheet (phones). */
  sheetClassName?: string;
}

/**
 * A dialog on wide screens and a bottom sheet on phones, which the finger can
 * drag down to dismiss (vaul), like a native action sheet. Phones are the
 * same width the mobile chrome uses (below the `sidebar` breakpoint).
 */
export function AdaptiveDialog({ open, onOpenChange, title, children, className, sheetClassName }: AdaptiveDialogProps) {
  const asSheet = useMediaQuery('(max-width: 899px)');

  if (asSheet) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
        <DrawerContent className={cn('max-h-[90dvh] border-border-subtle', sheetClassName)} aria-describedby={undefined}>
          <DrawerTitle className="sr-only">{title}</DrawerTitle>
          <div className="min-h-0 overflow-y-auto overscroll-contain safe-area-bottom">
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('[&>button]:hidden', className)} aria-describedby={undefined}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}
