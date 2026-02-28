import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, ChevronRight, Scroll } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { IntroImage } from '@/components/IntroImage';
import { useLayoutOptions } from '@/contexts/LayoutContext';

export interface SettingsSection {
  id: string;
  label: string;
  description: string;
  illustration?: string;
  path: string;
  requiresAuth?: boolean;
}

export const settingsSections: SettingsSection[] = [
  {
    id: 'profile',
    label: 'Profile',
    description: 'Edit your display name, bio, and avatar',
    illustration: '/profile-intro.png',
    path: '/settings/profile',
    requiresAuth: true,
  },
  {
    id: 'theme',
    label: 'Vibe',
    description: 'Choose a theme for the interface',
    illustration: '/theme-intro.png',
    path: '/settings/theme',
  },
  {
    id: 'content',
    label: 'Content',
    description: 'Manage your feed and content preferences',
    illustration: '/community-intro.png',
    path: '/settings/content',
  },
  {
    id: 'network',
    label: 'Network',
    description: 'Relays and file upload servers',
    illustration: '/relay-intro.png',
    path: '/settings/network',
    requiresAuth: true,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'Configure push notification preferences',
    illustration: '/notification-intro.png',
    path: '/settings/notifications',
    requiresAuth: true,
  },
  {
    id: 'advanced',
    label: 'Advanced',
    description: 'Wallet, system, and power user settings',
    illustration: '/advanced-intro.png',
    path: '/settings/advanced',
  },
];

export function SettingsPage() {
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  useLayoutOptions({ noBottomSpacer: true });

  useSeoMeta({
    title: 'Settings | Ditto',
    description: 'Manage your Ditto settings',
  });

  const visibleSections = settingsSections.filter(
    (section) => !section.requiresAuth || user,
  );

  return (
    <main
      className="relative min-h-screen isolate pb-16 sidebar:pb-0"
      style={{ background: 'radial-gradient(ellipse 100% 300px at 50% 0%, hsl(var(--primary) / 0.06), transparent), radial-gradient(ellipse 100% 300px at 50% 100%, hsl(var(--primary) / 0.06), transparent)' }}
    >
      {/* Page header */}
      <div className="flex items-center gap-4 px-4 pt-4 pb-5">
        <Link to="/" className="p-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-2">
          <Scroll className="size-5" />
          <h1 className="text-xl font-bold">Settings</h1>
        </div>
      </div>

      {/* Codex heading + exposition */}
      <div className="px-7 pb-4 pt-4 text-center space-y-2.5">
        <p className="text-xs text-muted-foreground leading-relaxed select-none">
          Shape your identity, tune your feed, and manage how you connect to the Nostr network.<br />Everything you need to make this place feel like yours.
        </p>
        <p className="text-[10px] tracking-[0.5em] uppercase text-primary/60 select-none pt-6">Codex of Configuration</p>
      </div>

      {/* Tome ornament */}
      <div className="flex items-center gap-3 px-6 pb-5">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/40 to-primary/60" />
        <span className="text-primary/50 text-xs tracking-[0.3em] select-none">✦</span>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent via-primary/40 to-primary/60" />
      </div>

      {/* Settings menu */}
      <div className="px-4">
        {visibleSections.map((section, i) => {
          return (
            <div key={section.id}>
              <div
                className="flex items-center gap-4 px-3 py-2 my-1 cursor-pointer rounded-xl transition-colors hover:bg-muted/60 active:bg-muted/80 group"
                onClick={() => navigate(section.path)}
              >
                <div className="flex items-center justify-center size-20 shrink-0">
                  {section.illustration && (
                    <IntroImage src={section.illustration} size="w-22" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{section.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {section.description}
                  </p>
                </div>
                <ChevronRight className="size-4 text-primary/40 shrink-0 group-hover:text-primary/70 transition-colors" />
              </div>
              {i < visibleSections.length - 1 && (
                <div className="mx-6 h-px bg-primary/10" />
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom ornament */}
      <div className="flex items-center gap-3 px-6 pt-4 pb-6">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/20 to-primary/30" />
        <span className="text-primary/30 text-[10px] tracking-[0.4em] select-none">◆</span>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent via-primary/20 to-primary/30" />
      </div>
    </main>
  );
}
