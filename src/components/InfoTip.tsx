import { Info } from 'lucide-react';
import { useIntl } from 'react-intl';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface InfoTipProps {
  /** The explanation itself. */
  children: React.ReactNode;
  /**
   * Translated name of the thing being explained, used to build the trigger's
   * accessible name ("More about Full network scan").
   */
  name: string;
  /** Override the icon size class. Defaults to `size-3.5`. */
  iconSize?: string;
  /** Extra classes for the trigger button. */
  className?: string;
}

/**
 * A small (i) icon that opens a popover explaining a nearby control.
 *
 * The counterpart to {@link HelpTip}, which pulls a canned answer out of
 * `helpContent.ts` by FAQ id; this one takes arbitrary content, for one-off
 * explanations that don't belong in the FAQ.
 *
 * Built on Popover rather than Tooltip on purpose. Radix tooltips open on hover
 * and focus but deliberately stay shut on touch, so on a phone — where Ditto
 * ships as a Capacitor app — a tooltip's contents would be unreachable. A
 * popover opens on click, which works with a mouse, a keyboard, and a finger.
 *
 * Keep it a *sibling* of a `<Label htmlFor>` rather than a child: a click
 * anywhere inside a label is forwarded to the labelled control, so nesting the
 * trigger would toggle the switch it is meant to describe.
 */
export function InfoTip({ children, name, iconSize = 'size-3.5', className }: InfoTipProps) {
  const intl = useIntl();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
          aria-label={intl.formatMessage({ id: 'infoTip.label', defaultMessage: 'More about {name}' }, { name })}
        >
          <Info className={iconSize} />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-72 p-3 text-xs leading-relaxed text-foreground/80">
        {children}
      </PopoverContent>
    </Popover>
  );
}
