import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/MainLayout';
import { cn, STICKY_HEADER_CLASS } from '@/lib/utils';

interface PlaceholderPageProps {
  title: string;
  description?: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  useSeoMeta({
    title: `${title} | Mew`,
    description: description || `${title} page`,
  });

  return (
    <MainLayout>
      <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen">
        <div className={cn(STICKY_HEADER_CLASS, 'flex items-center gap-4 px-4 h-20 bg-background/80 backdrop-blur-md z-10')}>
          <Link to="/" className="p-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-xl font-bold">{title}</h1>
        </div>
        <div className="py-20 text-center">
          <p className="text-muted-foreground text-lg">Coming soon</p>
        </div>
      </main>
    </MainLayout>
  );
}
