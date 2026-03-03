import { Link } from 'react-router-dom';
import { Plus, Pencil, Check, SeparatorHorizontal, Search } from 'lucide-react';
import { useState } from 'react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { sidebarItemIcon, itemPath } from '@/lib/sidebarItems';
import type { HiddenSidebarItem } from '@/hooks/useFeedSettings';

interface SidebarMoreMenuProps {
  editing: boolean;
  hiddenItems: HiddenSidebarItem[];
  onDoneEditing: () => void;
  onStartEditing: () => void;
  onAdd: (id: string) => void;
  onAddDivider: () => void;
  onNavigate?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SidebarMoreMenu({
  editing, hiddenItems, onDoneEditing, onStartEditing, onAdd, onAddDivider, onNavigate, open, onOpenChange,
}: SidebarMoreMenuProps) {
  const [query, setQuery] = useState('');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');

  const filtered = hiddenItems.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase())
  );
  const addFiltered = hiddenItems.filter((item) =>
    item.label.toLowerCase().includes(addQuery.toLowerCase())
  );

  if (editing) {
    return (
      <div className="flex flex-col gap-0.5">
        <DropdownMenu open={addMenuOpen} onOpenChange={(o) => { setAddMenuOpen(o); if (!o) setAddQuery(''); }}>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-4 px-4 py-2.5 rounded-full transition-colors text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 bg-background/85">
              <Plus className="size-4" />
              <span>Add</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" collisionPadding={8} className="w-[240px] p-1 flex flex-col max-h-[calc(var(--radix-dropdown-menu-content-available-height)-12px)]">
            <div className="flex items-center gap-3 px-2 py-2 shrink-0">
              <Search className="size-5 shrink-0" />
              <input
                value={addQuery}
                onChange={(e) => setAddQuery(e.target.value)}
                placeholder="Search..."
                className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                autoFocus
              />
            </div>
            <div className="h-px bg-border mb-1 shrink-0" />
            <div className="overflow-y-auto flex-1 min-h-0">
              {addFiltered.map((item) => (
                <div key={item.id} className="flex items-center">
                  <button
                    onClick={() => { onAdd(item.id); setAddMenuOpen(false); }}
                    className="flex items-center gap-3 flex-1 min-w-0 px-2 py-2 rounded-sm text-sm hover:bg-secondary/60 transition-colors cursor-pointer"
                  >
                    {sidebarItemIcon(item.id, 'size-5 shrink-0')}
                    <span className="truncate">{item.label}</span>
                  </button>
                  <button
                    onClick={() => { onAdd(item.id); setAddMenuOpen(false); }}
                    className="size-8 flex items-center justify-center shrink-0 rounded-sm text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    title={`Add ${item.label} to sidebar`}
                  >
                    <Plus className="size-4" strokeWidth={4} />
                  </button>
                </div>
              ))}
              {addFiltered.length === 0 && (
                <p className="px-2 py-3 text-sm text-muted-foreground text-center">No results</p>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          onClick={onAddDivider}
          className="flex items-center gap-4 px-4 py-2.5 rounded-full transition-colors text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 bg-background/85"
        >
          <SeparatorHorizontal className="size-4" />
          <span>Add divider</span>
        </button>
        <button
          onClick={onDoneEditing}
          className="flex items-center gap-4 px-4 py-2.5 rounded-full transition-colors text-sm text-primary font-medium hover:bg-primary/10 bg-background/85"
        >
          <Check className="size-4" />
          <span>Done editing</span>
        </button>
      </div>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setQuery(''); }}>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-4 px-4 py-2.5 rounded-full transition-colors text-sm text-muted-foreground/60 hover:text-muted-foreground hover:bg-secondary/40 bg-background/85">
          <Plus className="size-4" />
          <span>More...</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" collisionPadding={8} className="w-[240px] p-1 flex flex-col max-h-[calc(var(--radix-dropdown-menu-content-available-height)-12px)]">
        <div className="flex items-center gap-3 px-2 py-2 shrink-0">
          <Search className="size-5 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            autoFocus
          />
        </div>
        <div className="h-px bg-border mb-1 shrink-0" />
        <div className="overflow-y-auto flex-1 min-h-0">
          {filtered.map((item) => (
            <div key={item.id} className="flex items-center">
              <Link
                to={itemPath(item.id)}
                onClick={() => { onOpenChange(false); onNavigate?.(); }}
                className="flex items-center gap-3 flex-1 min-w-0 px-2 py-2 rounded-sm text-sm hover:bg-secondary/60 transition-colors"
              >
                {sidebarItemIcon(item.id, 'size-5 shrink-0')}
                <span className="truncate">{item.label}</span>
              </Link>
              <button
                onClick={() => { onAdd(item.id); onOpenChange(false); }}
                className="size-8 flex items-center justify-center shrink-0 rounded-sm text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                title={`Add ${item.label} to sidebar`}
              >
                <Plus className="size-4" strokeWidth={4} />
              </button>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="px-2 py-3 text-sm text-muted-foreground text-center">No results</p>
          )}
        </div>
        <div className="h-px bg-border my-1 shrink-0" />
        <button
          onClick={() => { onStartEditing(); onOpenChange(false); }}
          className="flex items-center gap-3 w-full px-2 py-2 rounded-sm text-sm hover:bg-secondary/60 transition-colors cursor-pointer shrink-0"
        >
          <Pencil className="size-5" />
          <span>Edit sidebar</span>
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
