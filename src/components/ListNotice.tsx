import type { ReactNode } from 'react';

/** A note above a list, with an optional action. */
export function ListNotice({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 sm:flex-row sm:items-center">
      <p className="flex-1 text-xs leading-relaxed text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}
