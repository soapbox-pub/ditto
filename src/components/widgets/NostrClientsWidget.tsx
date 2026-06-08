import { ClientUsersChart } from '@/components/ClientUsersChart';

/** "Nostr Clients" widget for the right sidebar: distinct authors per client. */
export function NostrClientsWidget() {
  return (
    <div className="p-1">
      <ClientUsersChart bare />
    </div>
  );
}

export default NostrClientsWidget;
