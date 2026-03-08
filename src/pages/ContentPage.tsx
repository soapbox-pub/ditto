import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MuteSettingsInternals, SensitiveContentSection, ThemePreferencesSection } from '@/components/ContentSettings';
import { HelpTip } from '@/components/HelpTip';
import { useAppContext } from '@/hooks/useAppContext';

export function ContentPage() {
  const { config } = useAppContext();

  useSeoMeta({
    title: `Content | Settings | ${config.appName}`,
    description: 'Muted users, hashtags, and sensitive content settings',
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
            <h1 className="text-xl font-bold">Content</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Control what you see. Mute users, hashtags, or words, and choose how content warnings are handled. Mutes are encrypted and private.
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-0">

        {/* Muted Content Section */}
        <div>
          <div className="relative px-3 py-3.5">
            <h2 className="text-base font-semibold flex items-center gap-1.5">Muted Content <HelpTip faqId="report-content" /></h2>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
          </div>
          <div className="pb-4">
            <MuteSettingsInternals />
          </div>
        </div>

        {/* Sensitive Content Section */}
        <div>
          <div className="relative px-3 py-3.5">
            <h2 className="text-base font-semibold flex items-center gap-1.5">Sensitive Content <HelpTip faqId="report-content" /></h2>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
          </div>
          <div className="pb-4">
            <SensitiveContentSection />
          </div>
        </div>

        {/* Theme Preferences Section */}
        <div>
          <div className="relative px-3 py-3.5">
            <h2 className="text-base font-semibold">Theme Preferences</h2>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
          </div>
          <div className="px-3 py-4">
            <ThemePreferencesSection />
          </div>
        </div>

      </div>
    </main>
  );
}
