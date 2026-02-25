import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AdvancedSettings } from '@/components/AdvancedSettings';

export function AdvancedSettingsPage() {
  useSeoMeta({
    title: 'Advanced | Settings | Ditto',
    description: 'Advanced settings for relays, upload servers, and system configuration',
  });

  return (
    <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen">
      {/* Header with back link */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-4">
          <Link to="/settings" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Advanced</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Relays, upload servers, and system settings
            </p>
          </div>
        </div>
      </div>

      <div className="p-4">
        <AdvancedSettings />
      </div>
    </main>
  );
}
