import { lazy, useState, type ComponentType } from 'react';

/**
 * `React.lazy` with a `preload()` that loads the component ahead of time.
 *
 * Preloading `React.lazy`'s own import isn't enough: a lazy component that
 * has never rendered still suspends on its first render even when its module
 * is already loaded, so the route's Suspense fallback flashes anyway. Once
 * `preload()` has finished, this renders the loaded component directly.
 *
 * Each mount picks one of the two and keeps it, so a preload finishing while
 * the lazy version is on screen never remounts the page.
 */
export function lazyWithPreload<P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>,
): ComponentType<P> & { preload: () => Promise<unknown> } {
  let loaded: ComponentType<P> | undefined;
  let pending: Promise<{ default: ComponentType<P> }> | undefined;

  const preload = () => {
    pending ??= load().then(
      (module) => {
        loaded = module.default;
        return module;
      },
      (error: unknown) => {
        // Let a later render or preload try again.
        pending = undefined;
        throw error;
      },
    );
    return pending;
  };

  const Lazy = lazy(preload);

  function Preloadable(props: P) {
    const [Component] = useState<ComponentType<P>>(() => loaded ?? Lazy);
    return <Component {...props} />;
  }

  return Object.assign(Preloadable, { preload });
}
