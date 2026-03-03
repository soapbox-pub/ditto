import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppContext } from '@/hooks/useAppContext';
import { cn } from '@/lib/utils';

interface PlaceholderPageProps {
  title: string;
  icon?: React.ReactNode;
  description?: string;
}

export function PlaceholderPage({ title, icon, description }: PlaceholderPageProps) {
  const { config } = useAppContext();

  useSeoMeta({
    title: `${title} | ${config.appName}`,
    description: description || `${title} page`,
  });

  return (
    <main className="">
      <div className={cn('sidebar:sticky sidebar:top-0', 'flex items-center gap-4 px-4 pt-4 pb-5 bg-background/80 backdrop-blur-md z-10')}>
        <Link to="/" className="p-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-2">
          {icon}
          <h1 className="text-xl font-bold">{title}</h1>
        </div>
      </div>
      <div className="py-20 text-center">
        <p className="text-muted-foreground text-lg">Coming soon</p>
      </div>
    </main>
  );
}
