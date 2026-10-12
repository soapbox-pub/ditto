import type { IntlShape, MessageDescriptor } from 'react-intl';

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

/** "Photos (20)": a kind's label with its number. */
function kindOptionLabel(intl: IntlShape, label: MessageDescriptor, kind: number): string {
  return intl.formatMessage(
    { id: 'feedFilter.kindOption', defaultMessage: '{label} ({kind})' },
    { label: intl.formatMessage(label), kind: String(kind) },
  );
}

/** Build the kind options from EXTRA_KINDS definitions, labeled in the current locale. */
export function buildKindOptions(intl: IntlShape): KindOption[] {
  const options: KindOption[] = [];
  for (const def of EXTRA_KINDS) {
    if (def.subKinds) {
      for (const sub of def.subKinds) {
        options.push({
          value: String(sub.kind),
          label: kindOptionLabel(intl, sub.label, sub.kind),
          description: intl.formatMessage(sub.description),
          parentId: def.id,
          icon: CONTENT_KIND_ICONS[def.id],
        });
      }
    } else {
      options.push({
        value: String(def.kind),
        label: kindOptionLabel(intl, def.label, def.kind),
        description: intl.formatMessage(def.description),
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
