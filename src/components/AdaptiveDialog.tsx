import { createContext, useContext, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';

/** Whether the surrounding AdaptiveDialog is showing as a bottom sheet. */
const AsSheetContext = createContext(false);

interface AdaptiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

/**
 * A dialog on wide screens and a bottom sheet on phones, which the finger can
 * drag down to dismiss (vaul), like a native action sheet. Phones are the
 * same width the mobile chrome uses (below the `sidebar` breakpoint).
 *
 * Built like `Dialog`: put an {@link AdaptiveDialogContent} inside, with an
 * {@link AdaptiveDialogTitle} (and optionally {@link AdaptiveDialogDescription}).
 */
export function AdaptiveDialog({ open, onOpenChange, children }: AdaptiveDialogProps) {
  const asSheet = useMediaQuery('(max-width: 899px)');

  return (
    <AsSheetContext.Provider value={asSheet}>
      {asSheet ? (
        <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
          {children}
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={onOpenChange}>
          {children}
        </Dialog>
      )}
    </AsSheetContext.Provider>
  );
}

interface AdaptiveDialogContentProps extends Omit<ComponentPropsWithoutRef<typeof DialogContent>, 'className'> {
  /** Classes for the centered dialog (wide screens). */
  className?: string;
  /** Classes for the sheet's body (phones), a scrolling flex column. */
  sheetClassName?: string;
}

export function AdaptiveDialogContent({ className, sheetClassName, children, ...props }: AdaptiveDialogContentProps) {
  const asSheet = useContext(AsSheetContext);

  if (asSheet) {
    return (
      <DrawerContent className="max-h-[90dvh] border-border-subtle safe-area-bottom" {...props}>
        <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain', sheetClassName)}>
          {children}
        </div>
      </DrawerContent>
    );
  }

  return (
    <DialogContent className={className} {...props}>
      {children}
    </DialogContent>
  );
}

export function AdaptiveDialogTitle(props: ComponentPropsWithoutRef<typeof DialogTitle>) {
  const Title = useContext(AsSheetContext) ? DrawerTitle : DialogTitle;
  return <Title {...props} />;
}

export function AdaptiveDialogDescription(props: ComponentPropsWithoutRef<typeof DialogDescription>) {
  const Description = useContext(AsSheetContext) ? DrawerDescription : DialogDescription;
  return <Description {...props} />;
}
