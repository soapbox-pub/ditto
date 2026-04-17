import { useState, useEffect, useCallback } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { useNWC } from '@/hooks/useNWCContext';
import type { NWCConnection } from '@/hooks/useNWC';
import { nip57 } from 'nostr-tools';
import type { Event } from 'nostr-tools';
import type { WebLNProvider } from '@webbtc/webln-types';
import { useQueryClient } from '@tanstack/react-query';
import { notificationSuccess } from '@/lib/haptics';

/**
 * Hook for sending zaps to an event author.
 * Stats (zap count, total sats) come from NIP-85 via useEventStats — this hook
 * only handles the payment flow.
 */
export function useZaps(
  target: Event,
  webln: WebLNProvider | null,
  _nwcConnection: NWCConnection | null,
  onZapSuccess?: () => void
) {
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const queryClient = useQueryClient();
  const author = useAuthor(target?.pubkey);
  const { sendPayment, getActiveConnection } = useNWC();
  const [isZapping, setIsZapping] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);

  // Cleanup state when component unmounts
  useEffect(() => {
    return () => {
      setIsZapping(false);
      setInvoice(null);
    };
  }, []);

  const zap = async (amount: number, comment: string) => {
    if (amount <= 0) {
      return;
    }

    setIsZapping(true);
    setInvoice(null); // Clear any previous invoice at the start

    if (!user) {
      toast({
        title: 'Login required',
        description: 'You must be logged in to send a zap.',
        variant: 'destructive',
      });
      setIsZapping(false);
      return;
    }

    if (!target) {
      toast({
        title: 'Event not found',
        description: 'Could not find the event to zap.',
        variant: 'destructive',
      });
      setIsZapping(false);
      return;
    }

    try {
      if (!author.data || !author.data?.metadata || !author.data?.event ) {
        toast({
          title: 'Author not found',
          description: 'Could not find the author of this item.',
          variant: 'destructive',
        });
        setIsZapping(false);
        return;
      }

      const { lud06, lud16 } = author.data.metadata;
      if (!lud06 && !lud16) {
        toast({
          title: 'Lightning address not found',
          description: 'The author does not have a lightning address configured.',
          variant: 'destructive',
        });
        setIsZapping(false);
        return;
      }

      // Get zap endpoint using the old reliable method
      const zapEndpoint = await nip57.getZapEndpoint(author.data.event);
      if (!zapEndpoint) {
        toast({
          title: 'Zap endpoint not found',
          description: 'Could not find a zap endpoint for the author.',
          variant: 'destructive',
        });
        setIsZapping(false);
        return;
      }

      // Create zap request - use appropriate event format based on kind
      // For addressable events (30000-39999), pass the object to get 'a' tag
      // For all other events, pass the ID string to get 'e' tag
      const event = (target.kind >= 30000 && target.kind < 40000)
        ? target
        : target.id;

      const zapAmount = amount * 1000; // convert to millisats

      const zapRequest = nip57.makeZapRequest({
        profile: target.pubkey,
        event: event,
        amount: zapAmount,
        relays: config.relayMetadata.relays.map(r => r.url),
        comment
      });

      // Sign the zap request (but don't publish to relays - only send to LNURL endpoint)
      if (!user.signer) {
        throw new Error('No signer available');
      }
      const signedZapRequest = await user.signer.signEvent(zapRequest);

      try {
        const zapUrl = new URL(zapEndpoint);
        zapUrl.searchParams.set('amount', String(zapAmount));
        zapUrl.searchParams.set('nostr', JSON.stringify(signedZapRequest));

        const res = await fetch(zapUrl.toString());
        const responseText = await res.text();
        let responseData: { pr?: string; reason?: string } = {};

        try {
          responseData = responseText ? JSON.parse(responseText) : {};
        } catch (parseError) {
          // Some LNURL providers return plain text/html for server errors.
          console.warn('Failed to parse zap callback response as JSON', parseError);
        }

        if (!res.ok) {
          const fallbackReason = responseText.trim() || 'Unknown error';
          throw new Error(`HTTP ${res.status}: ${responseData.reason || fallbackReason}`);
        }

        const newInvoice = responseData.pr;
        if (!newInvoice || typeof newInvoice !== 'string') {
          throw new Error('Lightning service did not return a valid invoice');
        }

        // Get the current active NWC connection dynamically
        const currentNWCConnection = getActiveConnection();

        // Try NWC first if available and properly connected
        if (currentNWCConnection && currentNWCConnection.connectionString && currentNWCConnection.isConnected) {
          try {
            await sendPayment(currentNWCConnection, newInvoice);

            // Clear states immediately on success
            setIsZapping(false);
            setInvoice(null);
            notificationSuccess();

            toast({
              title: 'Zap successful!',
              description: `You sent ${amount} sats via NWC to the author.`,
            });

            // Invalidate zap queries to refresh counts
            queryClient.invalidateQueries({ queryKey: ['zaps'] });

            // Close dialog last to ensure clean state
            onZapSuccess?.();
            return;
          } catch (nwcError) {
            console.error('NWC payment failed, falling back:', nwcError);

            // Show specific NWC error to user for debugging
            const errorMessage = nwcError instanceof Error ? nwcError.message : 'Unknown NWC error';
            toast({
              title: 'NWC payment failed',
              description: `${errorMessage}. Falling back to other payment methods...`,
              variant: 'destructive',
            });
          }
        }

        if (webln) { // Try WebLN next
          try {
            // For native WebLN, we may need to enable it first
            let webLnProvider = webln;
            if (webln.enable && typeof webln.enable === 'function') {
              const enabledProvider = await webln.enable();
              // Some implementations return the provider, others return void
              // Cast to WebLNProvider to handle both cases
              const provider = enabledProvider as WebLNProvider | undefined;
              if (provider) {
                webLnProvider = provider;
              }
            }

            await webLnProvider.sendPayment(newInvoice);

            // Clear states immediately on success
            setIsZapping(false);
            setInvoice(null);
            notificationSuccess();

            toast({
              title: 'Zap successful!',
              description: `You sent ${amount} sats to the author.`,
            });

            // Invalidate zap queries to refresh counts
            queryClient.invalidateQueries({ queryKey: ['zaps'] });

            // Close dialog last to ensure clean state
            onZapSuccess?.();
          } catch (weblnError) {
            console.error('WebLN payment failed, falling back:', weblnError);

            // Show specific WebLN error to user for debugging
            const errorMessage = weblnError instanceof Error ? weblnError.message : 'Unknown WebLN error';
            toast({
              title: 'WebLN payment failed',
              description: `${errorMessage}. Falling back to other payment methods...`,
              variant: 'destructive',
            });

            setInvoice(newInvoice);
            setIsZapping(false);
          }
        } else { // Default - show QR code and manual Lightning URI
          setInvoice(newInvoice);
          setIsZapping(false);
        }
      } catch (err) {
        console.error('Zap error:', err);
        toast({
          title: 'Zap failed',
          description: (err as Error).message,
          variant: 'destructive',
        });
        setIsZapping(false);
      }
    } catch (err) {
      console.error('Zap error:', err);
      toast({
        title: 'Zap failed',
        description: (err as Error).message,
        variant: 'destructive',
      });
      setIsZapping(false);
    }
  };

  const resetInvoice = useCallback(() => {
    setInvoice(null);
  }, []);

  return {
    zap,
    isZapping,
    invoice,
    setInvoice,
    resetInvoice,
  };
}
