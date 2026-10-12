import { ArrowLeft } from 'lucide-react';
import { useIntl } from 'react-intl';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  /** Page title text (ignored when `titleContent` is provided). */
  title?: string;
  /** Icon rendered before the title (ignored when `titleContent` is provided). */
  icon?: React.ReactNode;
  /** Secondary line rendered under the title (ignored when `titleContent` is provided). */
  subtitle?: React.ReactNode;
  /** Fully custom title area — replaces the default icon + h1 when set. */
  titleContent?: React.ReactNode;
  /** Where the back arrow navigates to (default: "/"). Ignored when `onBack` is set. */
  backTo?: string;
  /** Callback for the back button — when set, renders a `<button>` instead of a `<Link>`. */
  onBack?: () => void;
  /** Always show the back button, even on desktop (default: mobile only). */
  alwaysShowBack?: boolean;
  /** Extra elements placed after the title (e.g. KindInfoButton). */
  children?: React.ReactNode;
  /** Override the outer wrapper classes. */
  className?: string;
}

/**
 * Shared page header with back button, icon, and title.
 *
 * Used by kind-feed pages, bookmarks, help, trends, and other sub-pages
 * to provide a consistent header layout.
 */
export function PageHeader({ title, icon, subtitle, titleContent, backTo = '/', onBack, alwaysShowBack, children, className }: PageHeaderProps) {
  const intl = useIntl();
  const backLabel = intl.formatMessage({ id: 'pageHeader.goBack', defaultMessage: 'Go back' });
  const backButtonClass = cn('p-2 -ml-2 rounded-full hover:bg-secondary transition-colors', !alwaysShowBack && 'sidebar:hidden');

  return (
    <div className={cn('flex items-center gap-4 px-4 py-4 bg-background/85', className)}>
      {onBack ? (
        <button onClick={onBack} className={backButtonClass} aria-label={backLabel}>
          <ArrowLeft className="size-5" />
        </button>
      ) : (
        <Link to={backTo} className={backButtonClass} aria-label={backLabel}>
          <ArrowLeft className="size-5" />
        </Link>
      )}
      {titleContent ?? (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {icon}
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground truncate">{subtitle}</p>}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
