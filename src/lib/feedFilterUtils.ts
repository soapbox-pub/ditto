import { EXTRA_KINDS } from '@/lib/extraKinds';
import { CONTENT_KIND_ICONS } from '@/lib/sidebarItems';
import type { TabFilter } from '@/contexts/AppContext';

type KindOption = {
  value: string;
  label: string;
  description: string;
  parentId: string;
  icon: React.ComponentType<{ className?: string }> | undefined;
};

/** Build the kind options from EXTRA_KINDS definitions. */
export function buildKindOptions(): KindOption[] {
  const options: KindOption[] = [];
  for (const def of EXTRA_KINDS) {
    if (def.subKinds) {
      for (const sub of def.subKinds) {
        options.push({
          value: String(sub.kind),
          label: `${sub.label} (${sub.kind})`,
          description: sub.description,
          parentId: def.id,
          icon: CONTENT_KIND_ICONS[def.id],
        });
      }
    } else {
      options.push({
        value: String(def.kind),
        label: `${def.label} (${def.kind})`,
        description: def.description,
        parentId: def.id,
        icon: CONTENT_KIND_ICONS[def.id],
      });
    }
  }
  const seen = new Set<string>();
  return options.filter((o) => {
    if (seen.has(o.value)) return false;
    seen.add(o.value);
    return true;
  });
}

/** Parse a TabFilter's kinds array into an array of string kind values. */
export function parseSelectedKinds(filter: TabFilter): string[] {
  const kinds = filter.kinds;
  if (!Array.isArray(kinds) || kinds.length === 0) return [];
  return kinds.map(String);
}
