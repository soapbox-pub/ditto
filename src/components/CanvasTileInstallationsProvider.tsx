/* eslint-disable react-refresh/only-export-components -- the provider and its required consumer hook form one Canvas boundary */
import { createContext, useContext, useEffect, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useNostr } from '@nostrify/react';
import { parseTileDefEvent, type GrantBackend } from '@soapbox.pub/nostr-canvas';
import { useNostrCanvas } from '@soapbox.pub/nostr-canvas/react';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { CanvasTileInstallations } from '@/tiles/installations';

const CanvasTileInstallationsContext = createContext<CanvasTileInstallations | undefined>(undefined);

export function CanvasTileInstallationsProvider({ children, grantBackendRef }: { children: ReactNode; grantBackendRef: MutableRefObject<GrantBackend> }) {
  const { runtime } = useNostrCanvas();
  const { nostr } = useNostr();
  const { config, updateConfig } = useAppContext();
  const { user } = useCurrentUser();
  const { updateSettings } = useEncryptedSettings();
  const currentRef = useRef({ user, updateConfig, updateSettings });
  currentRef.current = { user, updateConfig, updateSettings };
  const installationsRef = useRef<CanvasTileInstallations | undefined>(undefined);

  if (!installationsRef.current) {
    installationsRef.current = new CanvasTileInstallations({
      storage: localStorage,
      runtime: {
        registerFromEvent: (event) => {
          if (!runtime) return;
          const parsed = parseTileDefEvent(event);
          if (parsed) runtime.registerFromEvent(parsed);
        },
        uninstallTile: (identifier) => runtime?.uninstallTile(identifier),
        setScope: (pubkey) => runtime?.setScope(pubkey),
        saveSettings: (identifier, values) => runtime?.saveSettings(identifier, values),
      },
      saveCoordinates: (coordinates) => {
        const current = currentRef.current;
        current.updateConfig((existing) => ({ ...existing, installedCanvasTiles: coordinates }));
        if (current.user) current.updateSettings.mutateAsync({ installedCanvasTiles: coordinates }).catch(() => {});
      },
      saveTileSettings: (settings) => {
        const current = currentRef.current;
        current.updateConfig((existing) => ({ ...existing, canvasTileSettings: settings }));
        if (current.user) current.updateSettings.mutateAsync({ canvasTileSettings: settings }).catch(() => {});
      },
      fetchDefinition: (filter) => nostr.query([filter]),
    });
  }

  const installations = installationsRef.current;
  grantBackendRef.current = {
    get: (identifier) => installations.getStoredGrants(identifier),
    set: () => {},
    delete: () => {},
  };

  useEffect(() => {
    installations.setAccount(user?.pubkey ?? null);
    void installations.restore(user ? config.installedCanvasTiles : [], user ? config.canvasTileSettings : []);
  }, [installations, user, config.installedCanvasTiles, config.canvasTileSettings]);

  return <CanvasTileInstallationsContext.Provider value={installations}>{children}</CanvasTileInstallationsContext.Provider>;
}

export function useCanvasTileInstallations(): CanvasTileInstallations {
  const installations = useContext(CanvasTileInstallationsContext);
  if (!installations) throw new Error('useCanvasTileInstallations must be used inside CanvasTileInstallationsProvider');
  return installations;
}
