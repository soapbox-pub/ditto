import { type FeedSettings } from "@/contexts/AppContext";
import { useAppContext } from "@/hooks/useAppContext";

/**
 * Hook to get and update feed settings (sidebar links + feed kind inclusion).
 */
export function useFeedSettings(): {
  feedSettings: FeedSettings;
  updateFeedSettings: (patch: Partial<FeedSettings>) => void;
} {
  const { config, updateConfig } = useAppContext();

  return {
    feedSettings: config.feedSettings,
    updateFeedSettings: (patch: Partial<FeedSettings>) => {
      updateConfig((currentConfig) => ({
        ...currentConfig,
        feedSettings: {
          ...config.feedSettings,
          ...currentConfig.feedSettings,
          ...patch,
        },
      }));
    },
  };
}
