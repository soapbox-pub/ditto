import { useMemo } from 'react';
import { Check, LayoutGrid, Plus } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WIDGET_DEFINITIONS, WIDGET_CATEGORIES } from '@/lib/sidebarWidgets';
import { useInstalledTiles } from '@/hooks/useInstalledTiles';
import { getDTag } from '@/lib/nostr-canvas/identifiers';
import type { WidgetConfig } from '@/contexts/AppContext';
import { cn } from '@/lib/utils';

interface WidgetPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentWidgets: WidgetConfig[];
  onAdd: (entry: { id: string; tileIdentifier?: string }) => void;
  onRemove: (id: string) => void;
}

/** Dialog for adding/removing widgets from the sidebar. */
export function WidgetPickerDialog({ open, onOpenChange, currentWidgets, onAdd, onRemove }: WidgetPickerDialogProps) {
  const activeIds = useMemo(() => new Set(currentWidgets.map((w) => w.id)), [currentWidgets]);

  // Group built-in widgets by category
  const grouped = useMemo(() => {
    const groups: Record<string, typeof WIDGET_DEFINITIONS> = {};
    for (const w of WIDGET_DEFINITIONS) {
      (groups[w.category] ??= []).push(w);
    }
    return groups;
  }, []);

  // Installed tiles that can be promoted to widgets. Each has a synthetic
  // widget config id of `tile:<identifier>` so multiple tile widgets can
  // coexist without id collisions.
  const { installedTiles } = useInstalledTiles();
  const tileWidgets = useMemo(
    () =>
      installedTiles
        .map(({ event }) => {
          const identifier = getDTag(event);
          if (!identifier) return null;
          const name = event.tags.find(([name]) => name === 'name')?.[1] ?? identifier;
          const summary = event.tags.find(([name]) => name === 'summary')?.[1];
          return {
            id: `tile:${identifier}`,
            tileIdentifier: identifier,
            label: name,
            description: summary ?? identifier,
          };
        })
        .filter((entry): entry is {
          id: string;
          tileIdentifier: string;
          label: string;
          description: string;
        } => entry !== null),
    [installedTiles],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Widget</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-5 pr-2">
            {Object.entries(grouped).map(([category, widgets]) => (
              <div key={category}>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                  {WIDGET_CATEGORIES[category] ?? category}
                </h3>
                <div className="space-y-1">
                  {widgets.map((widget) => {
                    const isActive = activeIds.has(widget.id);
                    const Icon = widget.icon;
                    return (
                      <button
                        key={widget.id}
                        onClick={() => {
                          if (isActive) {
                            onRemove(widget.id);
                          } else {
                            onAdd({ id: widget.id });
                          }
                        }}
                        className={cn(
                          'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-colors text-left',
                          isActive
                            ? 'bg-primary/10 hover:bg-primary/15'
                            : 'hover:bg-secondary/60',
                        )}
                      >
                        <div className={cn(
                          'size-9 rounded-lg flex items-center justify-center shrink-0',
                          isActive ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground',
                        )}>
                          <Icon className="size-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{widget.label}</div>
                          <div className="text-xs text-muted-foreground truncate">{widget.description}</div>
                        </div>
                        <div className={cn(
                          'size-6 rounded-full flex items-center justify-center shrink-0 transition-colors',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'border border-border text-muted-foreground/50',
                        )}>
                          {isActive ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {tileWidgets.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                  Tiles
                </h3>
                <div className="space-y-1">
                  {tileWidgets.map((widget) => {
                    const isActive = activeIds.has(widget.id);
                    return (
                      <button
                        key={widget.id}
                        onClick={() => {
                          if (isActive) {
                            onRemove(widget.id);
                          } else {
                            onAdd({ id: widget.id, tileIdentifier: widget.tileIdentifier });
                          }
                        }}
                        className={cn(
                          'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-colors text-left',
                          isActive
                            ? 'bg-primary/10 hover:bg-primary/15'
                            : 'hover:bg-secondary/60',
                        )}
                      >
                        <div className={cn(
                          'size-9 rounded-lg flex items-center justify-center shrink-0',
                          isActive ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground',
                        )}>
                          <LayoutGrid className="size-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{widget.label}</div>
                          <div className="text-xs text-muted-foreground truncate">{widget.description}</div>
                        </div>
                        <div className={cn(
                          'size-6 rounded-full flex items-center justify-center shrink-0 transition-colors',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'border border-border text-muted-foreground/50',
                        )}>
                          {isActive ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
