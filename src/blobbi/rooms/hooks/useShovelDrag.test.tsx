/**
 * useShovelDrag regression tests.
 *
 * The drag lifecycle (move/end) must be owned by window-level listeners,
 * not handlers bound to the shovel button. The button lives in the shell's
 * `children`, which React bails out of re-rendering when drag state changes
 * inside the shell — so button-bound move/end handlers keep stale closures
 * (isDragging = false) and the drag never tracks or completes. This is
 * exactly what broke shoveling on Android/touch while mouse kept working.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { useShovelDrag } from './useShovelDrag';
import type { PoopState } from '../components/BlobbiRoomShell';
import type { PoopInstance } from '../lib/poop-system';

const POOP_ID = 'poop_test_1';

function makeRemovePoopMock() {
  return vi.fn<(poopId: string) => void>();
}

function makeAddPoopMock() {
  return vi.fn<(source?: PoopInstance['source']) => void>();
}

function makePoopState(onRemovePoop = makeRemovePoopMock()): PoopState {
  const poop: PoopInstance = {
    id: POOP_ID,
    room: 'kitchen',
    source: 'time',
    createdAt: Date.now(),
    position: { bottom: 10, left: 8 },
  };
  return { poops: [poop], onRemovePoop, addPoop: makeAddPoopMock() };
}

/** Poop hitbox in client coordinates (mocked getBoundingClientRect). */
const POOP_RECT = { left: 100, right: 140, top: 200, bottom: 240 };

function Harness({ poopState }: { poopState: PoopState }) {
  const drag = useShovelDrag(poopState);
  return (
    <div>
      <button
        data-testid="shovel"
        ref={drag.shovelRef}
        onMouseDown={drag.anyPoop ? drag.onMouseDown : undefined}
        onTouchStart={drag.anyPoop ? drag.onTouchStart : undefined}
      />
      <div
        data-testid="poop"
        ref={(el) => {
          if (el) {
            el.getBoundingClientRect = () => ({
              ...POOP_RECT,
              width: POOP_RECT.right - POOP_RECT.left,
              height: POOP_RECT.bottom - POOP_RECT.top,
              x: POOP_RECT.left,
              y: POOP_RECT.top,
              toJSON: () => ({}),
            } as DOMRect);
            drag.poopRefs.current.set(POOP_ID, el);
          } else {
            drag.poopRefs.current.delete(POOP_ID);
          }
        }}
      />
      <span data-testid="dragging">{String(drag.isDragging)}</span>
    </div>
  );
}

describe('useShovelDrag', () => {
  let onRemovePoop: ReturnType<typeof makeRemovePoopMock>;
  let poopState: PoopState;

  beforeEach(() => {
    onRemovePoop = vi.fn();
    poopState = makePoopState(onRemovePoop);
  });

  it('cleans a poop via touch: window-level touchmove/touchend after touchstart on the button', () => {
    render(<Harness poopState={poopState} />);

    // Touch starts on the button (the only button-bound touch handler)…
    fireEvent.touchStart(screen.getByTestId('shovel'), {
      touches: [{ clientX: 10, clientY: 10 }],
    });
    expect(screen.getByTestId('dragging').textContent).toBe('true');

    // …but move/end fire on window. The button never re-renders mid-drag in
    // the real app, so the hook must not rely on button-bound move/end props.
    fireEvent.touchMove(window, {
      touches: [{ clientX: 120, clientY: 220 }],
    });
    fireEvent.touchEnd(window, {
      changedTouches: [{ clientX: 120, clientY: 220 }],
    });

    expect(onRemovePoop).toHaveBeenCalledWith(POOP_ID);
    expect(screen.getByTestId('dragging').textContent).toBe('false');
  });

  it('does not clean when the touch ends away from the poop', () => {
    render(<Harness poopState={poopState} />);

    fireEvent.touchStart(screen.getByTestId('shovel'), {
      touches: [{ clientX: 10, clientY: 10 }],
    });
    fireEvent.touchMove(window, {
      touches: [{ clientX: 50, clientY: 50 }],
    });
    fireEvent.touchEnd(window, {
      changedTouches: [{ clientX: 50, clientY: 50 }],
    });

    expect(onRemovePoop).not.toHaveBeenCalled();
    expect(screen.getByTestId('dragging').textContent).toBe('false');
  });

  it('aborts without cleaning on touchcancel', () => {
    render(<Harness poopState={poopState} />);

    fireEvent.touchStart(screen.getByTestId('shovel'), {
      touches: [{ clientX: 10, clientY: 10 }],
    });
    // Hovering the poop when the browser cancels the gesture…
    fireEvent.touchMove(window, {
      touches: [{ clientX: 120, clientY: 220 }],
    });
    fireEvent.touchCancel(window, {
      changedTouches: [{ clientX: 120, clientY: 220 }],
    });

    // …must reset the drag without cleaning.
    expect(onRemovePoop).not.toHaveBeenCalled();
    expect(screen.getByTestId('dragging').textContent).toBe('false');
  });

  it('cleans a poop via mouse: window-level mousemove/mouseup after mousedown on the button', () => {
    render(<Harness poopState={poopState} />);

    fireEvent.mouseDown(screen.getByTestId('shovel'), {
      clientX: 10,
      clientY: 10,
    });
    expect(screen.getByTestId('dragging').textContent).toBe('true');

    fireEvent.mouseMove(window, { clientX: 120, clientY: 220 });
    fireEvent.mouseUp(window);

    expect(onRemovePoop).toHaveBeenCalledWith(POOP_ID);
    expect(screen.getByTestId('dragging').textContent).toBe('false');
  });

  it('does not start a drag when there is no poop', () => {
    const empty: PoopState = { poops: [], onRemovePoop, addPoop: makeAddPoopMock() };
    render(<Harness poopState={empty} />);

    fireEvent.touchStart(screen.getByTestId('shovel'), {
      touches: [{ clientX: 10, clientY: 10 }],
    });

    expect(screen.getByTestId('dragging').textContent).toBe('false');
  });
});
