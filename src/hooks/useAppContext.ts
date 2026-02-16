import { useContext } from "react";
import { AppContext, type AppContextType } from "@/contexts/AppContext";

/**
 * Hook to access and update application configuration
 * @returns Application context with config and update methods
 */
export function useAppContext(): AppContextType {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}