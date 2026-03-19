import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  /** Page title text. */
  title: string;
  /** Icon rendered before the title. */
  icon?: React.ReactNode;
  /** Where the back arrow navigates to (default: "/"). */
  backTo?: string;
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
export function PageHeader({ title, icon, backTo = '/', alwaysShowBack, children, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-center gap-4 px-4 mt-4 mb-1', className)}>
      <Link
        to={backTo}
        className={cn('p-2 -ml-2 rounded-full hover:bg-secondary transition-colors', !alwaysShowBack && 'sidebar:hidden')}
      >
        <ArrowLeft className="size-5" />
      </Link>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {icon}
        <h1 className="text-xl font-bold">{title}</h1>
      </div>
      {children}
    </div>
  );
}
