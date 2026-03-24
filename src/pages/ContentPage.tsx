import { useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { RotateCcw } from 'lucide-react';
import { MuteSettingsInternals, SensitiveContentSection, ThemePreferencesSection } from '@/components/ContentSettings';
import { MuteListRecoveryDialog } from '@/components/MuteListRecoveryDialog';
import { PageHeader } from '@/components/PageHeader';
import { IntroImage } from '@/components/IntroImage';
import { HelpTip } from '@/components/HelpTip';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function ContentPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const [recoveryOpen, setRecoveryOpen] = useState(false);

  useSeoMeta({
    title: `Content | Settings | ${config.appName}`,
    description: 'Muted users, hashtags, and sensitive content settings',
  });

  return (
    <main className="">
      {/* Header with back link */}
      <PageHeader
        backTo="/settings"
        alwaysShowBack
        titleContent={
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold">Content</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Control what you see. Mute users, hashtags, or words, and choose how content warnings are handled. Mutes are encrypted and private.
            </p>
          </div>
        }
      />

      {/* Lead image — Muted Content */}
      <div className="flex items-center gap-4 px-7 py-5">
        <IntroImage src="/mute-intro.png" size="w-28" />
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Content Control</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Hide posts from specific users, hashtags, words, or entire threads. All mutes are encrypted and private.
          </p>
        </div>
      </div>

      <div className="p-4 space-y-0">

        {/* Muted Content Section */}
        <div>
          <div className="relative px-3 py-3.5 flex items-center justify-between">
            <h2 className="text-base font-semibold flex items-center gap-1.5">Muted Content <HelpTip faqId="report-content" /></h2>
            {user && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => setRecoveryOpen(true)}
              >
                <RotateCcw className="size-3.5" />
                Recovery
              </Button>
            )}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
          </div>
          <div className="pb-4">
            <MuteSettingsInternals />
          </div>
        </div>

        {user && (
          <MuteListRecoveryDialog
            open={recoveryOpen}
            onOpenChange={setRecoveryOpen}
          />
        )}

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
