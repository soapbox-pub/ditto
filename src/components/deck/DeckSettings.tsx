import { lazy, Suspense, useState, useCallback, useMemo } from 'react';
import { ArrowLeft, ChevronRight, Settings } from 'lucide-react';
import { IntroImage } from '@/components/IntroImage';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';

// Lazy-load settings sub-pages
const ProfileSettings = lazy(() => import('@/pages/ProfileSettings').then((m) => ({ default: m.ProfileSettings })));
const ThemeSettingsPage = lazy(() => import('@/pages/ThemeSettingsPage').then((m) => ({ default: m.ThemeSettingsPage })));
const ContentSettingsPage = lazy(() => import('@/pages/ContentSettingsPage').then((m) => ({ default: m.ContentSettingsPage })));
const NetworkSettingsPage = lazy(() => import('@/pages/NetworkSettingsPage').then((m) => ({ default: m.NetworkSettingsPage })));
const NotificationSettings = lazy(() => import('@/pages/NotificationSettings').then((m) => ({ default: m.NotificationSettings })));
const AdvancedSettingsPage = lazy(() => import('@/pages/AdvancedSettingsPage').then((m) => ({ default: m.AdvancedSettingsPage })));
const MagicSettingsPage = lazy(() => import('@/pages/MagicSettingsPage').then((m) => ({ default: m.MagicSettingsPage })));

interface SettingsSection {
  id: string;
  label: string;
  description: string;
  illustration?: string;
  requiresAuth?: boolean;
}

const sections: SettingsSection[] = [
  { id: 'profile', label: 'Profile', description: 'Edit your display name, bio, and avatar', illustration: '/profile-intro.png', requiresAuth: true },
  { id: 'theme', label: 'Vibe', description: 'Choose a theme for the interface', illustration: '/theme-intro.png' },
  { id: 'content', label: 'Content', description: 'Manage your feed and content preferences', illustration: '/community-intro.png' },
  { id: 'network', label: 'Network', description: 'Relays and file upload servers', illustration: '/relay-intro.png', requiresAuth: true },
  { id: 'notifications', label: 'Notifications', description: 'Configure push notification preferences', illustration: '/notification-intro.png', requiresAuth: true },
  { id: 'advanced', label: 'Advanced', description: 'Wallet, system, and power user settings', illustration: '/advanced-intro.png' },
  { id: 'magic', label: 'Magic', description: 'Enchanted cursor effects and mystical interface powers', illustration: '/magic-intro.png' },
];

function SubPageFallback() {
  return <div className="p-4"><Skeleton className="h-32 w-full" /></div>;
}

/** Standalone settings for use inside a deck column — manages its own sub-page state instead of using react-router. */
export function DeckSettings({ initialSection }: { initialSection?: string }) {
  const [activeSection, setActiveSection] = useState<string | null>(initialSection ?? null);
  const { user } = useCurrentUser();
  const { config } = useAppContext();

  const visibleSections = useMemo(
    () => sections.filter((s) => (!s.requiresAuth || user) && (s.id !== 'magic' || config.magicMouse)),
    [user, config.magicMouse],
  );

  const goBack = useCallback(() => setActiveSection(null), []);

  // Sub-page rendering
  if (activeSection) {
    return (
      <div>
        <div className="flex items-center gap-2 px-4 pt-4 pb-3">
          <button onClick={goBack} className="p-2 rounded-full hover:bg-secondary transition-colors" aria-label="Back to settings">
            <ArrowLeft className="size-5" />
          </button>
          <span className="font-semibold text-sm">
            {sections.find((s) => s.id === activeSection)?.label ?? 'Settings'}
          </span>
        </div>
        <Suspense fallback={<SubPageFallback />}>
          {activeSection === 'profile' && <ProfileSettings />}
          {activeSection === 'theme' && <ThemeSettingsPage />}
          {activeSection === 'content' && <ContentSettingsPage />}
          {activeSection === 'network' && <NetworkSettingsPage />}
          {activeSection === 'notifications' && <NotificationSettings />}
          {activeSection === 'advanced' && <AdvancedSettingsPage />}
          {activeSection === 'magic' && <MagicSettingsPage />}
        </Suspense>
      </div>
    );
  }

  // Main settings menu
  return (
    <main className="relative min-h-0">
      <div className="flex items-center gap-2 px-4 pt-4 pb-5">
        <Settings className="size-5" />
        <h1 className="text-xl font-bold">Settings</h1>
      </div>

      <div className="px-7 pb-4 text-center space-y-2.5">
        <p className="text-xs text-muted-foreground leading-relaxed select-none">
          Shape your identity, tune your feed, and manage how you connect to the Nostr network.
        </p>
      </div>

      <div className="flex items-center gap-3 px-6 pb-5">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/40 to-primary/60" />
        <span className="text-primary/50 text-xs tracking-[0.3em] select-none">&#x2726;</span>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent via-primary/40 to-primary/60" />
      </div>

      <div className="px-4">
        {visibleSections.map((section, i) => (
          <div key={section.id}>
            <div
              className="flex items-center gap-4 px-3 py-2 my-1 cursor-pointer rounded-xl transition-colors hover:bg-muted/60 active:bg-muted/80 group"
              onClick={() => setActiveSection(section.id)}
            >
              <div className="flex items-center justify-center size-20 shrink-0">
                {section.illustration && <IntroImage src={section.illustration} size="w-22" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{section.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
              </div>
              <ChevronRight className="size-4 text-primary/40 shrink-0 group-hover:text-primary/70 transition-colors" strokeWidth={4} />
            </div>
            {i < visibleSections.length - 1 && <div className="mx-6 h-px bg-primary/10" />}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 px-6 pt-4 pb-2">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/20 to-primary/30" />
        <span className="text-primary/30 text-[10px] tracking-[0.4em] select-none">&#x25C6;</span>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent via-primary/20 to-primary/30" />
      </div>
    </main>
  );
}
