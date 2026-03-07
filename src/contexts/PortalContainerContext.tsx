import { createContext, useContext } from 'react';

/**
 * Provides a DOM element for Radix portals (Popover, Tooltip, DropdownMenu, etc.)
 * to render into. When set, portaled content renders inside the container element
 * instead of document.body.
 *
 * This is necessary when a Popover is opened inside a Radix Dialog, because the
 * Dialog's RemoveScroll blocks wheel/touch scroll events on elements outside the
 * Dialog's DOM tree. By portaling into the Dialog's content element, the Popover
 * stays within the RemoveScroll boundary and scrolling works correctly.
 */
const PortalContainerContext = createContext<HTMLElement | undefined>(undefined);

export const PortalContainerProvider = PortalContainerContext.Provider;

export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext);
}
