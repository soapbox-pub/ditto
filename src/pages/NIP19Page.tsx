import { nip19 } from 'nostr-tools';
import { useParams, Navigate } from 'react-router-dom';
import NotFound from './NotFound';

export function NIP19Page() {
  const { nip19: identifier } = useParams<{ nip19: string }>();

  if (!identifier) {
    return <NotFound />;
  }

  let decoded;
  try {
    decoded = nip19.decode(identifier);
  } catch {
    return <NotFound />;
  }

  const { type } = decoded;

  switch (type) {
    case 'npub':
    case 'nprofile':
      // Redirect to profile page
      return <Navigate to={`/u/${identifier}`} replace />;

    case 'note':
      // Note view placeholder  
      return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Note view coming soon</div>;

    case 'nevent':
      return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Event view coming soon</div>;

    case 'naddr':
      return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Addressable event view coming soon</div>;

    default:
      return <NotFound />;
  }
}
