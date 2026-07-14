import { NostrCanvasProvider, useNostrCanvas } from '@soapbox.pub/nostr-canvas/react';
import { RustWorkerPool } from '@soapbox.pub/nostr-canvas';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useEffect, useRef, type ReactNode } from 'react';
import type { Capability } from '@soapbox.pub/nostr-canvas';
import { createCanvasAdapter, type CanvasAdapterServices } from '@/tiles/adapter';
import { CanvasTileInstallationsProvider } from '@/components/CanvasTileInstallationsProvider';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';

export function CanvasRuntimeProvider({ children }: { children: ReactNode }) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const servicesRef = useRef<CanvasAdapterServices | undefined>(undefined);
  const adapterRef = useRef<ReturnType<typeof createCanvasAdapter> | undefined>(undefined);
  const poolRef = useRef<RustWorkerPool | undefined>(undefined);
  const grantDecisionRef = useRef<(identifier: string, declared: Capability[]) => Capability[]>(() => []);
  const storageRef = useRef<Storage | undefined>(undefined);

  servicesRef.current = {
    subscribe: (filter, onEvent) => {
      const controller = new AbortController();
      void (async () => {
        try {
          for await (const message of nostr.req([filter], { signal: controller.signal })) {
            if (message[0] === 'EVENT') onEvent(message[2]);
            if (message[0] === 'CLOSED') break;
          }
        } catch {
          // Aborting a subscription is expected during tile teardown.
        }
      })();
      return () => controller.abort();
    },
    user: user ? { pubkey: user.pubkey } : undefined,
    getPublicKey: async () => {
      if (!user) throw new Error('No user is logged in.');
      return user.pubkey;
    },
    getContacts: async () => {
      if (!user) return [];
      const [contacts] = await nostr.query([{ kinds: [3], authors: [user.pubkey], limit: 1 }]);
      return contacts?.tags.filter(([name]) => name === 'p').map(([, pubkey]) => pubkey).filter((pubkey): pubkey is string => !!pubkey) ?? [];
    },
    publishEvent: async (draft) => publishEvent({ kind: draft.kind, content: draft.content, tags: draft.tags, created_at: draft.created_at }),
    getProfile: (pubkey, callback) => subscribeToProfile(nostr, pubkey, callback),
    nip44Encrypt: async (recipient, plaintext) => {
      if (!user?.signer.nip44) throw new Error('NIP-44 encryption is unavailable.');
      return user.signer.nip44.encrypt(recipient, plaintext);
    },
    nip44Decrypt: async (sender, ciphertext) => {
      if (!user?.signer.nip44) throw new Error('NIP-44 decryption is unavailable.');
      return user.signer.nip44.decrypt(sender, ciphertext);
    },
    fetch: (input, init) => globalThis.fetch(input, init),
    corsProxy: () => config.corsProxy,
    notify: (message, variant) => toast({ title: message, variant: variant === 'danger' ? 'destructive' : 'default' }),
  };

  if (!adapterRef.current) {
    adapterRef.current = createCanvasAdapter({
      subscribe: (filter, onEvent) => servicesRef.current!.subscribe(filter, onEvent),
      user: { pubkey: '' },
      getPublicKey: () => servicesRef.current!.getPublicKey!(),
      getContacts: () => servicesRef.current!.getContacts!(),
      publishEvent: (draft) => servicesRef.current!.publishEvent!(draft),
      getProfile: (pubkey, callback) => servicesRef.current!.getProfile!(pubkey, callback),
      nip44Encrypt: (recipient, plaintext, options) => servicesRef.current!.nip44Encrypt!(recipient, plaintext, options),
      nip44Decrypt: (sender, ciphertext, options) => servicesRef.current!.nip44Decrypt!(sender, ciphertext, options),
      fetch: (input, init) => servicesRef.current!.fetch!(input, init),
      corsProxy: () => servicesRef.current!.corsProxy!(),
      notify: (message, variant) => servicesRef.current!.notify!(message, variant),
    });
  }
  if (!poolRef.current) poolRef.current = RustWorkerPool.createPool();
  if (!storageRef.current) storageRef.current = withoutDefinitionStorage(localStorage);

  useEffect(() => () => poolRef.current?.terminate(), []);

  return <NostrCanvasProvider adapter={adapterRef.current} workerPool={poolRef.current} options={{ storage: storageRef.current, onGrantDecision: (identifier, declared) => grantDecisionRef.current(identifier, declared) }}><CanvasTileInstallationsProvider grantDecisionRef={grantDecisionRef}><CanvasNotifications notify={toast}>{children}</CanvasNotifications></CanvasTileInstallationsProvider></NostrCanvasProvider>;
}

function withoutDefinitionStorage(storage: Storage): Storage {
  const definitionsKey = 'nostr-canvas:tile-defs';
  return {
    get length() { return storage.length; },
    clear: () => storage.clear(),
    key: (index) => storage.key(index),
    getItem: (key) => key === definitionsKey ? null : storage.getItem(key),
    setItem: (key, value) => { if (key !== definitionsKey) storage.setItem(key, value); },
    removeItem: (key) => { if (key !== definitionsKey) storage.removeItem(key); },
  };
}

function CanvasNotifications({ children, notify }: { children: ReactNode; notify: ReturnType<typeof useToast>['toast'] }) {
  const { runtime } = useNostrCanvas();
  useEffect(() => runtime.on('notify', ({ message, variant }) => notify({ title: message, variant: variant === 'danger' ? 'destructive' : 'default' })), [runtime, notify]);
  return <>{children}</>;
}

function subscribeToProfile(nostr: ReturnType<typeof useNostr>['nostr'], pubkey: string, callback: (pubkey: string, profile: Record<string, string | undefined>) => void) {
  const controller = new AbortController();
  const handle = (event: NostrEvent) => {
    try {
      const parsed: unknown = JSON.parse(event.content);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
      const profile = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
      callback(pubkey, profile);
    } catch {
      // Invalid profile metadata is ignored.
    }
  };
  void nostr.query([{ kinds: [0], authors: [pubkey], limit: 1 }], { signal: controller.signal }).then(([event]) => event && handle(event)).catch(() => {});
  void (async () => {
    try {
      for await (const message of nostr.req([{ kinds: [0], authors: [pubkey] }], { signal: controller.signal })) {
        if (message[0] === 'EVENT') handle(message[2]);
        if (message[0] === 'CLOSED') break;
      }
    } catch {
      // Aborting the subscription is expected during tile teardown.
    }
  })();
  return () => controller.abort();
}
