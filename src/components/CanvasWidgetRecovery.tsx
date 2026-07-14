import { Link } from 'react-router-dom';

/** Recovery state for an installed widget whose definition is still unavailable locally. */
export function CanvasWidgetRecovery() {
  return (
    <div className="flex flex-col items-start gap-2 px-1 py-3">
      <p className="text-xs text-muted-foreground">This installed tile is unavailable on this device.</p>
      <Link to="/tiles" className="text-xs text-primary hover:underline">Browse tiles</Link>
    </div>
  );
}
