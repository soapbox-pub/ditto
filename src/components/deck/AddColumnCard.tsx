import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SIDEBAR_ITEMS, sidebarItemIcon } from '@/lib/sidebarItems';
import { useState } from 'react';

/** IDs that navigate to their page instead of creating a column. */
const NAVIGATE_IDS = new Set(['settings', 'theme']);

interface AddColumnCardProps {
  onAdd: (type: string) => void;
}

/** Dashed "+" card at the end of the deck for adding new columns. */
export function AddColumnCard({ onAdd }: AddColumnCardProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-center h-screen shrink-0 px-6">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="flex flex-col items-center justify-center gap-3 w-[200px] h-[300px] rounded-xl border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-secondary/30 transition-colors cursor-pointer">
            <Plus className="size-10 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Add Column</span>
          </button>
        </PopoverTrigger>
        <PopoverContent side="left" align="center" className="w-56 p-2 max-h-[400px] overflow-y-auto">
          {SIDEBAR_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                if (NAVIGATE_IDS.has(item.id)) {
                  navigate(item.path);
                } else {
                  onAdd(item.id);
                }
                setOpen(false);
              }}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm hover:bg-secondary/60 transition-colors text-left"
            >
              <span className="shrink-0 text-muted-foreground">{sidebarItemIcon(item.id, 'size-4')}</span>
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
