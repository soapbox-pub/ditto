import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeSelector } from '@/components/ThemeSelector';
import { ContentSettings } from '@/components/ContentSettings';
import { cn, STICKY_HEADER_CLASS } from '@/lib/utils';

type AppearanceTab = 'theme' | 'content';

export function AppearanceSettings() {
  const { tab } = useParams<{ tab?: string }>();
  const activeTab: AppearanceTab = tab === 'content' ? 'content' : 'theme';

  useSeoMeta({
    title: 'Appearance | Settings | Ditto',
    description: 'Customize your display preferences and content settings',
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
            <h1 className="text-xl font-bold">Appearance</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Theme, display preferences, and content settings
            </p>
          </div>
        </div>
      </div>

      {/* Sub-section tabs */}
      <div className={cn(STICKY_HEADER_CLASS, 'flex border-b border-border bg-background/80 backdrop-blur-md z-10')}>
        <AppearanceTabLink to="/settings/appearance" label="Theme" active={activeTab === 'theme'} />
        <AppearanceTabLink to="/settings/appearance/content" label="Content" active={activeTab === 'content'} />
      </div>

      {/* Content */}
      <div className="p-4">
        {activeTab === 'theme' ? (
          <div className="space-y-6">
            {/* Theme selector */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Theme</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Choose a theme for the interface
                </p>
              </CardHeader>
              <CardContent>
                <ThemeSelector />
              </CardContent>
            </Card>
          </div>
        ) : (
          <ContentSettings />
        )}
      </div>
    </main>
  );
}

function AppearanceTabLink({ to, label, active }: { to: string; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        'flex-1 py-3.5 text-center text-sm font-medium transition-colors relative hover:bg-secondary/40',
        active ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {label}
      {active && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-primary rounded-full" />
      )}
    </Link>
  );
}
