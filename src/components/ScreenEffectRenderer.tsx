import { useScreenEffect } from '@/contexts/ScreenEffectContext';
import { PrecipitationEffect } from '@/components/PrecipitationEffect';

/**
 * Reads the global screen effect state and renders the appropriate overlay.
 * Must be placed inside a ScreenEffectProvider.
 */
export function ScreenEffectRenderer() {
  const { screenEffect } = useScreenEffect();

  if (!screenEffect) return null;

  switch (screenEffect.type) {
    case 'rain':
    case 'snow':
      return <PrecipitationEffect type={screenEffect.type} intensity={screenEffect.intensity} />;
    default:
      return null;
  }
}
