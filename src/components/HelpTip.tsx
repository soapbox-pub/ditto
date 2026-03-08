import { HelpCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getFAQItem } from '@/lib/helpContent';

/**
 * Renders **bold** and [text](url) markup in FAQ answer strings.
 */
function renderInlineMarkup(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[1] !== undefined) {
      nodes.push(<strong key={match.index} className="font-semibold text-foreground">{match[1]}</strong>);
    } else if (match[2] !== undefined && match[3] !== undefined) {
      nodes.push(
        <a
          key={match.index}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
        >
          {match[2]}
        </a>,
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface HelpTipProps {
  /** The FAQ item ID from helpContent.ts to display. */
  faqId: string;
  /** Optional override for the icon size class. Defaults to "size-4". */
  iconSize?: string;
  /** Additional class names for the trigger button. */
  className?: string;
}

/**
 * A small (?) icon that opens a popover with a FAQ answer.
 *
 * Pulls content from helpContent.ts by item ID. Includes a link to the
 * full Help page. Designed to be placed inline next to labels and headers
 * in settings pages.
 *
 * @example
 * <label>Relays <HelpTip faqId="what-are-relays" /></label>
 */
export function HelpTip({ faqId, iconSize = 'size-4', className }: HelpTipProps) {
  const item = getFAQItem(faqId);
  if (!item) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className ?? ''}`}
          aria-label={`Help: ${item.question}`}
        >
          <HelpCircle className={iconSize} />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 p-4 space-y-3">
        {/* Question */}
        <p className="text-sm font-semibold leading-snug">{item.question}</p>

        {/* Answer */}
        <div className="text-xs leading-relaxed text-foreground/80 space-y-2">
          {item.answer.map((paragraph, i) => (
            <p key={i}>{renderInlineMarkup(paragraph)}</p>
          ))}
        </div>

        {/* Link to full FAQ */}
        <Link
          to="/help"
          className="block text-xs text-primary hover:text-primary/80 font-medium transition-colors"
        >
          View all FAQs &rarr;
        </Link>
      </PopoverContent>
    </Popover>
  );
}
