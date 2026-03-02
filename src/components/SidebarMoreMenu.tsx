import { Link } from 'react-router-dom';
import { Plus, Pencil, Check, SeparatorHorizontal } from 'lucide-react';
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
  /** Render items inline (no portal dropdown) — use inside scrollable containers like the mobile drawer */
  inline?: boolean;
}

export function SidebarMoreMenu({
  editing, hiddenItems, onDoneEditing, onStartEditing, onAdd, onAddDivider, onNavigate, open, onOpenChange, inline,
}: SidebarMoreMenuProps) {
  if (editing) {
    return (
      <div className="flex flex-col gap-0.5">
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

  if (inline) {
    return (
      <div className="flex flex-col">
        {/* Toggle button */}
        <button
          onClick={() => onOpenChange(!open)}
          className="flex items-center gap-4 px-4 py-2.5 rounded-full transition-colors text-sm text-muted-foreground/60 hover:text-muted-foreground hover:bg-secondary/40 bg-background/85"
        >
          <Plus className="size-4" />
          <span>More...</span>
        </button>

        {/* Inline expanded list */}
        {open && (
          <div className="flex flex-col gap-0.5 pl-2">
            {hiddenItems.map((item) => (
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
                  <Plus className="size-4" />
                </button>
              </div>
            ))}
            {hiddenItems.length > 0 && <div className="h-px bg-border my-1" />}
            <button
              onClick={() => { onStartEditing(); onOpenChange(false); }}
              className="flex items-center gap-3 w-full px-2 py-2 rounded-sm text-sm hover:bg-secondary/60 transition-colors cursor-pointer"
            >
              <Pencil className="size-5" />
              <span>Edit sidebar</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-4 px-4 py-2.5 rounded-full transition-colors text-sm text-muted-foreground/60 hover:text-muted-foreground hover:bg-secondary/40 bg-background/85">
          <Plus className="size-4" />
          <span>More...</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[240px] p-1">
        {hiddenItems.map((item) => (
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
              <Plus className="size-4" />
            </button>
          </div>
        ))}
        {hiddenItems.length > 0 && <div className="h-px bg-border my-1" />}
        <button
          onClick={() => { onStartEditing(); onOpenChange(false); }}
          className="flex items-center gap-3 w-full px-2 py-2 rounded-sm text-sm hover:bg-secondary/60 transition-colors cursor-pointer"
        >
          <Pencil className="size-5" />
          <span>Edit sidebar</span>
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
