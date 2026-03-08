import { useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { MuteSettingsInternals, SensitiveContentSection, ThemePreferencesSection } from '@/components/ContentSettings';
import { useAppContext } from '@/hooks/useAppContext';

export function ContentPage() {
  const { config } = useAppContext();
  const [mutesOpen, setMutesOpen] = useState(true);
  const [sensitiveOpen, setSensitiveOpen] = useState(false);
  const [themePrefsOpen, setThemePrefsOpen] = useState(false);

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
          <Collapsible open={mutesOpen} onOpenChange={setMutesOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
              >
                <span className="text-base font-semibold">Muted Content</span>
                {mutesOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="pb-4">
                <MuteSettingsInternals />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Sensitive Content Section */}
        <div>
          <Collapsible open={sensitiveOpen} onOpenChange={setSensitiveOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
              >
                <span className="text-base font-semibold">Sensitive Content</span>
                {sensitiveOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="pb-4">
                <SensitiveContentSection />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Theme Preferences Section */}
        <div>
          <Collapsible open={themePrefsOpen} onOpenChange={setThemePrefsOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
              >
                <span className="text-base font-semibold">Theme Preferences</span>
                {themePrefsOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-3 py-4">
                <ThemePreferencesSection />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

      </div>
    </main>
  );
}
