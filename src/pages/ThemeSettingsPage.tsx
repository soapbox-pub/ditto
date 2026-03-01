import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ThemeSelector } from '@/components/ThemeSelector';
import { useAppContext } from '@/hooks/useAppContext';

export function ThemeSettingsPage() {
  const { config } = useAppContext();

  useSeoMeta({
    title: `Vibe | Settings | ${config.appName}`,
    description: 'Choose a theme for the interface',
  });

  return (
    <main className="min-h-screen">
      {/* Header with back link */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-4">
          <Link to="/settings" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Vibe</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Choose a theme for the interface
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        <ThemeSelector />
      </div>
    </main>
  );
}
