import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ContentSettings } from '@/components/ContentSettings';
import { IntroImage } from '@/components/IntroImage';
import { useAppContext } from '@/hooks/useAppContext';

export function ContentSettingsPage() {
  const { config } = useAppContext();

  useSeoMeta({
    title: `Feed | Settings | ${config.appName}`,
    description: 'Choose what appears in your feed and how it is organized',
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
              Choose what appears in your feed and how it is organized
            </p>
          </div>
        </div>
      </div>

      {/* Lead image */}
      <div className="flex items-center gap-4 px-7 py-5">
        <IntroImage src="/feed-intro.png" size="w-28" />
        <div className="min-w-0">
          <h2 className="text-base font-semibold">What You See</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Nostr is full of all kinds of content. Pick what shows up, manage feed tabs, and tune your follows feed exactly how you like it.
          </p>
        </div>
      </div>

      <div className="p-4">
        <ContentSettings />
      </div>
    </main>
  );
}
