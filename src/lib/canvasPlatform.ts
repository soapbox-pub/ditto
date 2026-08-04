import { Capacitor } from '@capacitor/core';

/** Canvas workers are currently supported in browsers only. */
export function canUseCanvasTiles(): boolean {
  return !Capacitor.isNativePlatform();
}
