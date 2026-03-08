import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ContentSettings } from '@/components/ContentSettings';
import { useAppContext } from '@/hooks/useAppContext';

export function ContentSettingsPage() {
  const { config } = useAppContext();

  useSeoMeta({
    title: `Feed | Settings | ${config.appName}`,
    description: 'Choose what types of posts appear in your feed',
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
              Nostr supports many content types beyond text posts. Customize which kinds appear in your feed.
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
