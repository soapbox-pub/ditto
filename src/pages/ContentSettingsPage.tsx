import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ContentSettings } from '@/components/ContentSettings';
import { HelpTip } from '@/components/HelpTip';
import { useAppContext } from '@/hooks/useAppContext';

export function ContentSettingsPage() {
  const { config } = useAppContext();

  useSeoMeta({
    title: `Home Feed | Settings | ${config.appName}`,
    description: 'Choose what types of posts appear in your home feed',
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
            <h1 className="text-xl font-bold flex items-center gap-1.5">Home Feed <HelpTip faqId="fyp" /></h1>
            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1">
              Nostr supports many content types beyond text posts. Customize which appear in your home feed. <HelpTip faqId="what-is-nostr" iconSize="size-3.5" />
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
