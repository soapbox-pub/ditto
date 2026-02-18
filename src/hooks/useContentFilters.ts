import { useMemo } from 'react';
import { useEncryptedSettings } from './useEncryptedSettings';
import { useCurrentUser } from './useCurrentUser';

export interface ContentFilter {
  id: string;
  name: string;
  enabled: boolean;
  rules: FilterRule[];
  createdAt: number;
  updatedAt: number;
}

export interface FilterRule {
  type: 'kind' | 'content-regex' | 'tag' | 'author-metadata';
  field?: string;
  operator: 'equals' | 'contains' | 'regex' | 'not-equals' | 'not-contains';
  value: string;
  caseSensitive?: boolean;
}

/**
 * Hook to manage encrypted client-side content filters using unified encrypted settings
 * Stores filters as part of encrypted app settings in NIP-78
 */
export function useContentFilters() {
  const { user } = useCurrentUser();
  const { settings, updateSettings, isLoading, isError, error, hasNip44Support } = useEncryptedSettings();

  const filters = useMemo(() => {
    return settings?.contentFilters || [];
  }, [settings]);

  // Add a new filter
  const addFilter = {
    mutateAsync: async (filter: Omit<ContentFilter, 'id' | 'createdAt' | 'updatedAt'>) => {
      if (!user) throw new Error('User not logged in');

      const currentFilters = filters;
      const newFilter: ContentFilter = {
        ...filter,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const updatedFilters = [...currentFilters, newFilter];
      await updateSettings.mutateAsync({ contentFilters: updatedFilters });
      return newFilter;
    },
    isPending: updateSettings.isPending,
  };

  // Update an existing filter
  const updateFilter = {
    mutateAsync: async (filter: ContentFilter) => {
      if (!user) throw new Error('User not logged in');

      const currentFilters = filters;
      const updatedFilters = currentFilters.map((f) =>
        f.id === filter.id ? { ...filter, updatedAt: Date.now() } : f
      );

      await updateSettings.mutateAsync({ contentFilters: updatedFilters });
      return filter;
    },
    isPending: updateSettings.isPending,
  };

  // Delete a filter
  const deleteFilter = {
    mutateAsync: async (filterId: string) => {
      if (!user) throw new Error('User not logged in');

      const currentFilters = filters;
      const updatedFilters = currentFilters.filter((f) => f.id !== filterId);

      await updateSettings.mutateAsync({ contentFilters: updatedFilters });
    },
    isPending: updateSettings.isPending,
  };

  // Toggle filter enabled state
  const toggleFilter = {
    mutateAsync: async (filterId: string) => {
      if (!user) throw new Error('User not logged in');

      const currentFilters = filters;
      const updatedFilters = currentFilters.map((f) =>
        f.id === filterId ? { ...f, enabled: !f.enabled, updatedAt: Date.now() } : f
      );

      await updateSettings.mutateAsync({ contentFilters: updatedFilters });
    },
    isPending: updateSettings.isPending,
  };

  // Apply filters to a Nostr event
  const shouldFilterEvent = (event: any): boolean => {
    const enabledFilters = filters.filter((f) => f.enabled);
    if (enabledFilters.length === 0) return false;

    return enabledFilters.some((filter) => {
      return filter.rules.every((rule) => matchesRule(event, rule));
    });
  };

  // Check if an event matches a specific rule
  const matchesRule = (event: any, rule: FilterRule): boolean => {
    const { type, field, operator, value, caseSensitive = false } = rule;

    const compareValue = (a: string, b: string) => {
      const valueA = caseSensitive ? a : a.toLowerCase();
      const valueB = caseSensitive ? b : b.toLowerCase();

      switch (operator) {
        case 'equals':
          return valueA === valueB;
        case 'not-equals':
          return valueA !== valueB;
        case 'contains':
          return valueA.includes(valueB);
        case 'not-contains':
          return !valueA.includes(valueB);
        case 'regex':
          try {
            const regex = new RegExp(valueB, caseSensitive ? '' : 'i');
            return regex.test(valueA);
          } catch {
            return false;
          }
        default:
          return false;
      }
    };

    switch (type) {
      case 'kind':
        return compareValue(String(event.kind), value);

      case 'content-regex':
        return compareValue(event.content || '', value);

      case 'tag':
        if (!field) return false;
        const tagValue = event.tags.find((tag: string[]) => tag[0] === field)?.[1];
        return tagValue ? compareValue(tagValue, value) : false;

      case 'author-metadata':
        // This would require fetching author metadata - can be extended
        return false;

      default:
        return false;
    }
  };

  return {
    filters,
    isLoading,
    isError,
    error,
    addFilter,
    updateFilter,
    deleteFilter,
    toggleFilter,
    shouldFilterEvent,
    hasNip44Support,
  };
}
