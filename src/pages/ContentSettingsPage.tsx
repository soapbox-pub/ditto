import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ContentSettings } from '@/components/ContentSettings';
import { useAppContext } from '@/hooks/useAppContext';

export function ContentSettingsPage() {
  const { config } = useAppContext();

  useSeoMeta({
    title: `Feed | Settings | ${config.appName}`,
    description: 'Manage your feed and content preferences',
  });

  return (
    <main className="">
      {/* Header with back link */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-4">
          <Link to="/settings" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Feed</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage your feed and content preferences
            </p>
          </div>
        </div>
      </div>

      <div className="p-4">
        <ContentSettings />
      </div>
    </main>
  );
}
