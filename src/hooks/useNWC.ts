import { useState, useCallback } from 'react';
import { useIntl } from 'react-intl';
import { useSecureLocalStorage } from '@/hooks/useSecureLocalStorage';
import { useToast } from '@/hooks/useToast';
import { LN, nwc } from '@getalby/sdk';
import { assertInvoiceAmount } from '@/lib/bolt11';

/**
 * The wallet received a payment request but never answered it. Unlike other
 * failures this is not a verdict: the payment may yet succeed, so the invoice
 * must not be paid again by any route until the user has checked their wallet.
 */
export class NWCPaymentPendingError extends Error {
  constructor() {
    super('Your wallet has not confirmed the payment yet');
    this.name = 'NWCPaymentPendingError';
  }
}

export interface NWCConnection {
  connectionString: string;
  alias?: string;
  isConnected: boolean;
  client?: LN;
}

export interface NWCInfo {
  alias?: string;
  color?: string;
  pubkey?: string;
  network?: string;
  methods?: string[];
  notifications?: string[];
}

export function useNWCInternal(userPubkey?: string) {
  const intl = useIntl();
  const { toast } = useToast();
  // Scope wallet connections per user so switching accounts doesn't leak wallets.
  // When no user is logged in, use a 'global' fallback key (connections won't
  // be accessible without a user anyway since zap actions require login).
  const storagePrefix = userPubkey ? `nwc-connections:${userPubkey}` : 'nwc-connections';
  const activePrefix = userPubkey ? `nwc-active-connection:${userPubkey}` : 'nwc-active-connection';
  // NWC connection strings embed a secret that authorizes Lightning payments,
  // so on native platforms we store them in Keychain/KeyStore via secureStorage
  // rather than plaintext localStorage. On web the behavior matches the
  // previous useLocalStorage implementation (plaintext localStorage).
  const [connections, setConnections] = useSecureLocalStorage<NWCConnection[]>(storagePrefix, []);
  const [activeConnection, setActiveConnection] = useSecureLocalStorage<string | null>(activePrefix, null);
  const [connectionInfo, setConnectionInfo] = useState<Record<string, NWCInfo>>({});

  // Add new connection
  const addConnection = async (uri: string, alias?: string): Promise<boolean> => {
    const parseNWCUri = (uri: string): { connectionString: string } | null => {
      try {
        if (!uri.startsWith('nostr+walletconnect://') && !uri.startsWith('nostrwalletconnect://')) {
          // Don't log the input: a misplaced secret would end up in logs.
          console.error('Invalid NWC URI protocol');
          return null;
        }
        return { connectionString: uri };
      } catch (error) {
        console.error('Failed to parse NWC URI:', error);
        return null;
      }
    };

    const parsed = parseNWCUri(uri);
    if (!parsed) {
      toast({
        title: intl.formatMessage({ id: 'nwc.toast.invalidUriTitle', defaultMessage: 'Invalid NWC URI' }),
        description: intl.formatMessage({ id: 'nwc.toast.invalidUri', defaultMessage: 'Please check the connection string and try again.' }),
        variant: 'destructive',
      });
      return false;
    }

    const existingConnection = connections.find(c => c.connectionString === parsed.connectionString);
    if (existingConnection) {
      toast({
        title: intl.formatMessage({ id: 'nwc.toast.duplicateTitle', defaultMessage: 'Connection already exists' }),
        description: intl.formatMessage({ id: 'nwc.toast.duplicate', defaultMessage: 'This wallet is already connected.' }),
        variant: 'destructive',
      });
      return false;
    }

    try {
      let timeoutId: NodeJS.Timeout | undefined;
      const testPromise = new Promise((resolve, reject) => {
        try {
          const client = new LN(parsed.connectionString);
          resolve(client);
        } catch (error) {
          reject(error);
        }
      });
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(intl.formatMessage({ id: 'nwc.error.connectionTimeout', defaultMessage: 'Connection test timeout' }))),
          10000,
        );
      });

      try {
        await Promise.race([testPromise, timeoutPromise]) as LN;
        if (timeoutId) clearTimeout(timeoutId);
      } catch (error) {
        if (timeoutId) clearTimeout(timeoutId);
        throw error;
      }

      const connection: NWCConnection = {
        connectionString: parsed.connectionString,
        alias: alias || 'NWC Wallet',
        isConnected: true,
      };

      setConnectionInfo(prev => ({
        ...prev,
        [parsed.connectionString]: {
          alias: connection.alias,
          methods: ['pay_invoice'],
        },
      }));

      const newConnections = [...connections, connection];
      setConnections(newConnections);

      if (connections.length === 0 || !activeConnection)
        setActiveConnection(parsed.connectionString);

      toast({
        title: intl.formatMessage({ id: 'nwc.toast.connectedTitle', defaultMessage: 'Wallet connected' }),
        description: intl.formatMessage(
          { id: 'nwc.toast.connected', defaultMessage: 'Successfully connected to {alias}.' },
          { alias: connection.alias },
        ),
      });

      return true;
    } catch (error) {
      console.error('NWC connection failed:', error);
      const errorMessage = error instanceof Error
        ? error.message
        : intl.formatMessage({ id: 'nwc.error.unknownOccurred', defaultMessage: 'Unknown error occurred' });

      toast({
        title: intl.formatMessage({ id: 'nwc.toast.connectFailedTitle', defaultMessage: 'Connection failed' }),
        description: intl.formatMessage(
          { id: 'nwc.toast.connectFailed', defaultMessage: 'Could not connect to the wallet: {error}' },
          { error: errorMessage },
        ),
        variant: 'destructive',
      });
      return false;
    }
  };

  // Remove connection
  const removeConnection = (connectionString: string) => {
    const filtered = connections.filter(c => c.connectionString !== connectionString);
    setConnections(filtered);

    if (activeConnection === connectionString) {
      const newActive = filtered.length > 0 ? filtered[0].connectionString : null;
      setActiveConnection(newActive);
    }

    setConnectionInfo(prev => {
      const newInfo = { ...prev };
      delete newInfo[connectionString];
      return newInfo;
    });

    toast({
      title: intl.formatMessage({ id: 'nwc.toast.disconnectedTitle', defaultMessage: 'Wallet disconnected' }),
      description: intl.formatMessage({ id: 'nwc.toast.disconnected', defaultMessage: 'The wallet connection has been removed.' }),
    });
  };

  // Get active connection
  const getActiveConnection = useCallback((): NWCConnection | null => {
    if (!activeConnection && connections.length > 0) {
      setActiveConnection(connections[0].connectionString);
      return connections[0];
    }

    if (!activeConnection) return null;

    const found = connections.find(c => c.connectionString === activeConnection);
    return found || null;
  }, [activeConnection, connections, setActiveConnection]);

  // Send payment using the SDK
  const sendPayment = useCallback(async (
    connection: NWCConnection,
    invoice: string,
    /**
     * Amount in millisatoshis the user approved. The wallet is handed only the
     * invoice, so this is the last point at which the sum the user agreed to
     * and the sum the invoice charges can be compared — without it, whoever
     * issued the invoice decides how much leaves the wallet.
     */
    expectedAmountMsat: number,
  ): Promise<{ preimage: string }> => {
    if (!connection.connectionString) {
      throw new Error('Invalid connection: missing connection string');
    }

    assertInvoiceAmount(invoice, expectedAmountMsat);

    let client: LN;
    try {
      client = new LN(connection.connectionString);
    } catch (error) {
      console.error('Failed to create NWC client:', error);
      throw new Error(intl.formatMessage(
        { id: 'nwc.error.createClient', defaultMessage: 'Failed to create NWC client: {error}' },
        { error: error instanceof Error ? error.message : intl.formatMessage({ id: 'zaps.error.unknown', defaultMessage: 'Unknown error' }) },
      ));
    }

    // No timeout of our own: the SDK gives up on publishing after 5 s and on
    // the wallet's reply after 60 s. A shorter cutoff here abandoned payments
    // the wallet was still routing, so the caller went on to submit the same
    // invoice again and the wallet refused it as a duplicate.
    try {
      return await client.pay(invoice);
    } catch (error) {
      console.error('NWC payment failed:', error);

      // The request reached the wallet but no answer came back. The payment
      // may still be in flight, so it must not be retried or re-submitted.
      if (error instanceof nwc.Nip47ReplyTimeoutError) {
        throw new NWCPaymentPendingError();
      }

      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          throw new Error(intl.formatMessage({ id: 'nwc.error.timeout', defaultMessage: 'Payment timed out. Please try again.' }));
        } else if (error.message.includes('insufficient')) {
          throw new Error(intl.formatMessage({ id: 'nwc.error.insufficient', defaultMessage: 'Insufficient balance in connected wallet.' }));
        } else if (error.message.includes('invalid')) {
          throw new Error(intl.formatMessage({ id: 'nwc.error.invalid', defaultMessage: 'Invalid invoice or connection. Please check your wallet.' }));
        } else {
          throw new Error(intl.formatMessage(
            { id: 'nwc.error.paymentFailed', defaultMessage: 'Payment failed: {error}' },
            { error: error.message },
          ));
        }
      }

      throw new Error(intl.formatMessage({ id: 'nwc.error.paymentFailedUnknown', defaultMessage: 'Payment failed with unknown error' }));
    } finally {
      client.close();
    }
  }, [intl]);

  return {
    connections,
    activeConnection,
    connectionInfo,
    addConnection,
    removeConnection,
    setActiveConnection,
    getActiveConnection,
    sendPayment,
  };
}