import { Loader2 } from 'lucide-react';

interface SaveDestinationRowProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
}

/** A single row in the save-feed popover (Home feed / Profile tab / Share). */
export function SaveDestinationRow({
  icon, label, description, onClick, disabled, loading,
}: SaveDestinationRowProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/60 disabled:opacity-40 disabled:pointer-events-none transition-colors text-left"
    >
      <span className="shrink-0">{loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}
