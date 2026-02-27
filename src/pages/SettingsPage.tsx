import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, ChevronRight, Settings as SettingsIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { IntroImage } from '@/components/IntroImage';

export interface SettingsSection {
  id: string;
  label: string;
  description: string;
  illustration?: string;
  icon?: React.ComponentType<{ className?: string }>;
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
    label: 'Theme',
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
    path: '/settings/advanced',
  },
];

export function SettingsPage() {
  const { user } = useCurrentUser();
  const navigate = useNavigate();

  useSeoMeta({
    title: 'Settings | Ditto',
    description: 'Manage your Ditto settings',
  });

  const visibleSections = settingsSections.filter(
    (section) => !section.requiresAuth || user,
  );

  return (
    <main className="min-h-screen">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-4">
          <Link to="/" className="p-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <SettingsIcon className="size-5" />
              <h1 className="text-xl font-bold">Settings</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Customize your experience
            </p>
          </div>
        </div>
      </div>

      {/* Settings menu */}
      <div className="px-4 space-y-2">
        {visibleSections.map((section) => {
          const Icon = section.icon;
          return (
            <div
              key={section.id}
              className="flex items-center gap-4 px-3 py-1 cursor-pointer rounded-xl bg-muted/40 transition-colors hover:bg-muted/60 active:bg-muted/80"
              onClick={() => navigate(section.path)}
            >
              <div className="flex items-center justify-center size-20 shrink-0">
                {section.illustration ? (
                  <IntroImage src={section.illustration} size="w-20" />
                ) : Icon ? (
                  <Icon className="size-12 text-primary opacity-90" />
                ) : null}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{section.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {section.description}
                </p>
              </div>
              <ChevronRight className="size-5 text-muted-foreground shrink-0" />
            </div>
          );
        })}
      </div>
    </main>
  );
}
