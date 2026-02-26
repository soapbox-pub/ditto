import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, Bell, ChevronRight, Palette, Server, Settings as SettingsIcon, User, Wallet } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export interface SettingsSection {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  requiresAuth?: boolean;
}

export const settingsSections: SettingsSection[] = [
  {
    id: 'profile',
    label: 'Profile',
    description: 'Edit your display name, bio, and avatar',
    icon: User,
    path: '/settings/profile',
    requiresAuth: true,
  },
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'Theme, display preferences, and content settings',
    icon: Palette,
    path: '/settings/appearance',
  },
  {
    id: 'wallet',
    label: 'Wallet',
    description: 'Manage wallet connections and payments',
    icon: Wallet,
    path: '/settings/wallet',
    requiresAuth: true,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'Configure push notification preferences',
    icon: Bell,
    path: '/settings/notifications',
    requiresAuth: true,
  },
  {
    id: 'advanced',
    label: 'Advanced',
    description: 'Relays, upload servers, and system settings',
    icon: Server,
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
      <div className="p-4 space-y-2">
        {visibleSections.map((section) => {
          const Icon = section.icon;
          return (
            <Card
              key={section.id}
              className="cursor-pointer transition-colors hover:bg-muted/40 active:bg-muted/60"
              onClick={() => navigate(section.path)}
            >
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex items-center justify-center size-10 rounded-full bg-secondary shrink-0">
                  <Icon className="size-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{section.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {section.description}
                  </p>
                </div>
                <ChevronRight className="size-5 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
