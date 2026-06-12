import { cn } from "@/lib/utils";

/**
 * Shared classes for nest menu bar items: mobile mirrors the app's bottom
 * nav (icon + tiny label column, flex-1), desktop is a round ghost icon
 * button inside the floating pill.
 */
export const NEST_BAR_ITEM = cn(
  "flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 transition-colors text-muted-foreground",
  "sidebar:flex-none sidebar:size-12 sidebar:rounded-full sidebar:py-0 sidebar:gap-0 sidebar:hover:bg-secondary/60",
);

export const NEST_BAR_ICON = "size-5 sidebar:size-7";
export const NEST_BAR_LABEL = "text-[10px] font-medium sidebar:hidden";
