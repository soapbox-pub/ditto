/* eslint-disable react-refresh/only-export-components -- the provider, activation gate, and consumer hooks form one Canvas boundary */
import { NostrCanvasProvider, useNostrCanvas } from '@soapbox.pub/nostr-canvas/react';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Capability, GrantBackend, TileRuntime } from '@soapbox.pub/nostr-canvas';
import { createCanvasAdapter, type CanvasAdapter, type CanvasAdapterServices } from '@/tiles/adapter';
import { canvasNavigateTo } from '@/lib/canvasNavigateRef';
import { CanvasTileInstallationsProvider } from '@/components/CanvasTileInstallationsProvider';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { useUploadFile } from '@/hooks/useUploadFile';
import { Skeleton } from '@/components/ui/skeleton';

// The worker resolves its wasm binary relative to its own script URL by
// default, which breaks once Vite emits the worker as a hashed chunk without
// the neighboring .wasm file. The package's exports map doesn't expose the
// wasm as a subpath, so reference it through node_modules directly — Vite's
// `new URL(…, import.meta.url)` asset handling emits (and hashes) it in
// production and serves it from node_modules in dev, keeping the binary in
// lockstep with the installed package version.
const WASM_URL = new URL(
  '../../node_modules/@soapbox.pub/nostr-canvas/dist/worker/nostr_canvas_core_bg.wasm',
  import.meta.url,
).href;

// ── Optional runtime context ─────────────────────────────────────────────────
// Allows components on general pages (where the provider stack may be absent)
// to access the TileRuntime without throwing.

const OptionalCanvasRuntimeContext = createContext<TileRuntime | null>(null);

/** Returns the `TileRuntime` from the nearest active provider, or `null` when Canvas is inactive. */
export function useOptionalCanvasRuntime(): TileRuntime | null {
  return useContext(OptionalCanvasRuntimeContext);
}

// ── Activation gate ──────────────────────────────────────────────────────────

interface Activation {
  active: boolean;
  activate: () => void;
}

const ActivationContext = createContext<Activation | undefined>(undefined);

export function useCanvasActivation(): Activation {
  const ctx = useContext(ActivationContext);
  if (!ctx) throw new Error('useCanvasActivation must be used inside CanvasRuntimeProvider');
  return ctx;
}

// ── Bridge component: reads useNostrCanvas.runtime → OptionalCanvasRuntimeContext ──

function OptionalCanvasRuntimeBridge({ children }: { children: ReactNode }) {
  const { runtime } = useNostrCanvas();
  return (
    <OptionalCanvasRuntimeContext.Provider value={runtime ?? null}>
      {children}
    </OptionalCanvasRuntimeContext.Provider>
  );
}

// ── RequireCanvas wrapper ────────────────────────────────────────────────────
/** Activates the Canvas runtime on mount, rendering children only once active. */
export function RequireCanvas({ children }: { children: ReactNode }) {
  const { active, activate } = useCanvasActivation();

  useEffect(() => {
    if (!active) activate();
  }, [active, activate]);

  if (!active) {
    return <Skeleton className="h-72 rounded-xl" />;
  }

  return <>{children}</>;
}

// ── Main provider ────────────────────────────────────────────────────────────

export function CanvasRuntimeProvider({ children }: { children: ReactNode }) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const uploadFile = useUploadFile();
  const servicesRef = useRef<CanvasAdapterServices | undefined>(undefined);
  const adapterRef = useRef<CanvasAdapter | undefined>(undefined);
  const grantBackendRef = useRef<GrantBackend>({ get: () => undefined, set: () => {}, delete: () => {} });
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
    uploadImage: async (options) => {
      if (!user) throw new Error('Must be logged in to upload files.');
      const signal = options?.signal;
      const file = await pickFileFromUser(signal);
      if (signal?.aborted) throw new Error('Upload cancelled');
      const tags = await uploadFile.mutateAsync(file);
      return tags[0][1];
    },
    openPath: (path) => canvasNavigateTo(path),
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
      uploadImage: (options) => servicesRef.current!.uploadImage!(options),
      openPath: (path) => servicesRef.current!.openPath!(path),
    });
  }
  if (!storageRef.current) storageRef.current = withoutDefinitionStorage(localStorage);

  const grantBackend: GrantBackend = useMemo(() => ({
    get(identifier: string) { return grantBackendRef.current.get(identifier); },
    set(identifier: string, caps: Capability[]) { grantBackendRef.current.set(identifier, caps); },
    delete(identifier: string) { grantBackendRef.current.delete(identifier); },
  }), []);

  // ── Activation gate ──────────────────────────────────────────────────────
  const [demanded, setDemanded] = useState(false);
  const active = demanded || config.installedCanvasTiles.length > 0;
  const activate = useCallback(() => setDemanded(true), []);
  const activation: Activation = useMemo(() => ({ active, activate }), [active, activate]);

  // The two branches intentionally differ in shape, so the whole child tree
  // remounts when `active` flips. That flip happens at most once per session,
  // adjacent to already-disruptive moments (first visit to a tile page, or
  // login-time settings sync), and never flips back.
  if (!active) {
    return (
      <ActivationContext.Provider value={activation}>
        <OptionalCanvasRuntimeContext.Provider value={null}>
          {children}
        </OptionalCanvasRuntimeContext.Provider>
      </ActivationContext.Provider>
    );
  }

  return (
    <ActivationContext.Provider value={activation}>
      <NostrCanvasProvider adapter={adapterRef.current} options={{ storage: storageRef.current, grantBackend, wasmUrl: WASM_URL }}>
        <OptionalCanvasRuntimeBridge>
          <CanvasTileInstallationsProvider grantBackendRef={grantBackendRef}>
            <CanvasNotifications notify={toast}>
              {children}
            </CanvasNotifications>
          </CanvasTileInstallationsProvider>
        </OptionalCanvasRuntimeBridge>
      </NostrCanvasProvider>
    </ActivationContext.Provider>
  );
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
  useEffect(() => {
    if (!runtime) return;
    return runtime.on('notify', ({ message, variant }) => notify({ title: message, variant: variant === 'danger' ? 'destructive' : 'default' }));
  }, [runtime, notify]);
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

/** Open a browser file picker and resolve with the chosen File, or reject if dismissed or aborted. */
function pickFileFromUser(signal?: AbortSignal): Promise<File> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    const abortHandler = () => {
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
      cleanup();
    };

    const cancelHandler = () => {
      reject(new Error('No file selected'));
      cleanup();
    };

    const changeHandler = () => {
      const file = input.files?.[0];
      if (file) {
        resolve(file);
      } else {
        cancelHandler();
      }
      cleanup();
    };

    const cleanup = () => {
      signal?.removeEventListener('abort', abortHandler);
      input.removeEventListener('change', changeHandler);
      input.removeEventListener('cancel', cancelHandler);
      input.remove();
    };

    signal?.addEventListener('abort', abortHandler, { once: true });
    input.addEventListener('change', changeHandler);
    input.addEventListener('cancel', cancelHandler);
    input.click();
  });
}
