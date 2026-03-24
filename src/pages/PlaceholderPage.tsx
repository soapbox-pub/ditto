import { useSeoMeta } from '@unhead/react';
import { PageHeader } from '@/components/PageHeader';
import { useAppContext } from '@/hooks/useAppContext';

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
      <PageHeader title={title} icon={icon} backTo="/" />
      <div className="py-20 text-center">
        <p className="text-muted-foreground text-lg">Coming soon</p>
      </div>
    </main>
  );
}
