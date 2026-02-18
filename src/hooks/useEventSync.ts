import { useEffect, useRef, useCallback } from 'react';
import { useNostr } from '@nostrify/react';
import { useAppContext } from '@/hooks/useAppContext';
import { eventStore } from '@/lib/eventStore';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

interface UseEventSyncOptions {
  /** Filters to sync events for */
  filters?: NostrFilter[];
  /** Polling interval in milliseconds (default: 30 seconds) */
  interval?: number;
  /** Whether to enable syncing (default: true) */
  enabled?: boolean;
  /** Callback when new events are synced */
  onNewEvents?: (count: number) => void;
}

/**
 * Hook to automatically sync events from relays to local IndexedDB storage.
 * Polls relays at regular intervals to fetch new events matching the provided filters.
 */
export function useEventSync(options: UseEventSyncOptions = {}) {
  const {
    filters,
    interval = 30000, // 30 seconds
    enabled = true,
    onNewEvents,
  } = options;

  const { nostr } = useNostr();
  const { config } = useAppContext();
  const lastSyncRef = useRef<number>(Math.floor(Date.now() / 1000));
  const intervalIdRef = useRef<number | null>(null);

  const syncEvents = useCallback(async (skipCallback = false) => {
    if (!filters || filters.length === 0) {
      return;
    }

    try {
      const relayUrls = config.relayMetadata.relays.filter(r => r.read).map(r => r.url);

      if (relayUrls.length === 0) {
        console.debug('[EventSync] No read relays configured, skipping sync');
        return;
      }

      // Add 'since' to all filters to only fetch new events
      const since = lastSyncRef.current;
      const sinceFilters = filters.map(filter => ({
        ...filter,
        since: Math.floor(since),
        limit: filter.limit || 100,
      }));

      const signal = AbortSignal.timeout(10000); // 10 second timeout

      const events = await nostr.query(sinceFilters, { signal });

      if (events.length > 0) {
        // Store all events with relay information
        await eventStore.addEvents(events, relayUrls);

        // Update last sync timestamp to the most recent event
        const newestEvent = events.reduce((newest, current) =>
          current.created_at > newest.created_at ? current : newest
        );
        lastSyncRef.current = newestEvent.created_at + 1; // +1 to avoid duplicates

        console.debug(`[EventSync] Synced ${events.length} new events`);

        // Only trigger callback if not skipped (skip on initial mount)
        if (!skipCallback) {
          onNewEvents?.(events.length);
        }
      }

    } catch (error) {
      console.debug('[EventSync] Sync error:', error);
    }
  }, [filters, nostr, config, onNewEvents]);

  useEffect(() => {
    if (!enabled || !filters || filters.length === 0) {
      return;
    }

    // Initialize the event store
    eventStore.init().catch(error => {
      console.error('[EventSync] Failed to initialize event store:', error);
    });

    // Initial sync - skip callback to prevent UI flicker
    syncEvents(true).catch((error) => {
      console.debug('[EventSync] Initial sync error:', error);
    });

    // Set up polling interval
    intervalIdRef.current = window.setInterval(() => {
      syncEvents(false).catch((error) => {
        console.debug('[EventSync] Interval sync error:', error);
      });
    }, interval);

    return () => {
      if (intervalIdRef.current !== null) {
        window.clearInterval(intervalIdRef.current);
      }
    };
  }, [enabled, filters, interval, syncEvents]);

  return {
    /** Trigger a manual sync */
    sync: useCallback(async () => {
      await syncEvents(false);
    }, [syncEvents]),
  };
}
