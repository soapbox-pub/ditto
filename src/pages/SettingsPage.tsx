import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { MainLayout } from '@/components/MainLayout';
import { EditProfileForm } from '@/components/EditProfileForm';
import { RelayListManager } from '@/components/RelayListManager';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { cn } from '@/lib/utils';

export function SettingsPage() {
  const { section } = useParams<{ section?: string }>();
  const { user } = useCurrentUser();

  useSeoMeta({
    title: 'Settings | Mew',
    description: 'Manage your Mew settings',
  });

  const activeSection = section || 'profile';

  return (
    <MainLayout hideMobileTopBar>
      <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-x border-border min-h-screen">
        <div className="flex items-center gap-4 px-4 py-3 sticky top-0 bg-background/80 backdrop-blur-md z-10 border-b border-border">
          <Link to="/" className="p-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-xl font-bold">Settings</h1>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-border">
          <SettingsTab to="/settings/profile" label="Profile" active={activeSection === 'profile'} />
          <SettingsTab to="/settings/relays" label="Relays" active={activeSection === 'relays'} />
        </div>

        <div className="p-4">
          {!user ? (
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
