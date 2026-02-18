import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrFilter } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';

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

const CONTENT_FILTERS_D_TAG = 'mew-content-filters';

/**
 * Hook to manage encrypted client-side content filters using NIP-78
 * Stores filters as encrypted JSON in kind 30078 events
 */
export function useContentFilters() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  // Query the content filters event
  const query = useQuery({
    queryKey: ['contentFilters', user?.pubkey],
    queryFn: async () => {
      if (!user) return null;

      const filter: NostrFilter = {
        kinds: [30078],
        authors: [user.pubkey],
        '#d': [CONTENT_FILTERS_D_TAG],
        limit: 1,
      };

      const events = await nostr.query([filter]);
      if (events.length === 0) return null;

      return events[0];
    },
    enabled: !!user,
  });

  // Parse filters from encrypted content
  const filters = useQuery({
    queryKey: ['parsedFilters', query.data?.id],
    queryFn: async () => {
      const event = query.data;
      if (!event || !user) return [];

      // Decrypt the content
      if (!event.content || !user.signer.nip44) {
        return [];
      }

      try {
        const decrypted = await user.signer.nip44.decrypt(user.pubkey, event.content);
        const parsed = JSON.parse(decrypted) as ContentFilter[];
        return parsed;
      } catch (error) {
        console.error('Failed to decrypt content filters:', error);
        return [];
      }
    },
    enabled: !!query.data && !!user,
  });

  // Add a new filter
  const addFilter = useMutation({
    mutationFn: async (filter: Omit<ContentFilter, 'id' | 'createdAt' | 'updatedAt'>) => {
      if (!user) throw new Error('User not logged in');

      const currentFilters = filters.data || [];
      const newFilter: ContentFilter = {
        ...filter,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const updatedFilters = [...currentFilters, newFilter];
      await saveFilters(updatedFilters);
      return newFilter;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contentFilters', user?.pubkey] });
    },
  });

  // Update an existing filter
  const updateFilter = useMutation({
    mutationFn: async (filter: ContentFilter) => {
      if (!user) throw new Error('User not logged in');

      const currentFilters = filters.data || [];
      const updatedFilters = currentFilters.map((f) =>
        f.id === filter.id ? { ...filter, updatedAt: Date.now() } : f
      );

      await saveFilters(updatedFilters);
      return filter;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contentFilters', user?.pubkey] });
    },
  });

  // Delete a filter
  const deleteFilter = useMutation({
    mutationFn: async (filterId: string) => {
      if (!user) throw new Error('User not logged in');

      const currentFilters = filters.data || [];
      const updatedFilters = currentFilters.filter((f) => f.id !== filterId);

      await saveFilters(updatedFilters);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contentFilters', user?.pubkey] });
    },
  });

  // Toggle filter enabled state
  const toggleFilter = useMutation({
    mutationFn: async (filterId: string) => {
      if (!user) throw new Error('User not logged in');

      const currentFilters = filters.data || [];
      const updatedFilters = currentFilters.map((f) =>
        f.id === filterId ? { ...f, enabled: !f.enabled, updatedAt: Date.now() } : f
      );

      await saveFilters(updatedFilters);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contentFilters', user?.pubkey] });
    },
  });

  // Save filters to Nostr
  const saveFilters = async (filtersToSave: ContentFilter[]) => {
    if (!user) throw new Error('User not logged in');
    if (!user.signer.nip44) throw new Error('NIP-44 encryption not supported by signer');

    // Encrypt the filters
    const plaintext = JSON.stringify(filtersToSave);
    const encrypted = await user.signer.nip44.encrypt(user.pubkey, plaintext);

    await publishEvent({
      kind: 30078,
      content: encrypted,
      tags: [
        ['d', CONTENT_FILTERS_D_TAG],
        ['title', 'Mew Content Filters'],
      ],
    });
  };

  // Apply filters to a Nostr event
  const shouldFilterEvent = (event: any): boolean => {
    const enabledFilters = (filters.data || []).filter((f) => f.enabled);
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
    filters: filters.data || [],
    isLoading: query.isLoading || filters.isLoading,
    isError: query.isError || filters.isError,
    error: query.error || filters.error,
    addFilter,
    updateFilter,
    deleteFilter,
    toggleFilter,
    shouldFilterEvent,
    hasNip44Support: !!user?.signer.nip44,
  };
}
