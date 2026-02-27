import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, ChevronRight, Server, Wallet } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { AdvancedSettings } from '@/components/AdvancedSettings';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { IntroImage } from '@/components/IntroImage';

const subSections = [
  {
    id: 'network',
    label: 'Network',
    description: 'Relays and file upload servers',
    illustration: '/relay-intro.png',
    path: '/settings/network',
    requiresAuth: true,
  },
  {
    id: 'wallet',
    label: 'Wallet',
    description: 'Manage wallet connections and payments',
    icon: Wallet,
    path: '/settings/wallet',
    requiresAuth: true,
  },
] as const;

export function AdvancedSettingsPage() {
  const { user } = useCurrentUser();
  const navigate = useNavigate();

  useSeoMeta({
    title: 'Advanced | Settings | Ditto',
    description: 'Advanced settings for relays, upload servers, and system configuration',
  });

  const visibleSections = subSections.filter((s) => !s.requiresAuth || user);

  return (
    <main className="min-h-screen">
      {/* Header with back link */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-4">
          <Link to="/settings" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Advanced</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Network, wallet, and system settings
            </p>
          </div>
        </div>
      </div>

      {/* Sub-section links */}
      {visibleSections.length > 0 && (
        <div className="px-4 pb-2 space-y-2">
          {visibleSections.map((section) => {
            const Icon = 'icon' in section ? section.icon : undefined;
            return (
              <div
                key={section.id}
                className="flex items-center gap-4 px-3 py-3 cursor-pointer rounded-xl bg-muted/40 transition-colors hover:bg-muted/60 active:bg-muted/80"
                onClick={() => navigate(section.path)}
              >
                <div className="flex items-center justify-center size-16 shrink-0">
                  {'illustration' in section ? (
                    <IntroImage src={section.illustration} size="w-16" />
                  ) : Icon ? (
                    <Icon className="size-10 text-primary opacity-90" />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{section.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
                </div>
                <ChevronRight className="size-5 text-muted-foreground shrink-0" />
              </div>
            );
          })}
        </div>
      )}

      <div className="p-4">
        <AdvancedSettings />
      </div>
    </main>
  );
}
