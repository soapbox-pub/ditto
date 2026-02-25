import { useQuery } from '@tanstack/react-query';

import { useNestsApi } from '@/hooks/useNestsApi';
import type { RoomInfo } from '@/lib/nestsApi';

/**
 * Fetches room info (host, speakers, admins, recording state) from the Nests API.
 * Polls every 30 seconds to keep the admin/speaker lists fresh.
 */
export function useNestRoomInfo(roomId: string | undefined) {
  const api = useNestsApi();

  return useQuery<RoomInfo | null>({
    queryKey: ['nest-room-info', roomId],
    queryFn: async () => {
      if (!roomId) return null;
      try {
        return await api.getRoomInfo(roomId);
      } catch {
        return null;
      }
    },
    enabled: !!roomId,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}
