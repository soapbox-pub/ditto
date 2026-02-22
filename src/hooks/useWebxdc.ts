import { useCallback, useEffect, useRef, useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Webxdc as WebxdcAPI, SendingStatusUpdate, ReceivedStatusUpdate, RealtimeListener } from '@webxdc/types';
import { nip19 } from 'nostr-tools';

import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';

/**
 * Creates a `Webxdc` API instance backed by Nostr kind 4932 state update events.
 *
 * - `sendUpdate()` publishes a kind 4932 event with an `i` tag referencing the UUID.
 * - `setUpdateListener()` / `getAllUpdates()` query kind 4932 events with `#i` = UUID,
 *   ordered by `created_at`, and assign serial numbers.
 *
 * @param uuid - The webxdc session UUID from the `webxdc` property in the imeta tag.
 */
export function useWebxdc(uuid: string): WebxdcAPI<unknown> {
  const { nostr } = useNostr();
  const { user, metadata } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  // Track the update listener callback
  const listenerRef = useRef<((update: ReceivedStatusUpdate<unknown>) => void) | null>(null);
  const lastSerialRef = useRef(0);

  // Query all existing kind 4932 events for this UUID
  const { data: stateEvents } = useQuery({
    queryKey: ['webxdc-updates', uuid],
    queryFn: async () => {
      const events = await nostr.query([{
        kinds: [4932],
        '#i': [uuid],
        limit: 500,
      }]);
      // Sort by created_at ascending (oldest first) for serial assignment
      return events.sort((a, b) => a.created_at - b.created_at);
    },
    refetchInterval: 3000, // Poll for new updates every 3 seconds
  });

  // Convert events to ReceivedStatusUpdates with serial numbers
  const updates = useMemo((): ReceivedStatusUpdate<unknown>[] => {
    if (!stateEvents) return [];
    return stateEvents.map((event, index) => {
      const serial = index + 1;
      let payload: unknown;
      try {
        payload = JSON.parse(event.content);
      } catch {
        payload = event.content;
      }

      const info = event.tags.find(([n]) => n === 'info')?.[1];
      const document = event.tags.find(([n]) => n === 'document')?.[1];
      const summary = event.tags.find(([n]) => n === 'summary')?.[1];

      const update: ReceivedStatusUpdate<unknown> = {
        payload,
        serial,
        max_serial: stateEvents.length,
        ...(info && { info }),
        ...(document && { document }),
        ...(summary && { summary }),
      };
      return update;
    });
  }, [stateEvents]);

  // Deliver new updates to listener when data changes
  useEffect(() => {
    if (!listenerRef.current || !updates.length) return;
    const listener = listenerRef.current;
    const lastSerial = lastSerialRef.current;

    for (const update of updates) {
      if (update.serial > lastSerial) {
        listener(update);
        lastSerialRef.current = update.serial;
      }
    }
  }, [updates]);

  const selfAddr = user ? nip19.npubEncode(user.pubkey) : '';
  const selfName = metadata?.display_name || metadata?.name || (user ? nip19.npubEncode(user.pubkey).slice(0, 12) : '');

  const sendUpdate = useCallback((update: SendingStatusUpdate<unknown>, _description: '') => {
    const tags: string[][] = [
      ['i', uuid],
      ['alt', 'Webxdc update'],
    ];
    if (update.info) tags.push(['info', update.info]);
    if (update.document) tags.push(['document', update.document]);
    if (update.summary) tags.push(['summary', update.summary]);

    publishEvent({
      kind: 4932,
      content: JSON.stringify(update.payload),
      tags,
      created_at: Math.floor(Date.now() / 1000),
    }, {
      onSuccess: () => {
        // Invalidate the query to pick up the new event
        queryClient.invalidateQueries({ queryKey: ['webxdc-updates', uuid] });
      },
    });
  }, [uuid, publishEvent, queryClient]);

  const setUpdateListener = useCallback(async (
    cb: (update: ReceivedStatusUpdate<unknown>) => void,
    serial?: number,
  ): Promise<void> => {
    listenerRef.current = cb;
    lastSerialRef.current = serial ?? 0;

    // Deliver existing updates above the serial
    for (const update of updates) {
      if (update.serial > (serial ?? 0)) {
        cb(update);
        lastSerialRef.current = update.serial;
      }
    }
  }, [updates]);

  const getAllUpdates = useCallback(async (): Promise<ReceivedStatusUpdate<unknown>[]> => {
    return updates;
  }, [updates]);

  const sendToChat = useCallback(async (): Promise<void> => {
    // Not implemented for Nostr context
    throw new Error('sendToChat is not supported in Nostr');
  }, []);

  const importFiles = useCallback(async (): Promise<File[]> => {
    // Not implemented for Nostr context
    return [];
  }, []);

  const joinRealtimeChannel = useCallback((): RealtimeListener => {
    // Realtime channels are not supported over Nostr relays
    return {
      setListener: () => {},
      send: () => {},
      leave: () => {},
    };
  }, []);

  return useMemo((): WebxdcAPI<unknown> => ({
    selfAddr,
    selfName,
    sendUpdateInterval: 1000,
    sendUpdateMaxSize: 65536,
    sendUpdate,
    setUpdateListener,
    getAllUpdates,
    sendToChat,
    importFiles,
    joinRealtimeChannel,
  }), [selfAddr, selfName, sendUpdate, setUpdateListener, getAllUpdates, sendToChat, importFiles, joinRealtimeChannel]);
}
