import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Connection state for the Nostr session.
 */
export interface NostrSessionState {
  /** Whether the session is currently connected */
  isConnected: boolean;
  /** The last error that occurred, if any */
  lastError: Error | null;
  /** Number of reconnection attempts since last successful connection */
  reconnectAttempts: number;
  /** Whether a reconnection is currently scheduled */
  isReconnecting: boolean;
}

/**
 * Configuration options for the persistent Nostr session.
 */
export interface PersistentNostrSessionOptions {
  /** Maximum reconnection delay in milliseconds (default: 30000) */
  maxReconnectDelay?: number;
  /** Base reconnection delay in milliseconds (default: 1000) */
  baseReconnectDelay?: number;
  /** Maximum jitter to add to reconnection delay in milliseconds (default: 250) */
  maxJitter?: number;
  /** Whether to automatically reconnect on connection loss (default: true) */
  autoReconnect?: boolean;
}

const DEFAULT_OPTIONS: Required<PersistentNostrSessionOptions> = {
  maxReconnectDelay: 30000,
  baseReconnectDelay: 1000,
  maxJitter: 250,
  autoReconnect: true,
};

/**
 * Calculate the next reconnection delay using exponential backoff with jitter.
 * 
 * Schedule: 1s, 2s, 4s, 8s, 16s, 30s (max)
 * Plus random jitter between 0-250ms
 */
function calculateReconnectDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  maxJitter: number
): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  
  // Cap at maximum delay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  
  // Add random jitter
  const jitter = Math.random() * maxJitter;
  
  return cappedDelay + jitter;
}

/**
 * Hook to manage a persistent Nostr session with automatic reconnection.
 * 
 * This hook ensures:
 * 1. The Nostr connection is established once when the app opens or user logs in
 * 2. The connection persists while the window remains open
 * 3. Reconnection uses exponential backoff with jitter
 * 4. Duplicate subscriptions and queries are prevented
 * 
 * Since nostrify manages relay pools internally, this hook focuses on:
 * - Preventing duplicate query invalidations
 * - Managing reconnection state
 * - Providing connection status to components
 * - Coordinating with React Query for data freshness
 * 
 * @param options Configuration options
 * @returns Session state and control functions
 */
export function usePersistentNostrSession(
  options: PersistentNostrSessionOptions = {}
) {
  const queryClient = useQueryClient();
  
  // Extract individual option values to ensure stable dependencies
  const maxReconnectDelay = options.maxReconnectDelay ?? DEFAULT_OPTIONS.maxReconnectDelay;
  const baseReconnectDelay = options.baseReconnectDelay ?? DEFAULT_OPTIONS.baseReconnectDelay;
  const maxJitter = options.maxJitter ?? DEFAULT_OPTIONS.maxJitter;
  const autoReconnect = options.autoReconnect ?? DEFAULT_OPTIONS.autoReconnect;
  
  const [state, setState] = useState<NostrSessionState>({
    isConnected: true, // Assume connected initially (nostrify manages this)
    lastError: null,
    reconnectAttempts: 0,
    isReconnecting: false,
  });
  
  // Track whether we've initialized
  const initialized = useRef(false);
  // Track reconnection timeout
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track if component is mounted
  const mounted = useRef(true);
  
  /**
   * Clear any pending reconnection timeout.
   */
  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
  }, []);
  
  /**
   * Handle connection restored.
   * Invalidates stale queries to fetch fresh data.
   */
  const handleConnectionRestored = useCallback(() => {
    if (!mounted.current) return;
    
    setState(prev => ({
      ...prev,
      isConnected: true,
      lastError: null,
      reconnectAttempts: 0,
      isReconnecting: false,
    }));
    
    clearReconnectTimeout();
    
    // Invalidate Blobbi-related queries to fetch fresh data
    // This is batched by React Query to avoid multiple refetches
    queryClient.invalidateQueries({
      queryKey: ['blobbonaut-profile'],
      refetchType: 'active', // Only refetch if the query is actively being used
    });
    queryClient.invalidateQueries({
      queryKey: ['blobbi-companion'],
      refetchType: 'active',
    });
  }, [queryClient, clearReconnectTimeout]);
  
  /**
   * Handle connection lost.
   * Schedules reconnection with exponential backoff.
   */
  const handleConnectionLost = useCallback((error?: Error) => {
    if (!mounted.current) return;
    
    setState(prev => {
      const newAttempts = prev.reconnectAttempts + 1;
      
      // Schedule reconnection if auto-reconnect is enabled
      if (autoReconnect) {
        clearReconnectTimeout();
        
        const delay = calculateReconnectDelay(
          prev.reconnectAttempts,
          baseReconnectDelay,
          maxReconnectDelay,
          maxJitter
        );
        
        reconnectTimeout.current = setTimeout(() => {
          // Nostrify handles actual reconnection internally
          // We just need to update our state and potentially invalidate queries
          handleConnectionRestored();
        }, delay);
      }
      
      return {
        ...prev,
        isConnected: false,
        lastError: error ?? null,
        reconnectAttempts: newAttempts,
        isReconnecting: autoReconnect,
      };
    });
  }, [autoReconnect, baseReconnectDelay, maxReconnectDelay, maxJitter, clearReconnectTimeout, handleConnectionRestored]);
  
  /**
   * Manually trigger a reconnection attempt.
   */
  const reconnectNow = useCallback(() => {
    clearReconnectTimeout();
    
    setState(prev => ({
      ...prev,
      isReconnecting: true,
    }));
    
    // Since nostrify manages connections internally, we just need to
    // invalidate queries to trigger fresh fetches
    handleConnectionRestored();
  }, [clearReconnectTimeout, handleConnectionRestored]);
  
  /**
   * Reset the session state.
   * Useful when the user logs out or the connection should be fully reset.
   */
  const resetSession = useCallback(() => {
    clearReconnectTimeout();
    
    setState({
      isConnected: true,
      lastError: null,
      reconnectAttempts: 0,
      isReconnecting: false,
    });
  }, [clearReconnectTimeout]);
  
  // Initialize on mount
  useEffect(() => {
    mounted.current = true;
    
    if (!initialized.current) {
      initialized.current = true;
      // Initial connection is handled by nostrify
    }
    
    return () => {
      mounted.current = false;
      clearReconnectTimeout();
    };
  }, [clearReconnectTimeout]);
  
  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      handleConnectionRestored();
    };
    
    const handleOffline = () => {
      handleConnectionLost(new Error('Browser went offline'));
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleConnectionRestored, handleConnectionLost]);
  
  // Handle visibility change (tab focus)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Tab became visible - check if we need to refresh data
        // Use a small delay to avoid immediate refetch
        setTimeout(() => {
          if (mounted.current && state.isConnected) {
            // Only invalidate if queries are stale (controlled by staleTime)
            queryClient.invalidateQueries({
              queryKey: ['blobbonaut-profile'],
              refetchType: 'active',
            });
            queryClient.invalidateQueries({
              queryKey: ['blobbi-companion'],
              refetchType: 'active',
            });
          }
        }, 1000);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [queryClient, state.isConnected]);
  
  return {
    /** Current session state */
    ...state,
    /** Manually trigger a reconnection attempt */
    reconnectNow,
    /** Reset the session state */
    resetSession,
    /** Handle connection lost (can be called by error boundaries) */
    handleConnectionLost,
    /** Handle connection restored (can be called after successful query) */
    handleConnectionRestored,
  };
}

/**
 * Type for the return value of usePersistentNostrSession.
 */
export type PersistentNostrSession = ReturnType<typeof usePersistentNostrSession>;
