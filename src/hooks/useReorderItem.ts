import {
  createContext, useContext, useMemo,
  type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent,
} from 'react';

export interface ReorderContextValue {
  activeId: string | null;
  disabled: boolean;
  nodeRef: (id: string) => (el: HTMLElement | null) => void;
  onHandlePointerDown: (id: string, e: ReactPointerEvent) => void;
  onHandleKeyDown: (id: string, e: ReactKeyboardEvent) => void;
}

export const ReorderContext = createContext<ReorderContextValue | null>(null);

export interface ReorderItem {
  /** Attach to the row: what is measured, cloned for the ghost and animated on settle. */
  setNodeRef: (el: HTMLElement | null) => void;
  /** Spread onto the grip handle (a `<button>`). */
  handleProps: {
    type: 'button';
    'aria-roledescription': string;
    onPointerDown: (e: ReactPointerEvent) => void;
    onKeyDown: (e: ReactKeyboardEvent) => void;
    style: CSSProperties;
  };
  /** This row is the one being dragged (its ghost is following the pointer). */
  isDragging: boolean;
}

const HANDLE_STYLE: CSSProperties = { touchAction: 'none' };

const INERT: ReorderContextValue = {
  activeId: null,
  disabled: true,
  nodeRef: () => () => {},
  onHandlePointerDown: () => {},
  onHandleKeyDown: () => {},
};

/** A row of the enclosing `ReorderList`; inert outside one. */
export function useReorderItem(id: string, { disabled = false }: { disabled?: boolean } = {}): ReorderItem {
  const ctx = useContext(ReorderContext) ?? INERT;
  const { nodeRef, onHandlePointerDown, onHandleKeyDown } = ctx;
  const off = disabled || ctx.disabled;

  const handleProps = useMemo<ReorderItem['handleProps']>(() => ({
    type: 'button',
    'aria-roledescription': 'sortable',
    onPointerDown: (e) => { if (!off) onHandlePointerDown(id, e); },
    onKeyDown: (e) => { if (!off) onHandleKeyDown(id, e); },
    style: HANDLE_STYLE,
  }), [id, off, onHandlePointerDown, onHandleKeyDown]);

  return { setNodeRef: nodeRef(id), handleProps, isDragging: ctx.activeId === id };
}

