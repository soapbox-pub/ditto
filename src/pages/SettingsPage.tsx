import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, Settings as SettingsIcon, VolumeX } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { MainLayout } from '@/components/MainLayout';
import { EditProfileForm } from '@/components/EditProfileForm';
import { RelayListManager } from '@/components/RelayListManager';
import { FeedSettingsForm } from '@/components/FeedSettingsForm';
import { WalletSettings } from '@/components/WalletSettings';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { cn, STICKY_HEADER_CLASS } from '@/lib/utils';

export function SettingsPage() {
  const { section } = useParams<{ section?: string }>();
  const { user } = useCurrentUser();

  useSeoMeta({
    title: 'Settings | Mew',
    description: 'Manage your Mew settings',
  });

  const activeSection = section || 'profile';

  return (
    <MainLayout>
      <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen">
        <div className={cn(STICKY_HEADER_CLASS, 'flex items-center gap-4 px-4 h-20 bg-background/80 backdrop-blur-md z-10')}>
          <Link to="/" className="p-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex items-center gap-2">
            <SettingsIcon className="size-5" />
            <h1 className="text-xl font-bold">Settings</h1>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-border">
          <SettingsTab to="/settings/profile" label="Profile" active={activeSection === 'profile'} />
          <SettingsTab to="/settings/feed" label="Feed" active={activeSection === 'feed'} />
          <SettingsTab to="/settings/mutes" label="Mutes" active={activeSection === 'mutes'} />
          <SettingsTab to="/settings/relays" label="Relays" active={activeSection === 'relays'} />
          <SettingsTab to="/settings/wallet" label="Wallet" active={activeSection === 'wallet'} />
        </div>

        <div className="p-4">
          {activeSection === 'mutes' ? (
            !user ? (
              <p className="text-center text-muted-foreground py-8">Log in to manage your mute list.</p>
            ) : (
              <div className="py-16 text-center space-y-3">
                <VolumeX className="size-10 mx-auto text-muted-foreground/50" />
                <p className="text-muted-foreground">Mute list management coming soon.</p>
              </div>
            )
          ) : activeSection === 'feed' ? (
            <FeedSettingsForm />
          ) : activeSection === 'wallet' ? (
            !user ? (
              <p className="text-center text-muted-foreground py-8">Log in to manage your wallet.</p>
            ) : (
              <WalletSettings />
            )
          ) : !user ? (
            <p className="text-center text-muted-foreground py-8">Log in to manage settings.</p>
          ) : activeSection === 'profile' ? (
            <EditProfileForm />
          ) : activeSection === 'relays' ? (
            <RelayListManager />
          ) : null}
        </div>
      </main>
    </MainLayout>
  );
}

function SettingsTab({ to, label, active }: { to: string; label: string; active: boolean }) {
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
