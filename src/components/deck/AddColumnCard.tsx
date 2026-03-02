import { Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SIDEBAR_ITEMS, sidebarItemIcon } from '@/lib/sidebarItems';
import { useState } from 'react';

interface AddColumnCardProps {
  onAdd: (type: string) => void;
}

/** Dashed "+" card at the end of the deck for adding new columns. */
export function AddColumnCard({ onAdd }: AddColumnCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center justify-center h-screen shrink-0 px-6">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="flex flex-col items-center justify-center gap-3 w-[200px] h-[300px] rounded-xl border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-secondary/30 transition-colors cursor-pointer">
            <Plus className="size-10 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Add Column</span>
          </button>
        </PopoverTrigger>
        <PopoverContent side="left" align="center" className="w-56 p-0 max-h-[70vh] flex flex-col">
          <div className="px-3 py-2 border-b border-border shrink-0">
            <p className="text-xs font-semibold text-muted-foreground">Add Column</p>
          </div>
          <div className="overflow-y-auto p-2">
            {SIDEBAR_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onAdd(item.id);
                  setOpen(false);
                }}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm hover:bg-secondary/60 transition-colors text-left"
              >
                <span className="shrink-0 text-muted-foreground">{sidebarItemIcon(item.id, 'size-4')}</span>
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
