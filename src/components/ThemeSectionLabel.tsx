import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Heading for a section of a theme editor (Colors, Fonts, Background). */
export function ThemeSectionLabel({ icon: Icon, children, id }: { icon: LucideIcon; children: ReactNode; id?: string }) {
  return (
    <span id={id} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <Icon className="size-3.5" />
      {children}
    </span>
  );
}
