import { createContext, useContext } from 'react';

/**
 * Context that signals a component is being rendered inside a sidebar widget.
 * Pages check `useIsWidget()` to skip PageHeader and useLayoutOptions calls.
 */
const WidgetContext = createContext(false);

/** Returns true when the calling component is rendered inside a sidebar widget. */
export function useIsWidget(): boolean {
  return useContext(WidgetContext);
}

export { WidgetContext };
